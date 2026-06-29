/**
 * MGS Sports Day Cloud Functions — the ONLY code that writes scored data.
 * Everything funnels through here so standings can never be forged from a browser.
 */

import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createHash } from 'node:crypto';
import { recordDoScore } from '@mgs/scoring';
import type { Contest, ContestVersion, RecordDoc, Submission, SubmissionClarification } from '@mgs/config-types';
import {
  db,
  REGION,
  requireAdmin,
  requireAuth,
  actorName,
  validatePlacements,
  writeAudit,
  recompute,
} from './shared';

setGlobalOptions({ region: REGION, maxInstances: 10 });

export { seedSeason, publishSchedule } from './seed';

const DEFAULT_SEASON = '2026';
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

// ---------------------------------------------------------------------------
// Commit / correct a contest (the gate). New contest -> commit; existing -> correct.
// ---------------------------------------------------------------------------
export const commitContest = onCall(async (req: CallableRequest) => {
  const uid = requireAdmin(req);
  const name = actorName(req);
  const seasonId = str(req.data?.seasonId, DEFAULT_SEASON);
  const contestId = str(req.data?.contestId);
  const reason = str(req.data?.reason);
  const expectedVersion = req.data?.expectedVersion;
  const placements = validatePlacements(req.data?.placements);
  if (!contestId) throw new HttpsError('invalid-argument', 'contestId required');

  const contestRef = db.doc(`seasons/${seasonId}/contests/${contestId}`);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(contestRef);
    if (!snap.exists) throw new HttpsError('not-found', `contest ${contestId} not found`);
    const before = snap.data() as Contest;

    if (typeof expectedVersion === 'number' && before.version !== expectedVersion) {
      throw new HttpsError('aborted', 'This contest changed since you opened it — reload and retry.');
    }
    const wasCommitted = before.status === 'committed';
    if (wasCommitted && !reason) throw new HttpsError('invalid-argument', 'A correction needs a reason.');

    const action = wasCommitted ? ('correct' as const) : ('commit' as const);
    const newVersion = (before.version ?? 0) + 1;
    const committedAt = Date.now();

    const updated: Contest = {
      ...before,
      status: 'committed',
      version: newVersion,
      placements,
      committedBy: uid,
      committedAt,
      voidReason: null,
    };
    tx.set(contestRef, updated);

    const versionDoc: ContestVersion = {
      version: newVersion,
      placements,
      committedBy: uid,
      committedAt,
      reason: reason || (wasCommitted ? 'correction' : 'initial commit'),
    };
    tx.set(contestRef.collection('versions').doc(String(newVersion)), versionDoc);

    return { action, newVersion, before };
  });

  await writeAudit(result.action, `contests/${contestId}`, result.before, { placements }, uid, name, reason || result.action);

  // Resolve any outstanding submissions for this contest (single-field query, no composite index).
  // This runs AFTER the contest transaction (the commit + scoring is already durable); it only
  // tidies the review queue, so a failure here must NOT fail the commit — surface a warning so the
  // operator knows to glance at the queue, but the result is safely scored regardless.
  let submissionWarning: string | undefined;
  try {
    const subs = await db.collection('submissions').where('contestId', '==', contestId).get();
    if (!subs.empty) {
      const batch = db.batch();
      let touched = false;
      subs.forEach((s) => {
        // Only resolve submissions belonging to this season (dry-run isolation; legacy = live).
        if ((s.get('seasonId') ?? DEFAULT_SEASON) !== seasonId) return;
        const st = s.get('status');
        if (st === 'pending') {
          batch.update(s.ref, { status: 'committed' });
          touched = true;
        } else if (st === 'clarify') {
          // A sent-back submission is moot once the contest is committed — close it out
          // and drop its now-stale question so it never re-surfaces on the prefect's phone.
          batch.update(s.ref, { status: 'superseded', clarification: null });
          touched = true;
        }
      });
      if (touched) await batch.commit();
    }
  } catch (e) {
    console.error(`commitContest(${contestId}): post-commit submission cleanup failed`, e);
    submissionWarning = 'Result committed, but its queue entries may not have cleared — refresh the queue.';
  }

  await recompute(seasonId);
  return { ok: true, version: result.newVersion, action: result.action, submissionWarning };
});

