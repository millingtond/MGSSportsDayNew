import { signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where, setDoc, type Unsubscribe } from 'firebase/firestore';
import { getDb, getAuthInstance, callable, paths, getSeasonId, SEASON_ID } from '@mgs/firebase';
import { nowMinutes, eventDayPhase, type DayPhase } from '@mgs/ui';
import type { Form, EventDef, Submission, SubmissionStatus, SubmissionClarification, Placement, ScheduleDoc } from '@mgs/config-types';

const LS = { device: 'mgs_device_id', name: 'mgs_prefect_name', station: 'mgs_station' } as const;

type Station = { areaCode: string; eventScope: string[]; codeId: string };
type Phase = 'loading' | 'need-code' | 'claiming' | 'need-name' | 'ready';

function deviceId(): string {
  let id = localStorage.getItem(LS.device);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^a-z0-9]/gi, '').slice(0, 24);
    localStorage.setItem(LS.device, id);
  }
  return id;
}

export const sess = $state({
  phase: 'loading' as Phase,
  error: '',
  user: null as User | null,
  station: null as Station | null,
  prefectName: '',
  online: true,
  forms: [] as Form[],
  events: [] as EventDef[],
  mySubmissions: [] as {
    contestId: string;
    clientSubmissionId: string;
    pending: boolean;
    status: SubmissionStatus;
    clarification: SubmissionClarification | null;
  }[],
  lastWriteError: '' as string, // set if a local cache write is hard-rejected (e.g. storage blocked)
  sessionExpired: false, // station was saved here but the anon session lost its prefect claims
  schedule: null as ScheduleDoc | null,
  clockMin: nowMinutes(new Date()), // local time-of-day, ticked so now/next stays fresh
});

let started = false;
let clockTimer: ReturnType<typeof setInterval> | undefined;
let dataSubs: Unsubscribe[] = [];
let mySub: Unsubscribe | undefined; // the prefect's own-submissions listener (needs the role claim)
let latestAttempt = ''; // scopes lastWriteError to the most recent submit

export async function initSession(codeFromUrl: string | null): Promise<void> {
  if (started) return;
  started = true;

  sess.prefectName = localStorage.getItem(LS.name) ?? '';
  const storedStation = localStorage.getItem(LS.station);
  if (storedStation) {
    try {
      sess.station = JSON.parse(storedStation) as Station;
    } catch {
      /* ignore */
    }
  }
  sess.online = navigator.onLine;
  window.addEventListener('online', () => (sess.online = true));
  window.addEventListener('offline', () => (sess.online = false));
  if (!clockTimer) clockTimer = setInterval(() => (sess.clockMin = nowMinutes(new Date())), 15000);

  onAuthStateChanged(getAuthInstance(), (u) => {
    sess.user = u;
    if (u) {
      subscribeData();
      void verifyStationClaims(codeFromUrl);
    }
    settlePhase(codeFromUrl);
  });

  // If we arrived with a fresh code (and aren't already set up here), claim it.
  if (codeFromUrl && (!sess.user || !sess.station)) {
    void claim(codeFromUrl);
  } else {
    settlePhase(codeFromUrl);
  }
}

function settlePhase(codeFromUrl: string | null): void {
  if (sess.phase === 'claiming') return;
  if (sess.user && sess.station) {
    sess.phase = sess.prefectName ? 'ready' : 'need-name';
  } else if (codeFromUrl) {
    // a claim is in flight or about to start
  } else {
    sess.phase = 'need-code';
  }
}

/**
 * A saved station (localStorage) only proves we claimed *here* at some point — the current
 * anonymous session may have since lost its prefect custom claims (iOS/ITP evicts IndexedDB
 * after ~7 days, a fresh sign-in, cleared storage). The token, not localStorage, is what the
 * Firestore rules check, so a stale station shows a "ready" UI that then fails every save with
 * a cryptic "Missing or insufficient permissions". Verify the live token actually carries
 * role:'prefect'; if it doesn't, drop the station so the prefect is asked to re-scan their code.
 */
async function verifyStationClaims(codeFromUrl: string | null): Promise<void> {
  if (!sess.station) return; // nothing claimed here (a fresh claim handles its own subscribe)
  const u = getAuthInstance().currentUser;
  if (!u) return;
  let role: unknown;
  try {
    role = (await u.getIdTokenResult()).claims.role;
  } catch {
    return; // transient token/network error — don't punish a working session
  }
  if (role === 'prefect') {
    subscribeMine(); // claims intact — (re)attach the own-submissions feed
    return;
  }
  // Claims are gone. If a claim is already running, let it finish; if we still have the code
  // (re-scanned QR), silently re-claim to restore them; otherwise drop the stale station so the
  // prefect is asked to re-enter their code rather than hitting "Missing or insufficient permissions".
  if (sess.phase === 'claiming') return;
  if (codeFromUrl) {
    void claim(codeFromUrl);
    return;
  }
  sess.station = null;
  localStorage.removeItem(LS.station);
  sess.sessionExpired = true;
  sess.phase = 'need-code';
}

