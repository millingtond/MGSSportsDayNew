/**
 * End-to-end integration test against the FULL emulator suite (firestore + auth + functions).
 * Drives the REAL Cloud Functions with a real admin ID token and asserts the
 * commit -> recompute -> standings pipeline, records bonus, corrections guard, and void.
 *
 * Prereq: `pnpm seed:emulator` then emulators running with functions+auth+firestore.
 * Run: `pnpm --filter @mgs/seed run itest:emulator`
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { buildForms } from './data';

const PROJECT = process.env.GCLOUD_PROJECT || 'mgssportsday-55624';
const REGION = 'europe-west2';
const FN_BASE = `http://127.0.0.1:5001/${PROJECT}/${REGION}`;
const AUTH_BASE = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';

initializeApp({ projectId: PROJECT });
const db = getFirestore();
const auth = getAuth();

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.error(`  ✗ ${name} ${detail}`);
    failures++;
  }
}

async function adminIdToken(): Promise<string> {
  const uid = 'itest-admin';
  try {
    await auth.getUser(uid);
  } catch {
    await auth.createUser({ uid, email: 'itest-admin@mgs.test' });
  }
  await auth.setCustomUserClaims(uid, { admin: true });
  const customToken = await auth.createCustomToken(uid);
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

type FormStandingLite = { regularPoints: number; bonusPoints: number; total: number; yearPos: number };
async function standingsFor(formId: string): Promise<FormStandingLite> {
  const snap = await db.doc('standings/2026').get();
  const data = snap.data() as { forms: Record<string, FormStandingLite> };
  return data.forms[formId]!;
}
async function progress(): Promise<{ committed: number; total: number }> {
  const snap = await db.doc('standings/2026').get();
  return (snap.data() as { progress: { committed: number; total: number } }).progress;
}
async function broken(): Promise<{ recordId: string }[]> {
  const snap = await db.doc('standings/2026').get();
  return (snap.data() as { records: { broken: { recordId: string }[] } }).records.broken;
}

async function main(): Promise<void> {
  console.log('\nIntegration test (emulator: firestore + auth + functions)\n');
  const idToken = await adminIdToken();
  check('minted admin ID token', !!idToken);

  const y9 = buildForms().filter((f) => f.year === 'Y9');
  const winner = y9[0]!.id;
  const placements = y9.map((f, i) => ({ formId: f.id, position: i + 1 }));

  await callFn('commitContest', { seasonId: '2026', contestId: 'Y9__100m__A', placements }, idToken);
  let w = await standingsFor(winner);
  check('commit: A-string winner scores 31', w.regularPoints === 31, `got ${w.regularPoints}`);
  check('commit: winner is 1st in year', w.yearPos === 1, `got ${w.yearPos}`);
  check('commit: progress incremented', (await progress()).committed >= 1);

  await callFn('recordEntry', { seasonId: '2026', recordId: 'Y9__shot', currentScore: 13.0, currentForm: winner }, idToken);
  w = await standingsFor(winner);
  check('record beat (13.0 > 11.5m): +2 bonus', w.bonusPoints === 2, `got ${w.bonusPoints}`);
  check('record beat: total = 33', w.total === 33, `got ${w.total}`);
  check('record shown as broken', (await broken()).some((b) => b.recordId === 'Y9__shot'));

  let rejected = false;
  try {
    await callFn('commitContest', { seasonId: '2026', contestId: 'Y9__100m__A', placements }, idToken);
  } catch {
    rejected = true;
  }
  check('correcting a committed contest with no reason is rejected', rejected);

  await callFn('voidContest', { seasonId: '2026', contestId: 'Y9__100m__A', reason: 'itest void' }, idToken);
  w = await standingsFor(winner);
  check('void: regular points removed', w.regularPoints === 0, `got ${w.regularPoints}`);
  check('void: record bonus still stands (total = 2)', w.total === 2, `got ${w.total}`);

  // restore for a clean state
  await callFn('unvoidContest', { seasonId: '2026', contestId: 'Y9__100m__A' }, idToken);

  console.log(failures ? `\n✗ ${failures} check(s) FAILED\n` : '\n✓ ALL INTEGRATION CHECKS PASSED\n');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
