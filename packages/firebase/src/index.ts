/**
 * Shared Firebase wiring for all three MGS Sports Day apps.
 *
 * The web config below is PUBLIC by design (Firebase web keys are identifiers, not
 * secrets — security is enforced by Firestore rules + App Check). Safe to commit.
 *
 * Set VITE_USE_EMULATORS=1 in an app's dev env to talk to the local emulator suite.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider } from 'firebase/app-check';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
  type Functions,
  type HttpsCallable,
} from 'firebase/functions';

export const firebaseConfig = {
  apiKey: 'AIzaSyBjbh2A6MNDVMYCx2BV_2M5rVHmATF-6PA',
  authDomain: 'mgssportsday-55624.firebaseapp.com',
  projectId: 'mgssportsday-55624',
  storageBucket: 'mgssportsday-55624.firebasestorage.app',
  messagingSenderId: '251720074527',
  appId: '1:251720074527:web:78261bf25e094041a19c2a',
};

export const REGION = 'europe-west2';
export const SEASON_ID = '2026'; // the LIVE season

/**
 * The active season for THIS browser session. Normally the live `SEASON_ID`, but a
 * `?season=<id>` URL parameter switches every app to a parallel "dry-run" season — so a
 * rehearsal writes to `standings/<id>`, `seasons/<id>/…` etc. and never touches the live
 * board. Sanitised and resolved once per session.
 */
let _seasonId: string | undefined;
export function getSeasonId(): string {
  if (_seasonId) return _seasonId;
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('season');
    const clean = (q ?? '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    _seasonId = clean || SEASON_ID;
  } catch {
    _seasonId = SEASON_ID;
  }
  return _seasonId;
}
/** True when running against a non-live (dry-run / rehearsal) season. */
export function isDryRun(): boolean {
  return getSeasonId() !== SEASON_ID;
}

function useEmulators(): boolean {
  try {
    return (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_USE_EMULATORS === '1';
  } catch {
    return false;
  }
}

let _app: FirebaseApp | undefined;
let _db: Firestore | undefined;
let _auth: Auth | undefined;
let _functions: Functions | undefined;
let _emuConnected = false;

/**
 * App Check (defence-in-depth: binds backend traffic to the real apps). Opt-in and
 * fail-safe: a NO-OP unless VITE_APPCHECK_KEY is set, wrapped in try/catch so a missing
 * or wrong key can never break app startup. Provider defaults to reCAPTCHA Enterprise;
 * set VITE_APPCHECK_PROVIDER=v3 for a classic reCAPTCHA v3 key.
 *
 * To activate: register a reCAPTCHA key + App Check provider for the web app, set
 * VITE_APPCHECK_KEY at build time, redeploy. Enforcement is then a separate, deliberate
 * step (Firestore: console toggle; Functions: enforceAppCheck on the callables).
 */
function setupAppCheck(app: FirebaseApp): void {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
    const key = env.VITE_APPCHECK_KEY;
    if (!key || useEmulators()) return;
    const provider =
      env.VITE_APPCHECK_PROVIDER === 'v3' ? new ReCaptchaV3Provider(key) : new ReCaptchaEnterpriseProvider(key);
    initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true });
  } catch (e) {
    console.warn('App Check not initialised (continuing without it):', e);
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (!_app) {
    _app = getApps()[0] ?? initializeApp(firebaseConfig);
    setupAppCheck(_app); // before any db/auth/functions calls, so tokens attach
  }
  return _app;
}

/**
 * Firestore singleton. Pass { offline: true } (the prefect entry app) for the
 * IndexedDB persistent cache; otherwise an in-memory cache (scoreboard/admin).
 */
export function getDb(opts: { offline?: boolean } = {}): Firestore {
  if (_db) return _db;
  const app = getFirebaseApp();
  _db = opts.offline
    ? initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      })
    : initializeFirestore(app, {});
  if (useEmulators()) connectFirestoreEmulator(_db, '127.0.0.1', 8080);
  return _db;
}

export function getAuthInstance(): Auth {
  if (!_auth) {
    _auth = getAuth(getFirebaseApp());
    if (useEmulators()) connectAuthEmulator(_auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
  return _auth;
}

export function getFns(): Functions {
  if (!_functions) {
    _functions = getFunctions(getFirebaseApp(), REGION);
    if (useEmulators() && !_emuConnected) {
      connectFunctionsEmulator(_functions, '127.0.0.1', 5001);
      _emuConnected = true;
    }
  }
  return _functions;
}

/** Typed callable helper: const commit = callable<CommitInput, CommitResult>('commitContest'). */
export function callable<Req = unknown, Res = unknown>(name: string): HttpsCallable<Req, Res> {
  return httpsCallable<Req, Res>(getFns(), name);
}

// ---- Firestore path helpers --------------------------------------------------
export const paths = {
  season: (sid = getSeasonId()) => `seasons/${sid}`,
  forms: (sid = getSeasonId()) => `seasons/${sid}/forms`,
  events: (sid = getSeasonId()) => `seasons/${sid}/events`,
  yearGroups: (sid = getSeasonId()) => `seasons/${sid}/yearGroups`,
  contests: (sid = getSeasonId()) => `seasons/${sid}/contests`,
  records: (sid = getSeasonId()) => `seasons/${sid}/records`,
  standings: (sid = getSeasonId()) => `standings/${sid}`,
  control: (sid = getSeasonId()) => `control/${sid}`,
  schedule: (sid = getSeasonId()) => `schedule/${sid}`,
  submissions: () => 'submissions',
  audit: () => 'audit',
};
