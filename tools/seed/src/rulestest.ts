/**
 * Security-rules + prefect-path test. Uses the Firebase CLIENT SDK (subject to rules)
 * to prove the entry app's exact flow works and the trust boundary holds:
 *   - admin seeds a station access code (Admin SDK, bypasses rules)
 *   - a prefect claims the code -> custom token -> signs in
 *   - the prefect CAN create a valid pending submission (rules allow)
 *   - the prefect CANNOT write a contest or standings (rules deny)
 *
 * Run with the full emulator suite up + seeded:
 *   pnpm --filter @mgs/seed run rulestest:emulator
 */

import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  getDoc,
} from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';

const PROJECT = process.env.GCLOUD_PROJECT || 'mgssportsday-55624';
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

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
    check(name, false, '(write unexpectedly succeeded)');
  } catch {
    check(name, true);
  }
}

initAdmin({ projectId: PROJECT });
const adb = adminFirestore();

const app = initializeApp({ apiKey: 'fake-emulator-key', projectId: PROJECT });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);
const fns = getFunctions(app, 'europe-west2');
connectFunctionsEmulator(fns, '127.0.0.1', 5001);

async function main(): Promise<void> {
  console.log('\nRules + prefect-path test (client SDK, rules enforced)\n');

  // Admin SDK seeds a station code for the 100m station.
  const CODE = 'TEST01';
  await adb.collection('accessCodes').doc('itest-code').set({
    codeHash: sha256(CODE),
    areaCode: '100m-Finish',
    eventScope: ['100m'],
    active: true,
    expiresAt: Date.now() + 86_400_000,
    maxMints: 100,
    mints: 0,
  });

  // Prefect claims it — the real flow: sign in anonymously, claim (which attaches the
  // prefect claims to the anon user), then refresh the ID token so the claims take effect.
  await signInAnonymously(auth);
  const claim = httpsCallable<
    { code: string; prefectName: string; deviceId: string },
    { areaCode: string; eventScope: string[]; codeId: string }
  >(fns, 'claimAccessCode');
  const res = await claim({ code: CODE, prefectName: 'Test Prefect', deviceId: 'rulesdev' });
  check('claimAccessCode returned the station', !!res.data.codeId);
  await auth.currentUser!.getIdToken(true);
  const uid = auth.currentUser!.uid;
  check('prefect signed in', !!uid);

  // Valid submission (matches the rules: claim-matched, in-scope event, consistent id).
  const subId = `2026__rulesdev__Y9__100m__A`;
  await setDoc(doc(db, 'submissions', subId), {
    seasonId: '2026',
    contestId: 'Y9__100m__A',
    year: 'Y9',
    event: '100m',
    string: 'A',
    placements: [
      { formId: 'Y9-JLLDWI', position: 1 },
      { formId: 'Y9-OLSNJS', position: 2 },
    ],
    status: 'pending',
    attribution: {
      submittedByUid: uid,
      prefectName: 'Test Prefect',
      areaCode: '100m-Finish',
      codeId: 'itest-code',
      deviceId: 'rulesdev',
    },
    clientCreatedAt: Date.now(),
    clientSubmissionId: 'attempt1',
    syncedAt: null,
  });
  const back = await getDoc(doc(db, 'submissions', subId));
  check('prefect CAN create a valid pending submission', back.exists());

  // The prefect must NOT be able to write scored data.
  await expectDenied('prefect CANNOT write a contest', () =>
    setDoc(doc(db, 'seasons/2026/contests/Y9__100m__A'), { status: 'committed', placements: [] }),
  );
  await expectDenied('prefect CANNOT write standings', () =>
    setDoc(doc(db, 'standings/2026'), { hacked: true }),
  );
  await expectDenied('prefect CANNOT submit an out-of-scope event (200m)', () =>
    setDoc(doc(db, 'submissions', '2026__rulesdev__Y9__200m__A'), {
      seasonId: '2026',
      contestId: 'Y9__200m__A',
      year: 'Y9',
      event: '200m',
      string: 'A',
      placements: [{ formId: 'Y9-JLLDWI', position: 1 }],
      status: 'pending',
      attribution: { submittedByUid: uid, prefectName: 'T', areaCode: '100m-Finish', codeId: 'itest-code', deviceId: 'rulesdev' },
      clientCreatedAt: Date.now(),
      clientSubmissionId: 'x',
      syncedAt: null,
    }),
  );

  console.log(failures ? `\n✗ ${failures} check(s) FAILED\n` : '\n✓ ALL RULES CHECKS PASSED\n');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