// ---------------------------------------------------------------------------
// Void / unvoid a contest (excludes/includes it from scoring; never deletes).
// ---------------------------------------------------------------------------
export const voidContest = onCall(async (req: CallableRequest) => {
  const uid = requireAdmin(req);
  const name = actorName(req);
  const seasonId = str(req.data?.seasonId, DEFAULT_SEASON);
  const contestId = str(req.data?.contestId);
  const reason = str(req.data?.reason);
  const expectedVersion = req.data?.expectedVersion;
  if (!contestId) throw new HttpsError('invalid-argument', 'contestId required');
  if (!reason) throw new HttpsError('invalid-argument', 'A void needs a reason.');

  const ref = db.doc(`seasons/${seasonId}/contests/${contestId}`);
  // Read + version-check + write atomically so a void can't silently stomp an in-flight
  // correction from another tent laptop (same optimistic-concurrency guard as commitContest).
  const before = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'contest not found');
    const b = snap.data() as Contest;
    if (typeof expectedVersion === 'number' && b.version !== expectedVersion) {
      throw new HttpsError('aborted', 'This contest changed since you opened it — reload and retry.');
    }
    tx.update(ref, { status: 'void', voidReason: reason });
    return b;
  });
  await writeAudit('void', `contests/${contestId}`, before, { status: 'void', voidReason: reason }, uid, name, reason);
  await recompute(seasonId);
  return { ok: true };
});

export const unvoidContest = onCall(async (req: CallableRequest) => {
  const uid = requireAdmin(req);
  const name = actorName(req);
  const seasonId = str(req.data?.seasonId, DEFAULT_SEASON);
  const contestId = str(req.data?.contestId);
  const expectedVersion = req.data?.expectedVersion;
  if (!contestId) throw new HttpsError('invalid-argument', 'contestId required');

  const ref = db.doc(`seasons/${seasonId}/contests/${contestId}`);
  const { before, restored } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'contest not found');
    const b = snap.data() as Contest;
    if (typeof expectedVersion === 'number' && b.version !== expectedVersion) {
      throw new HttpsError('aborted', 'This contest changed since you opened it — reload and retry.');
    }
    const status = (b.placements?.length ?? 0) > 0 ? 'committed' : 'outstanding';
    tx.update(ref, { status, voidReason: null });
    return { before: b, restored: status };
  });
  await writeAudit('unvoid', `contests/${contestId}`, before, { status: restored }, uid, name, 'unvoid');
  await recompute(seasonId);
  return { ok: true, status: restored };
});

