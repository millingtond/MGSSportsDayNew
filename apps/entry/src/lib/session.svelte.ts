import { signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where, setDoc, type Unsubscribe } from 'firebase/firestore';
import { getDb, getAuthInstance, callable, paths, getSeasonId, SEASON_ID } from '@mgs/firebase';
import { nowMinutes, eventDayPhase, type DayPhase } from '@mgs/ui';
import type { Form, EventDef, Submission, SubmissionStatus, SubmissionClarification, Placement, ScheduleDoc } from '@mgs/config-types';

const LS = { device: 'mgs_device_id', name: 'mgs_prefect_name', station: 'mgs_station' } as const;

type Station = { areaCode: string; eventScope: string[]; codeId: string };
type Phase = 'loading' | 'need-code' | 'claiming' | 'need-name' | 'ready';

// localStorage can THROW (private browsing, full quota, locked-down phone), not just return
// null. Unguarded, that crashes session setup or — worse — silently fails to persist the
// device id / station so the prefect looks fine but loses their identity on reload. These
// helpers never throw; callers decide how to surface a failure.
function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

let memDeviceId: string | null = null; // session-stable fallback when localStorage is blocked
function deviceId(): string {
  if (memDeviceId) return memDeviceId;
  let id = lsGet(LS.device);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^a-z0-9]/gi, '').slice(0, 24);
    if (!lsSet(LS.device, id)) {
      // Persisting failed: keep the id in memory so it's at least stable for THIS session
      // (no duplicate submissions while the app stays open), but warn — a reload will lose it.
      sess.lastWriteError =
        'This phone is blocking storage (private browsing?). Keep this tab open — reloading may lose your station, and switch off private browsing if you can.';
    }
  }
  memDeviceId = id;
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
  schedule: null as ScheduleDoc | null,
  clockMin: nowMinutes(new Date()), // local time-of-day, ticked so now/next stays fresh
});

let started = false;
let clockTimer: ReturnType<typeof setInterval> | undefined;
let dataSubs: Unsubscribe[] = [];
let latestAttempt = ''; // scopes lastWriteError to the most recent submit

export async function initSession(codeFromUrl: string | null): Promise<void> {
  if (started) return;
  started = true;

  sess.prefectName = lsGet(LS.name) ?? '';
  const storedStation = lsGet(LS.station);
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
    if (u) subscribeData();
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
    subscribeMine(); // token now carries the prefect role — safe to read our own submissions
    if (!lsSet(LS.station, JSON.stringify(sess.station))) {
      // The claim succeeded server-side and works for this session; warn that a reload may
      // drop it so the prefect keeps the tab open (or re-scans the QR) rather than losing access.
      sess.lastWriteError =
        'Could not save your station on this phone (storage blocked). Keep this tab open — if it reloads, re-scan the QR code.';
    }
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
  if (!lsSet(LS.name, clean)) {
    sess.lastWriteError = 'Could not save your name on this phone (storage blocked). Keep this tab open.';
  }
  if (sess.user && sess.station) sess.phase = 'ready';
}

export function signOutStation(): void {
  localStorage.removeItem(LS.station);
  sess.station = null;
  sess.phase = 'need-code';
}

let publicAttached = false;
function subscribeData(): void {
  // Own-flag (not dataSubs.length) so subscribeMine() pushing first can't make us skip the
  // world-readable forms/events/schedule listeners.
  if (publicAttached) return;
  publicAttached = true;
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
  // Reading the prefect's OWN submissions needs the prefect role claim. Only attach that listener
  // once a station code is claimed (sess.station set) — otherwise an anonymous pre-claim session
  // trips a permission-denied in the listener. A fresh claim re-attaches via subscribeMine().
  if (sess.station) subscribeMine();
}

let mineAttached = false;
function subscribeMine(): void {
  if (mineAttached) return;
  const u = getAuthInstance().currentUser;
  if (!u) return;
  mineAttached = true;
  const db = getDb({ offline: true });
  dataSubs.push(
    onSnapshot(query(collection(db, paths.submissions()), where('attribution.submittedByUid', '==', u.uid)), (s) => {
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
    }),
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
  // A submission the tent deleted ('rejected') no longer counts as recorded on this phone, so
  // the race re-appears in the prefect's station suggestions and can be recorded again. (A
  // 'committed'/'superseded' race is genuinely done and stays hidden.)
  return new Set(sess.mySubmissions.filter((s) => s.status !== 'rejected').map((s) => s.contestId));
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
    if (e?.code !== 'unavailable' && attemptId === latestAttempt) {
      sess.lastWriteError = e?.message ?? 'Could not save on this device.';
    }
  });
}

export function newAttemptId(): string {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^a-z0-9]/gi, '').slice(0, 10);
}
