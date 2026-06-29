/**
 * End-to-end test for the "send back for clarification" loop against the FULL emulator
 * suite (firestore + auth + functions). Proves the round-trip across the trust boundary:
 *   - a prefect creates a pending submission (client SDK, rules enforced)
 *   - an admin sends it back via requestClarification (real Cloud Function)  -> status 'clarify'
 *   - the prefect resubmits the SAME doc (rules now allow clarify -> pending) -> status 'pending'
 *   - sending back again, then committing the contest, supersedes the stale clarify
 *   - a prefect may NOT call requestClarification (admins only)
 *
 * Prereq: `pnpm seed:emulator` then emulators running with functions+auth+firestore.
 * Run: `pnpm --filter @mgs/seed run clarifytest:emulator`
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

const CONTEST = 'Y9__200m__A'; // a contest itest never touches, so this test stands alone
const SUB_ID = '2026__clarifydev__Y9__200m__A';
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
  const uid = 'clarify-admin';
  try {
    await aauth.getUser(uid);
  } catch {
    await aauth.createUser({ uid, email: 'clarify-admin@mgs.test' });
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
async function readSub(): Promise<{ status?: string; clarification?: { message?: string; byUid?: string } | null }> {
  const snap = await adb.collection('submissions').doc(SUB_ID).get();
  return (snap.data() as { status?: string; clarification?: { message?: string; byUid?: string } | null }) ?? {};
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
    event: '200m',
    string: 'A',
    placements: PLACEMENTS,
    status: 'pending',
    attribution: {
      submittedByUid: uid,
      prefectName: 'Clarify Prefect',
      areaCode: '200m-Finish',
      codeId: 'clarify-code',
      deviceId: 'clarifydev',
    },
    clientCreatedAt: Date.now(),
    clientSubmissionId: attemptId,
    syncedAt: null,
  };
}

async function main(): Promise<void> {
  console.log('\nClarification round-trip test (firestore + auth + functions)\n');

  // Clean any leftover doc from a previous run (Admin SDK bypasses rules) so the prefect's
  // first write is always a fresh create.
  await adb.collection('submissions').doc(SUB_ID).delete().catch(() => {});

  // Admin seeds a 200m station code; prefect claims it.
  await adb.collection('accessCodes').doc('clarify-code').set({
    codeHash: sha256('CLAR01'),
    areaCode: '200m-Finish',
    eventScope: ['200m'],
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
  await claim({ code: 'CLAR01', prefectName: 'Clarify Prefect', deviceId: 'clarifydev' });
  await auth.currentUser!.getIdToken(true);
  const uid = auth.currentUser!.uid;
  check('prefect signed in', !!uid);

  // 1) Prefect creates a pending submission.
  await setDoc(doc(cdb, 'submissions', SUB_ID), prefectSubmission(uid, 'attempt1'));
  check('prefect created a pending submission', (await readSub()).status === 'pending');

  const idToken = await adminIdToken();
  check('minted admin ID token', !!idToken);

  // A prefect must NOT be able to send a submission back (admins only).
  const prefectToken = await auth.currentUser!.getIdToken();
  await expectDenied('prefect CANNOT call requestClarification', () =>
    callFn('requestClarification', { seasonId: '2026', submissionId: SUB_ID, message: 'nope' }, prefectToken),
  );

  // 2) Admin sends it back with a question -> status 'clarify' + message stored.
  await callFn('requestClarification', { seasonId: '2026', submissionId: SUB_ID, message: 'Confirm the 2nd-place form' }, idToken);
  let s = await readSub();
  check('requestClarification set status = clarify', s.status === 'clarify', `got ${s.status}`);
  check('clarification message stored', s.clarification?.message === 'Confirm the 2nd-place form');
  check('clarification attributed to the admin', !!s.clarification?.byUid);

  // 3) Prefect resubmits the SAME doc — rules now allow clarify -> pending; question clears.
  await setDoc(doc(cdb, 'submissions', SUB_ID), prefectSubmission(uid, 'attempt2'));
  s = await readSub();
  check('prefect CAN resubmit a sent-back submission', s.status === 'pending', `got ${s.status}`);
  check('resubmit clears the clarification', !s.clarification);
  check('resubmit recorded the new attempt', (await getDoc(doc(cdb, 'submissions', SUB_ID))).data()?.clientSubmissionId === 'attempt2');

  // 4) Send back again, then commit the contest — the stale clarify is superseded, not left dangling.
  await callFn('requestClarification', { seasonId: '2026', submissionId: SUB_ID, message: 'One more check' }, idToken);
  check('sent back again -> clarify', (await readSub()).status === 'clarify');
  await callFn('commitContest', { seasonId: '2026', contestId: CONTEST, placements: PLACEMENTS, reason: 'clarifytest commit' }, idToken);
  s = await readSub();
  check('committing the contest supersedes the clarify submission', s.status === 'superseded', `got ${s.status}`);
  check('superseding clears the stale question', !s.clarification);

  // Empty message is rejected.
  await expectDenied('requestClarification rejects an empty message', () =>
    callFn('requestClarification', { seasonId: '2026', submissionId: SUB_ID, message: '   ' }, idToken),
  );

  // Tidy up: void the contest so the dev board isn't left with these throwaway points.
  await callFn('voidContest', { seasonId: '2026', contestId: CONTEST, reason: 'clarifytest cleanup' }, idToken).catch(() => {});

  console.log(failures ? `\n✗ ${failures} check(s) FAILED\n` : '\n✓ ALL CLARIFICATION CHECKS PASSED\n');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
