/**
 * seedSeason — an admin-only callable that initialises (or, with force, resets) the
 * season from the canonical seed data. Runs with the Functions service account, so a
 * teacher can set up the live season from the admin app with no service-account key.
 */

import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { computeStandings } from '@mgs/scoring';
import type { DisplayControl } from '@mgs/config-types';
import {
  SEASON_ID,
  YEAR_GROUPS,
  EVENTS,
  RECORDS,
  buildForms,
  buildContests,
  buildSeasonConfig,
  buildSchedule,
  SCHEDULE_EVENT_DATE,
} from '@mgs/season-data';
import { db, REGION, requireAdmin, actorName, writeAudit } from './shared';

// Region pinned explicitly: this onCall is created (via the re-export in index.ts)
// before setGlobalOptions runs, so it would otherwise default to us-central1.
export const seedSeason = onCall({ region: REGION }, async (req: CallableRequest) => {
  const uid = requireAdmin(req);
  const name = actorName(req);
  const force = (req.data as { force?: boolean })?.force === true;
  // Defaults to the live season; a dry-run/rehearsal passes its own id. VALIDATE rather than
  // coerce — a malformed id must NEVER silently collapse to the live '2026' and trigger the
  // all-submissions wipe below.
  const rawSeason = (req.data as { seasonId?: unknown })?.seasonId;
  let seasonId = SEASON_ID;
  if (rawSeason !== undefined && rawSeason !== null) {
    if (typeof rawSeason !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(rawSeason)) {
      throw new HttpsError('invalid-argument', 'Invalid seasonId — letters, numbers, dash and underscore only.');
    }
    seasonId = rawSeason;
  }
  const seasonRef = db.doc(`seasons/${seasonId}`);

  const existing = await seasonRef.collection('contests').limit(1).get();
  if (!existing.empty && !force) {
    throw new HttpsError('already-exists', 'The season is already set up. Re-seed with force to reset it.');
  }

  // Clear existing season data first so a re-seed with an updated roster leaves no
  // stragglers (form/contest IDs change when the codes change).
  await Promise.all([
    db.recursiveDelete(seasonRef.collection('forms')),
    db.recursiveDelete(seasonRef.collection('events')),
    db.recursiveDelete(seasonRef.collection('yearGroups')),
    db.recursiveDelete(seasonRef.collection('contests')),
    db.recursiveDelete(seasonRef.collection('records')),
  ]);
  // Submissions share one collection. Resetting the LIVE season clears the whole queue — a
  // clean slate (which also removes any leftover dry-run submissions; that's fine). Resetting
  // a dry-run season clears only its own.
  if (seasonId === SEASON_ID) {
    await db.recursiveDelete(db.collection('submissions'));
  } else {
    const subs = await db.collection('submissions').where('seasonId', '==', seasonId).get();
    await Promise.all(subs.docs.map((d) => d.ref.delete()));
  }

  const forms = buildForms();
  const contests = buildContests();
  const config = buildSeasonConfig();

  let batch = db.batch();
  let ops = 0;
  const set = async (
    ref: FirebaseFirestore.DocumentReference,
    value: FirebaseFirestore.DocumentData,
  ): Promise<void> => {
    batch.set(ref, value);
    if (++ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  await set(seasonRef, config);
  for (const yg of YEAR_GROUPS) await set(seasonRef.collection('yearGroups').doc(yg.id), yg);
  for (const f of forms) await set(seasonRef.collection('forms').doc(f.id), f);
  for (const ev of EVENTS) await set(seasonRef.collection('events').doc(ev.id), ev);
  for (const c of contests) await set(seasonRef.collection('contests').doc(c.id), c);
  for (const r of RECORDS) await set(seasonRef.collection('records').doc(r.id), r);

  const standings = computeStandings({ contests, records: RECORDS, forms, config });
  standings.computedAt = Date.now();
  await set(db.doc(`standings/${seasonId}`), standings);

  const control: DisplayControl = {
    seasonId,
    mode: 'live',
    message: null,
    revealScope: null,
    updatedAt: Date.now(),
    updatedBy: uid,
  };
  await set(db.doc(`control/${seasonId}`), control);

  // The day's running order (timetable). World-readable; admins edit the offset on the day.
  await set(db.doc(`schedule/${seasonId}`), { seasonId, offsetMin: 0, eventDate: SCHEDULE_EVENT_DATE, slots: buildSchedule() });

  await batch.commit();

  // A LIVE reset is a true clean slate — clear the global (not season-scoped) access codes and
  // audit log AFTER the reseed succeeds, so a mid-run failure leaves them intact (retryable).
  // (Done before the writeAudit below, so the fresh audit keeps just this reset entry.)
  if (force && seasonId === SEASON_ID) {
    await Promise.all([db.recursiveDelete(db.collection('accessCodes')), db.recursiveDelete(db.collection('audit'))]);
  }

  await writeAudit(
    'config-change',
    `seasons/${seasonId}`,
    null,
    { seeded: true, force },
    uid,
    name,
    force ? 'season reset from seed' : 'season initialised from seed',
  );

  return { ok: true, forms: forms.length, events: EVENTS.length, contests: contests.length, records: RECORDS.length };
});

// Publish (or refresh) just the timetable for a season — WITHOUT a full reseed, so the schedule
// can appear (or be corrected) without wiping results, access codes or the audit log. Preserves
// the current "running behind" offset if one is already set.
export const publishSchedule = onCall({ region: REGION }, async (req: CallableRequest) => {
  const uid = requireAdmin(req);
  const name = actorName(req);
  const rawSeason = (req.data as { seasonId?: unknown })?.seasonId;
  let seasonId = SEASON_ID;
  if (rawSeason !== undefined && rawSeason !== null) {
    if (typeof rawSeason !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(rawSeason)) {
      throw new HttpsError('invalid-argument', 'Invalid seasonId — letters, numbers, dash and underscore only.');
    }
    seasonId = rawSeason;
  }
  const ref = db.doc(`schedule/${seasonId}`);
  const existing = await ref.get();
  // Preserve any admin-set offset / event date; default the date to Sports Day on first publish.
  const offsetMin = (existing.data()?.offsetMin as number) ?? 0;
  const eventDate = (existing.data()?.eventDate as string) ?? SCHEDULE_EVENT_DATE;
  const slots = buildSchedule();
  await ref.set({ seasonId, offsetMin, eventDate, slots });
  await writeAudit('config-change', `schedule/${seasonId}`, null, { slots: slots.length }, uid, name, 'timetable published');
  return { ok: true, slots: slots.length };
});
