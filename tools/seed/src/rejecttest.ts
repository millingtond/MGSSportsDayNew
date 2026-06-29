/**
 * End-to-end test for the "delete (discard) a submission" loop against the FULL emulator
 * suite (firestore + auth + functions). Proves the reversible-delete round-trip across the
 * trust boundary:
 *   - a prefect creates a pending submission (client SDK, rules enforced)
 *   - an admin deletes it via discardSubmission (real Cloud Function)      -> status 'rejected'
 *   - an admin restores it via restoreSubmission                          -> status 'pending'
 *   - a prefect may resubmit OVER a deleted submission (rules: rejected -> pending) so a delete
 *     never permanently locks a contest
 *   - a prefect may NOT call discardSubmission / restoreSubmission (admins only)
 *   - discardSubmission requires a reason; restore only works on a rejected submission
 *
 * Prereq: `pnpm seed:emulator` then emulators running with functions+auth+firestore.
 * Run: `pnpm --filter @mgs/seed run rejecttest:emulator`
 */

import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { createHash } from 'node:crypto';

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';

const PROJECT = process.env.GCLOUD_PROJECT || 'mgssportsday-55624';
const REGION = 'europe-west2';
const FN_BASE = `http://127.0.0.1:5001/${PROJECT}/${REGION}`;
const AUTH_BASE = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

const CONTEST = 'Y9__300m__A'; // a contest no other test touches, so this test stands alone
const SUB_ID = '2026__rejectdev__Y9__300m__A';
const PLACEMENTS = [
  { formId: 'Y9-JLLDWI', position: 1 },
  { formId: 'Y9-OLSNJS', position: 2 },
];

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.error(`  ✗ ${name} ${detail}`);
    failures++;
  }
}
async function expectDenied(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    check(name, false, '(call unexpectedly succeeded)');
  } catch {
    check(name, true);
  }
}

// ---- admin side (Admin SDK + real Cloud Functions) --------------------------
initAdmin({ projectId: PROJECT });
const adb = adminFirestore();
const aauth = adminAuth();