export async function claim(code: string): Promise<void> {
  const trimmed = code.trim();
  if (!trimmed) return;
  sess.phase = 'claiming';
  sess.error = '';
  try {
    const auth = getAuthInstance();
    if (!auth.currentUser) await signInAnonymously(auth);
    const fn = callable<
      { code: string; prefectName: string; deviceId: string },
      { areaCode: string; eventScope: string[]; codeId: string }
    >('claimAccessCode');
    const res = await fn({ code: trimmed, prefectName: sess.prefectName, deviceId: deviceId() });
    await auth.currentUser?.getIdToken(true); // refresh so the new prefect claims take effect
    sess.station = { areaCode: res.data.areaCode, eventScope: res.data.eventScope ?? [], codeId: res.data.codeId };
    localStorage.setItem(LS.station, JSON.stringify(sess.station));
    sess.sessionExpired = false;
    subscribeMine(); // token now carries role:'prefect' — (re)attach the own-submissions feed
    sess.phase = sess.prefectName ? 'ready' : 'need-name';
  } catch (e) {
    sess.error = (e as { message?: string })?.message ?? 'That access code was not valid.';
    sess.phase = sess.user && sess.station ? 'ready' : 'need-code';
  }
}

export function setName(name: string): void {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (clean.length < 2) return; // a contactable name is REQUIRED — never proceed without one
  sess.prefectName = clean;
  localStorage.setItem(LS.name, clean);
  if (sess.user && sess.station) sess.phase = 'ready';
}

export function signOutStation(): void {
  localStorage.removeItem(LS.station);
  sess.station = null;
  sess.phase = 'need-code';
}

function subscribeData(): void {
  if (dataSubs.length) return;
  const db = getDb({ offline: true });
  dataSubs.push(
    onSnapshot(collection(db, paths.forms()), (s) => {
      sess.forms = s.docs.map((d) => d.data() as Form).sort((a, b) => a.order - b.order);
    }),
  );
  dataSubs.push(
    onSnapshot(collection(db, paths.events()), (s) => {
      sess.events = s.docs.map((d) => d.data() as EventDef).sort((a, b) => a.order - b.order);
    }),
  );
  dataSubs.push(
    onSnapshot(doc(db, paths.schedule()), (s) => {
      sess.schedule = (s.data() as ScheduleDoc) ?? null;
    }),
  );
}

/**
 * The prefect's own submissions feed (powers save-confirmation, the "not yet sent" count and
 * the clarification cards). The Firestore rule requires role:'prefect' on the token, so this
 * MUST be (re)attached only AFTER a claim has put the claim on the token — attaching it during
 * the initial anonymous sign-in (before claimAccessCode) gets a permanent permission-denied that
 * silently breaks the read-back. Call it on a fresh claim and once a returning session's claims
 * are verified. Re-subscribes cleanly if called again with a newer token.
 */
function subscribeMine(): void {
  const u = getAuthInstance().currentUser;
  if (!u) return;
  const db = getDb({ offline: true });
  mySub?.();
  mySub = onSnapshot(
    query(collection(db, paths.submissions()), where('attribution.submittedByUid', '==', u.uid)),
    (s) => {
      // The submissions collection is shared across seasons; the offline cache + anon uid are
      // per-origin, so a dry-run's docs would otherwise leak into the LIVE app's badges/sync
      // count. Keep only this (live or dry-run) season's. (Legacy docs with no seasonId = live.)
      sess.mySubmissions = s.docs
        .filter((d) => ((d.data() as Submission).seasonId ?? SEASON_ID) === getSeasonId())
        .map((d) => {
          const sub = d.data() as Submission;
          return {
            contestId: sub.contestId,
            clientSubmissionId: sub.clientSubmissionId,
            pending: d.metadata.hasPendingWrites,
            status: sub.status,
            clarification: sub.clarification ?? null,
          };
        });
    },
    () => {
      // A denied/closed listener (e.g. claims not yet live) — leave the last good list in place;
      // claim()/verifyStationClaims will re-attach once the prefect role is on the token.
    },
  );
}

// ---- derived helpers ---------------------------------------------------------
export function formsForYear(year: string): Form[] {
  return sess.forms.filter((f) => f.year === year);
}

export function scopedEvents(): EventDef[] {
  const scope = sess.station?.eventScope ?? [];
  if (!scope.length) return sess.events; // fallback (rules will still gate)
  return sess.events.filter((e) => scope.includes(e.id));
}

export function pendingCount(): number {
  return sess.mySubmissions.filter((s) => s.pending).length;
}

export interface ClarificationItem {
  contestId: string;
  message: string;
  byName: string;
}

/** Races the results tent has sent back to THIS prefect with a question, awaiting a resubmit. */
export function clarifications(): ClarificationItem[] {
  return sess.mySubmissions
    .filter((s) => s.status === 'clarify' && s.clarification)
    .map((s) => ({ contestId: s.contestId, message: s.clarification!.message, byName: s.clarification!.byName }));
}