// ---------------------------------------------------------------------------
// Send a submission back to its prefect for clarification. Marks it 'clarify' with
// the admin's question; the prefect's entry app surfaces it and a resubmit (same
// device + contest) overwrites the doc back to 'pending', re-queuing it for review.
// ---------------------------------------------------------------------------
export const requestClarification = onCall(async (req: CallableRequest) => {
  const uid = requireAdmin(req);
  const name = actorName(req);
  const seasonId = str(req.data?.seasonId, DEFAULT_SEASON);
  const submissionId = str(req.data?.submissionId);
  const message = str(req.data?.message).trim().slice(0, 280);
  if (!submissionId) throw new HttpsError('invalid-argument', 'submissionId required');
  if (!message) throw new HttpsError('invalid-argument', 'A clarification needs a question for the prefect.');

  const ref = db.doc(`submissions/${submissionId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'submission not found');
  const before = snap.data() as Submission;
  if ((before.seasonId ?? DEFAULT_SEASON) !== seasonId) {
    throw new HttpsError('failed-precondition', 'submission belongs to a different season');
  }
  if (before.status !== 'pending' && before.status !== 'clarify') {
    throw new HttpsError('failed-precondition', 'Only an outstanding submission can be sent back.');
  }

  const clarification: SubmissionClarification = { message, byUid: uid, byName: name, at: Date.now() };
  await ref.update({ status: 'clarify', clarification });
  await writeAudit('clarify', `submissions/${submissionId}`, before, { status: 'clarify', clarification }, uid, name, message);
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Delete (discard) a prefect submission — a junk / duplicate / mistaken entry. Marks it
// 'rejected' so it leaves the review queue. NEVER hard-deletes: fully reversible via
// restoreSubmission, and the prefect can also just resubmit (rules allow rejected -> pending),
// so the contest is never permanently locked. Only an outstanding submission can be deleted.
// ---------------------------------------------------------------------------
export const discardSubmission = onCall(async (req: CallableRequest) => {
  const uid = requireAdmin(req);
  const name = actorName(req);
  const seasonId = str(req.data?.seasonId, DEFAULT_SEASON);
  const submissionId = str(req.data?.submissionId);
  const reason = str(req.data?.reason).trim().slice(0, 280);
  if (!submissionId) throw new HttpsError('invalid-argument', 'submissionId required');
  if (!reason) throw new HttpsError('invalid-argument', 'A delete needs a reason for the audit log.');

  const ref = db.doc(`submissions/${submissionId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'submission not found');
  const before = snap.data() as Submission;
  if ((before.seasonId ?? DEFAULT_SEASON) !== seasonId) {
    throw new HttpsError('failed-precondition', 'submission belongs to a different season');
  }
  if (before.status !== 'pending' && before.status !== 'clarify') {
    throw new HttpsError('failed-precondition', 'Only an outstanding submission can be deleted.');
  }
  await ref.update({ status: 'rejected', clarification: null });
  await writeAudit('reject', `submissions/${submissionId}`, before, { status: 'rejected' }, uid, name, reason);
  return { ok: true };
});

// Restore a deleted (rejected) submission back into the review queue.
export const restoreSubmission = onCall(async (req: CallableRequest) => {
  const uid = requireAdmin(req);
  const name = actorName(req);
  const seasonId = str(req.data?.seasonId, DEFAULT_SEASON);
  const submissionId = str(req.data?.submissionId);
  if (!submissionId) throw new HttpsError('invalid-argument', 'submissionId required');

  const ref = db.doc(`submissions/${submissionId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'submission not found');
  const before = snap.data() as Submission;
  if ((before.seasonId ?? DEFAULT_SEASON) !== seasonId) {
    throw new HttpsError('failed-precondition', 'submission belongs to a different season');
  }
  if (before.status !== 'rejected') {
    throw new HttpsError('failed-precondition', 'Only a deleted submission can be restored.');
  }
  await ref.update({ status: 'pending' });
  await writeAudit('restore', `submissions/${submissionId}`, before, { status: 'pending' }, uid, name, 'restore');
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Record entry — set this year's best mark; computes the doScore bonus + recompute.
// ---------------------------------------------------------------------------
export const recordEntry = onCall(async (req: CallableRequest) => {
  const uid = requireAdmin(req);
  const name = actorName(req);
  const seasonId = str(req.data?.seasonId, DEFAULT_SEASON);
  const recordId = str(req.data?.recordId);
  if (!recordId) throw new HttpsError('invalid-argument', 'recordId required');

  const rawScore = req.data?.currentScore;
  const currentScore = rawScore === null || rawScore === undefined || rawScore === '' ? null : Number(rawScore);
  if (currentScore !== null && !Number.isFinite(currentScore)) {
    throw new HttpsError('invalid-argument', 'currentScore must be a number');
  }
  const currentForm = currentScore === null ? null : str(req.data?.currentForm) || null;
  const keepBest = req.data?.keepBest === true;

  const ref = db.doc(`seasons/${seasonId}/records/${recordId}`);

  // The read → keepBest decision → write MUST be atomic: two laptops committing the A and B
  // races of the same event both call this with keepBest, and a non-transactional read could
  // let the slower mark's write clobber the faster one (lost update). A transaction serialises
  // them and retries on contention, so the comparison always runs against fresh data and the
  // genuinely-best mark wins.
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'record not found');
    const rec = snap.data() as RecordDoc;

    // keepBest mode (used by the commit-a-result flow): only replace this year's mark if the
    // new one is genuinely better, and never clear an existing mark with a blank — so
    // committing the B race can't overwrite a faster A-race mark for the same event.
    let nextScore = currentScore;
    let nextForm = currentForm;
    let changed = true;
    if (keepBest) {
      if (currentScore === null) {
        changed = false;
      } else if (rec.currentScore !== null) {
        const better = rec.units === 'second' ? currentScore < rec.currentScore : currentScore > rec.currentScore;
        if (!better) {
          nextScore = rec.currentScore;
          nextForm = rec.currentForm;
          changed = false;
        }
      }
    }

    const updated: RecordDoc = {
      ...rec,
      currentScore: nextScore,
      currentForm: nextForm,
      currentYear: Number(seasonId) || rec.currentYear,
    };
    updated.doScore = recordDoScore(updated);
    if (changed) tx.set(ref, updated);
    return { changed, rec, updated };
  });

  if (result.changed) {
    await writeAudit('record', `records/${recordId}`, result.rec, result.updated, uid, name, `record entry ${recordId}`);
    await recompute(seasonId);
  }

  return {
    ok: true,
    changed: result.changed,
    doScore: result.updated.doScore,
    kind: result.updated.doScore === 2 ? 'beat' : result.updated.doScore === 1 ? 'equal' : 'none',
  };
});

// ---------------------------------------------------------------------------
// Manual recompute (used after config/roster edits).
// ---------------------------------------------------------------------------
export const recomputeStandings = onCall(async (req: CallableRequest) => {
  requireAdmin(req);
  const seasonId = str(req.data?.seasonId, DEFAULT_SEASON);
  const s = await recompute(seasonId);
  return { ok: true, computedAt: s.computedAt, progress: s.progress };
});

// ---------------------------------------------------------------------------
// Prefect access — mint a custom token from a station code (no accounts).
// ---------------------------------------------------------------------------
export const claimAccessCode = onCall(async (req: CallableRequest) => {
  // The client signs in anonymously first; we attach the prefect claims to that user.
  // (This avoids createCustomToken, which needs iam.serviceAccounts.signBlob — a
  // permission 2nd-gen functions don't have by default.)
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('failed-precondition', 'Sign-in not ready — reload and try again.');
  const code = str(req.data?.code).trim().toUpperCase();
  const prefectName = str(req.data?.prefectName).slice(0, 80);
  const deviceId = (str(req.data?.deviceId).slice(0, 64) || 'device').replace(/[^A-Za-z0-9_-]/g, '');
  if (!code) throw new HttpsError('invalid-argument', 'Enter an access code.');

  const q = await db.collection('accessCodes').where('codeHash', '==', sha256(code)).limit(1).get();
  if (q.empty) throw new HttpsError('permission-denied', 'Invalid access code.');
  const doc = q.docs[0]!;
  const ac = doc.data() as {
    areaCode: string;
    eventScope?: string[];
    active?: boolean;
    expiresAt?: number;
    maxMints?: number;
    mints?: number;
    mintedDevices?: string[];
  };
  // Atomically re-check active/expiry/device-cap and record this device + uid. The
  // transaction stops N concurrent claims racing past maxMints, and the uid list lets us
  // revoke already-minted prefects if the code is later disabled. maxMints counts DISTINCT
  // devices, so a prefect re-opening the app on the same phone doesn't consume a slot.
  const result = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(doc.ref);
    const fd = fresh.data() as typeof ac & { mintedUids?: string[] };
    if (!fresh.exists || fd.active === false) return 'disabled';
    if (fd.expiresAt && fd.expiresAt < Date.now()) return 'expired';
    const devices = Array.isArray(fd.mintedDevices) ? fd.mintedDevices : [];
    const known = devices.includes(deviceId);
    if (!known && fd.maxMints && devices.length >= fd.maxMints) return 'full';
    const uids = Array.isArray(fd.mintedUids) ? fd.mintedUids : [];
    tx.update(doc.ref, {
      lastMintedAt: Date.now(),
      ...(known ? {} : { mintedDevices: [...devices, deviceId], mints: devices.length + 1 }),
      ...(uids.includes(uid) ? {} : { mintedUids: [...uids, uid].slice(-1000) }),
    });
    return 'ok';
  });
  if (result === 'disabled') throw new HttpsError('permission-denied', 'This code has been disabled.');
  if (result === 'expired') throw new HttpsError('permission-denied', 'This code has expired.');
  if (result === 'full') throw new HttpsError('resource-exhausted', 'This code has reached its device limit.');

  await getAuth().setCustomUserClaims(uid, {
    role: 'prefect',
    areaCode: ac.areaCode,
    eventScope: ac.eventScope ?? [],
    codeId: doc.id,
  });
  return { areaCode: ac.areaCode, eventScope: ac.eventScope ?? [], codeId: doc.id, prefectName };
});

// Enable/disable a station code. Disabling also revokes prefects already minted from it
// (clears their role claim + revokes refresh tokens; the live ID token lapses within ~1h).
export const setCodeActive = onCall(async (req: CallableRequest) => {
  requireAdmin(req);
  const codeId = str(req.data?.codeId);
  const active = req.data?.active === true;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(codeId)) throw new HttpsError('invalid-argument', 'invalid codeId');
  const ref = db.doc(`accessCodes/${codeId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'code not found');
  await ref.update({ active });
  if (!active) {
    const uids = (snap.data() as { mintedUids?: string[] }).mintedUids ?? [];
    await Promise.all(
      uids.map((u) =>
        getAuth()
          .setCustomUserClaims(u, { role: null })
          .then(() => getAuth().revokeRefreshTokens(u))
          .catch(() => {}),
      ),
    );
  }
  return { ok: true, revoked: !active };
});

// Permanently delete a station code (e.g. a test one). Revokes any prefects minted from it
// first (clears their role claim + refresh tokens), then removes the doc.
export const deleteCode = onCall(async (req: CallableRequest) => {
  requireAdmin(req);
  const codeId = str(req.data?.codeId);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(codeId)) throw new HttpsError('invalid-argument', 'invalid codeId');
  const ref = db.doc(`accessCodes/${codeId}`);
  const snap = await ref.get();
  if (snap.exists) {
    const uids = (snap.data() as { mintedUids?: string[] }).mintedUids ?? [];
    await Promise.all(
      uids.map((u) =>
        getAuth()
          .setCustomUserClaims(u, { role: null })
          .then(() => getAuth().revokeRefreshTokens(u))
          .catch(() => {}),
      ),
    );
    await ref.delete();
  }
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Admin management. First signed-in user can claim admin if none exists yet.
// ---------------------------------------------------------------------------
export const bootstrapFirstAdmin = onCall(async (req: CallableRequest) => {
  const uid = requireAuth(req);
  // Must be a real (email/password) account, never an anonymous prefect session.
  const provider = (req.auth?.token.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider;
  if (provider === 'anonymous') {
    throw new HttpsError('permission-denied', 'Sign in with an email and password to claim admin access.');
  }
  const email = str(req.auth?.token.email);
  // Transaction: the emptiness check + write are atomic, so two racers can't both win.
  const created = await db.runTransaction(async (tx) => {
    const existing = await tx.get(db.collection('admins').limit(1));
    if (!existing.empty) return false;
    tx.set(db.collection('admins').doc(uid), { email, name: actorName(req), addedBy: uid, addedAt: Date.now() });
    return true;
  });
  if (!created) throw new HttpsError('permission-denied', 'An admin already exists; ask them to add you.');
  await getAuth().setCustomUserClaims(uid, { admin: true });
  return { ok: true };
});

export const addAdmin = onCall(async (req: CallableRequest) => {
  const uid = requireAdmin(req);
  const email = str(req.data?.email).trim().toLowerCase();
  if (!email) throw new HttpsError('invalid-argument', 'email required');
  const user = await getAuth()
    .getUserByEmail(email)
    .catch(() => {
      throw new HttpsError('not-found', 'No account with that email has signed in yet.');
    });
  await db.collection('admins').doc(user.uid).set({
    email,
    name: user.displayName ?? email,
    addedBy: uid,
    addedAt: Date.now(),
  });
  await getAuth().setCustomUserClaims(user.uid, { admin: true });
  return { ok: true, uid: user.uid };
});

export const removeAdmin = onCall(async (req: CallableRequest) => {
  const uid = requireAdmin(req);
  const target = str(req.data?.uid);
  if (!target) throw new HttpsError('invalid-argument', 'uid required');
  if (target === uid) throw new HttpsError('failed-precondition', 'You cannot remove yourself.');
  await db.collection('admins').doc(target).delete();
  await getAuth().setCustomUserClaims(target, { admin: null });
  await getAuth().revokeRefreshTokens(target);
  return { ok: true };
});

// Keep the admin custom claim in sync with the admins/{uid} allowlist.
export const syncAdminClaims = onDocumentWritten('admins/{uid}', async (event) => {
  const uid = event.params.uid as string;
  const isAdmin = !!event.data?.after?.exists;
  try {
    await getAuth().setCustomUserClaims(uid, isAdmin ? { admin: true } : { admin: null });
  } catch (e) {
    console.error('Failed to sync admin claim for', uid, e);
  }
});