async function adminIdToken(): Promise<string> {
  const uid = 'reject-admin';
  try {
    await aauth.getUser(uid);
  } catch {
    await aauth.createUser({ uid, email: 'reject-admin@mgs.test' });
  }
  await aauth.setCustomUserClaims(uid, { admin: true });
  const customToken = await aauth.createCustomToken(uid);
  const res = await fetch(`${AUTH_BASE}/accounts:signInWithCustomToken?key=fake-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const json = (await res.json()) as { idToken?: string };
  if (!json.idToken) throw new Error('failed to mint id token: ' + JSON.stringify(json));
  return json.idToken;
}
async function callFn(name: string, data: unknown, idToken: string): Promise<unknown> {
  const res = await fetch(`${FN_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  const json = (await res.json()) as { result?: unknown; error?: unknown };
  if (json.error) throw new Error(`${name}: ${JSON.stringify(json.error)}`);
  return json.result;
}
async function readSub(): Promise<{ status?: string; clarification?: unknown }> {
  const snap = await adb.collection('submissions').doc(SUB_ID).get();
  return (snap.data() as { status?: string; clarification?: unknown }) ?? {};
}

// ---- prefect side (client SDK, rules enforced) ------------------------------
const app = initializeApp({ apiKey: 'fake-emulator-key', projectId: PROJECT });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const cdb = getFirestore(app);
connectFirestoreEmulator(cdb, '127.0.0.1', 8080);
const fns = getFunctions(app, REGION);
connectFunctionsEmulator(fns, '127.0.0.1', 5001);

function prefectSubmission(uid: string, attemptId: string) {
  return {
    seasonId: '2026',
    contestId: CONTEST,
    year: 'Y9',
    event: '300m',
    string: 'A',
    placements: PLACEMENTS,
    status: 'pending',
    attribution: {
      submittedByUid: uid,
      prefectName: 'Reject Prefect',
      areaCode: '300m-Finish',
      codeId: 'reject-code',
      deviceId: 'rejectdev',
    },
    clientCreatedAt: Date.now(),
    clientSubmissionId: attemptId,
    syncedAt: null,
  };
}

async function main(): Promise<void> {
  console.log('\nReversible-delete round-trip test (firestore + auth + functions)\n');

  // Clean any leftover doc from a previous run (Admin SDK bypasses rules).
  await adb.collection('submissions').doc(SUB_ID).delete().catch(() => {});

  // Admin seeds a 300m station code; prefect claims it.
  await adb.collection('accessCodes').doc('reject-code').set({
    codeHash: sha256('REJ01'),
    areaCode: '300m-Finish',
    eventScope: ['300m'],
    active: true,
    expiresAt: Date.now() + 86_400_000,
    maxMints: 100,
    mints: 0,
  });
  await signInAnonymously(auth);
  const claim = httpsCallable<{ code: string; prefectName: string; deviceId: string }, { codeId: string }>(
    fns,
    'claimAccessCode',
  );
  await claim({ code: 'REJ01', prefectName: 'Reject Prefect', deviceId: 'rejectdev' });
  await auth.currentUser!.getIdToken(true);
  const uid = auth.currentUser!.uid;
  check('prefect signed in', !!uid);

  // 1) Prefect creates a pending submission.
  await setDoc(doc(cdb, 'submissions', SUB_ID), prefectSubmission(uid, 'attempt1'));
  check('prefect created a pending submission', (await readSub()).status === 'pending');

  const idToken = await adminIdToken();
  check('minted admin ID token', !!idToken);

  // A prefect must NOT be able to delete or restore submissions (admins only).
  const prefectToken = await auth.currentUser!.getIdToken();
  await expectDenied('prefect CANNOT call discardSubmission', () =>
    callFn('discardSubmission', { seasonId: '2026', submissionId: SUB_ID, reason: 'nope' }, prefectToken),
  );
  await expectDenied('prefect CANNOT call restoreSubmission', () =>
    callFn('restoreSubmission', { seasonId: '2026', submissionId: SUB_ID }, prefectToken),
  );

  // A delete needs a reason.
  await expectDenied('discardSubmission rejects an empty reason', () =>
    callFn('discardSubmission', { seasonId: '2026', submissionId: SUB_ID, reason: '   ' }, idToken),
  );

  // 2) Admin deletes it -> status 'rejected'.
  await callFn('discardSubmission', { seasonId: '2026', submissionId: SUB_ID, reason: 'duplicate of paper sheet' }, idToken);
  check('discardSubmission set status = rejected', (await readSub()).status === 'rejected', `got ${(await readSub()).status}`);

  // 3) Admin restores it -> status 'pending'.
  await callFn('restoreSubmission', { seasonId: '2026', submissionId: SUB_ID }, idToken);
  check('restoreSubmission set status = pending', (await readSub()).status === 'pending', `got ${(await readSub()).status}`);

  // 4) Delete again, then the PREFECT resubmits over it — rules allow rejected -> pending.
  await callFn('discardSubmission', { seasonId: '2026', submissionId: SUB_ID, reason: 'second delete' }, idToken);
  check('deleted again -> rejected', (await readSub()).status === 'rejected');
  await setDoc(doc(cdb, 'submissions', SUB_ID), prefectSubmission(uid, 'attempt2'));
  check('prefect CAN resubmit over a deleted submission', (await readSub()).status === 'pending', `got ${(await readSub()).status}`);
  check('resubmit recorded the new attempt', (await getDoc(doc(cdb, 'submissions', SUB_ID))).data()?.clientSubmissionId === 'attempt2');

  // 5) Restoring a non-deleted (pending) submission is refused.
  await expectDenied('restoreSubmission refuses a pending submission', () =>
    callFn('restoreSubmission', { seasonId: '2026', submissionId: SUB_ID }, idToken),
  );

  // Tidy up: delete the throwaway doc (Admin SDK bypasses rules).
  await adb.collection('submissions').doc(SUB_ID).delete().catch(() => {});

  console.log(failures ? `\n✗ ${failures} check(s) FAILED\n` : '\n✓ ALL DELETE/RESTORE CHECKS PASSED\n');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