const eventOf = (contestId: string): string => contestId.split('__')[1] ?? '';

export interface RaceCandidate {
  contestId: string;
  time: number; // scheduled minutes-since-midnight
  near: boolean; // nearest to 'now' — the likely race being recorded
}

/**
 * Up to `max` in-scope races NEAREST to 'now' (excluding ones this device already submitted), so a
 * prefect picks the right race even when the day is running ahead or behind — the timetable is a
 * suggestion, not a constraint. Empty unless it's the event day; nearest one(s) flagged `near`.
 */
export function stationCandidates(
  submitted: Set<string>,
  max = 4,
): { items: RaceCandidate[]; offset: number; phase: DayPhase; eventDate: string | null } {
  const sched = sess.schedule;
  if (!sched?.slots?.length) return { items: [], offset: 0, phase: 'today', eventDate: null };
  const offset = sched.offsetMin ?? 0;
  const eventDate = sched.eventDate ?? null;
  const phase = eventDayPhase(eventDate, new Date());
  if (phase !== 'today') return { items: [], offset, phase, eventDate };
  const scope = sess.station?.eventScope ?? [];
  const adjustedNow = sess.clockMin - offset;
  const raw: { contestId: string; time: number }[] = [];
  for (const s of sched.slots) {
    if (s.kind === 'info') continue;
    for (const c of s.contestIds ?? []) {
      if (scope.length && !scope.includes(eventOf(c))) continue;
      if (submitted.has(c)) continue; // already recorded on this phone
      raw.push({ contestId: c, time: s.time });
    }
  }
  if (!raw.length) return { items: [], offset, phase, eventDate };
  // nearest to 'now' first (ties: earlier first); take the closest few, then show in time order.
  raw.sort((a, b) => Math.abs(a.time - adjustedNow) - Math.abs(b.time - adjustedNow) || a.time - b.time);
  const picked = raw.slice(0, max);
  const nearestDist = Math.abs(picked[0]!.time - adjustedNow);
  picked.sort((a, b) => a.time - b.time);
  return {
    items: picked.map((r) => ({ ...r, near: Math.abs(r.time - adjustedNow) === nearestDist })),
    offset,
    phase,
    eventDate,
  };
}

export function submittedContestIds(): Set<string> {
  return new Set(sess.mySubmissions.map((s) => s.contestId));
}

/** Fire-and-forget, offline-safe submit. Never await — offline the promise won't resolve. */
export function submit(
  c: { contestId: string; year: string; event: string; string: string },
  placements: Placement[],
  attemptId: string,
  winnerMark: number | null = null,
): void {
  const db = getDb({ offline: true });
  const u = getAuthInstance().currentUser;
  if (!u || !sess.station) return;
  sess.lastWriteError = '';
  latestAttempt = attemptId;
  const dev = deviceId();
  // One submission per (season, device, contest): a correction from the SAME phone overwrites
  // the earlier entry (the tent only sees this prefect's latest order — never a self-conflict),
  // and the season prefix stops a dry-run write from clobbering an unsynced LIVE one in the
  // shared offline cache.
  const id = `${getSeasonId()}__${dev}__${c.contestId}`;
  const data: Submission = {
    id,
    seasonId: getSeasonId(),
    contestId: c.contestId,
    year: c.year,
    event: c.event,
    string: c.string,
    placements,
    status: 'pending',
    attribution: {
      submittedByUid: u.uid,
      prefectName: sess.prefectName,
      areaCode: sess.station.areaCode,
      codeId: sess.station.codeId,
      deviceId: dev,
    },
    clientCreatedAt: Date.now(),
    clientSubmissionId: attemptId,
    syncedAt: null,
    winnerMark,
  };
  // Intentionally not awaited for the happy path: offline, the promise never resolves, and
  // the local cache write (verified via mySubmissions read-back in the UI) is what we show as
  // "Saved". But a *rejection* means a real failure (e.g. blocked/full storage) — surface it.
  void setDoc(doc(db, paths.submissions(), id), data).catch((e: { code?: string; message?: string }) => {
    // 'unavailable' just means offline — that write is queued locally, not lost. Only
    // surface the error if this is still the latest attempt (avoid mis-attributing it).
    if (e?.code === 'unavailable' || attemptId !== latestAttempt) return;
    if (e?.code === 'permission-denied') {
      // The rules rejected the write — almost always a lapsed station sign-in (lost prefect
      // claims). Give an actionable message and re-verify, which drops the stale station so the
      // prefect is taken back to the code screen rather than retrying a write that can't succeed.
      sess.lastWriteError = 'Your station sign-in has expired — re-scan your access code, then submit this result again.';
      void verifyStationClaims(null);
      return;
    }
    sess.lastWriteError = e?.message ?? 'Could not save on this device.';
  });
}

export function newAttemptId(): string {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^a-z0-9]/gi, '').slice(0, 10);
}
