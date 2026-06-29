/** Reactive auth state for the admin console (email/password + admin claim gate). */

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { getAuthInstance, callable } from '@mgs/firebase';

export const auth = $state({
  ready: false, // first onAuthStateChanged callback fired
  user: null as User | null,
  uid: '' as string,
  email: '' as string,
  isAdmin: false,
});

let started = false;

export function startAuth(): void {
  if (started) return;
  started = true;
  onAuthStateChanged(getAuthInstance(), async (user) => {
    auth.user = user;
    auth.uid = user?.uid ?? '';
    auth.email = user?.email ?? '';
    if (user) {
      await refreshClaims();
      // The admin claim may have been granted after this token was minted (e.g. a
      // bootstrap from another tab/session). One forced refresh picks it up so the
      // user doesn't have to sign out and back in.
      if (!auth.isAdmin) await refreshClaims(true);
    } else {
      auth.isAdmin = false;
    }
    auth.ready = true;
  });
}

/** Re-read custom claims from the current ID token. */
export async function refreshClaims(force = false): Promise<void> {
  const user = getAuthInstance().currentUser;
  if (!user) {
    auth.isAdmin = false;
    return;
  }
  if (force) await user.getIdToken(true);
  const res = await user.getIdTokenResult();
  auth.isAdmin = res.claims.admin === true;
}

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(getAuthInstance(), email.trim(), password);
}

export async function createAccount(email: string, password: string): Promise<void> {
  await createUserWithEmailAndPassword(getAuthInstance(), email.trim(), password);
}

export async function doSignOut(): Promise<void> {
  await signOut(getAuthInstance());
}

/** Claim admin for the very first user (fails if an admin already exists). */
export async function claimFirstAdmin(): Promise<void> {
  const fn = callable<Record<string, never>, { ok: boolean }>('bootstrapFirstAdmin');
  try {
    await fn({});
    await refreshClaims(true);
  } catch (e) {
    // "An admin already exists" can simply mean WE are already that admin but are
    // holding a stale token. Force-refresh; if the claim is now present we're in,
    // otherwise it's a genuine error (a different account holds admin).
    await refreshClaims(true);
    if (!auth.isAdmin) throw e;
  }
}
