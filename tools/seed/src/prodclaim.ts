/**
 * Quick PRODUCTION smoke test of the prefect claim flow (anonymous auth + claimAccessCode).
 * Usage: pnpm --filter @mgs/seed exec tsx src/prodclaim.ts <CODE>
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const app = initializeApp({
  apiKey: 'AIzaSyBjbh2A6MNDVMYCx2BV_2M5rVHmATF-6PA',
  authDomain: 'mgssportsday-55624.firebaseapp.com',
  projectId: 'mgssportsday-55624',
});
const auth = getAuth(app);
const fns = getFunctions(app, 'europe-west2');

async function main(): Promise<void> {
  const code = process.argv[2];
  if (!code) {
    console.error('Usage: tsx src/prodclaim.ts <CODE>  (never hard-code a real station code)');
    process.exit(1);
  }
  await signInAnonymously(auth);
  console.log('anon uid:', auth.currentUser?.uid);
  const claim = httpsCallable<{ code: string; prefectName: string; deviceId: string }, unknown>(fns, 'claimAccessCode');
  const res = await claim({ code, prefectName: 'Verify Bot', deviceId: 'verify-bot' });
  console.log('claim result:', JSON.stringify(res.data));
  await auth.currentUser?.getIdToken(true);
  const t = await auth.currentUser?.getIdTokenResult();
  console.log('claims now on user:', JSON.stringify({ role: t?.claims.role, areaCode: t?.claims.areaCode, eventScope: t?.claims.eventScope }));
  process.exit(0);
}
main().catch((e) => {
  console.error('ERROR:', (e as { message?: string })?.message ?? e);
  process.exit(1);
});
