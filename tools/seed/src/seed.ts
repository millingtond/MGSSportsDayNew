/**
 * Seeds Firestore for MGS Sports Day. Run against the emulator (safe) with
 *   pnpm seed:emulator
 * or against the live project (writes real data) with
 *   pnpm seed            (needs `firebase login` / GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Idempotent: re-running overwrites the config/records/contests with fresh defaults.
 * It does NOT delete committed results — pass --reset to also blank standings.
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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
} from './data';

const useEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const projectId = process.env.GCLOUD_PROJECT || 'mgssportsday-55624';

initializeApp({ projectId });
const db = getFirestore();

async function main(): Promise<void> {
  const forms = buildForms();
  const contests = buildContests();
  const config = buildSeasonConfig();

  console.log(
    `\nSeeding season ${SEASON_ID} -> ${
      useEmulator ? `EMULATOR (${process.env.FIRESTORE_EMULATOR_HOST})` : `LIVE PROJECT ${projectId}`
    }`,
  );
  if (!useEmulator) console.log('  ⚠  Writing to the LIVE project.');

  const seasonRef = db.doc(`seasons/${SEASON_ID}`);
  let batch = db.batch();
  let ops = 0;
  const set = async (ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData): Promise<void> => {
    batch.set(ref, data);
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

  // Initial standings (all zero) so the scoreboard renders immediately.
  const standings = computeStandings({ contests, records: RECORDS, forms, config });
  standings.computedAt = Date.now();
  await set(db.doc(`standings/${SEASON_ID}`), standings);

  // Display control starts in live mode.
  const control: DisplayControl = {
    seasonId: SEASON_ID,
    mode: 'live',
    message: null,
    revealScope: null,
    updatedAt: Date.now(),
    updatedBy: 'seed',
  };
  await set(db.doc(`control/${SEASON_ID}`), control);

  await batch.commit();

  console.log(
    `✓ Seeded: 1 season, ${YEAR_GROUPS.length} year groups, ${forms.length} forms, ${EVENTS.length} events, ` +
      `${contests.length} contests, ${RECORDS.length} records, standings + control.\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
