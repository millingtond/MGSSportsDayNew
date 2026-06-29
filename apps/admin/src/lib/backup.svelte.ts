/**
 * Off-platform backup of the RAW prefect submissions — the event-day safety net.
 *
 * The whole `submissions` collection (every status, pending and committed) is the source of
 * truth for what prefects actually entered; this saves a copy to the tent laptop so that even
 * if the platform itself has a problem you can fall back to "the old method" from a file.
 *
 * Two modes: a manual one-click backup (CSV + JSON), and an opt-in timer that auto-saves a CSV
 * every few minutes — but only when something has changed, so it doesn't spam the Downloads
 * folder. Reads only (admins may read the whole collection); never touches the commit/scoring path.
 */
import { collection, getDocs } from 'firebase/firestore';
import { getDb, paths, getSeasonId, SEASON_ID } from '@mgs/firebase';
import type { Submission } from '@mgs/config-types';
import { data } from './data.svelte';
import { exportSubmissionsCsv, exportSubmissionsJson } from './export';

const INTERVAL_MS = 5 * 60 * 1000; // auto-save cadence
const LS_KEY = 'mgs.autobackup';

export const backup = $state({
  enabled: false,
  busy: false,
  lastAt: null as number | null,
  lastCount: 0,
  lastError: null as string | null,
});

let timer: ReturnType<typeof setInterval> | undefined;
let lastFingerprint = '';

/** Read the entire submissions collection for the active (live or dry-run) season. */
async function fetchAllSubmissions(): Promise<Submission[]> {
  const snap = await getDocs(collection(getDb(), paths.submissions()));
  const season = getSeasonId();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Submission, 'id'>) }))
    .filter((s) => (s.seasonId ?? SEASON_ID) === season);
}

function formLabels(): Record<string, string> {
  const m: Record<string, string> = {};
  for (const f of data.forms) m[f.id] = f.label;
  return m;
}

/** Cheap change-detector so the auto-saver only writes when the queue actually moved. */
function fingerprint(subs: Submission[]): string {
  let maxCreated = 0;
  let resolved = 0;
  for (const s of subs) {
    if (s.clientCreatedAt > maxCreated) maxCreated = s.clientCreatedAt;
    if (s.status !== 'pending') resolved++;
  }
  return `${subs.length}:${maxCreated}:${resolved}`;
}

/** Manual backup — downloads CSV + JSON. Throws on failure (the caller shows a toast). */
export async function backupNow(): Promise<number> {
  if (backup.busy) return backup.lastCount;
  backup.busy = true;
  try {
    const subs = await fetchAllSubmissions();
    exportSubmissionsCsv(subs, formLabels());
    exportSubmissionsJson(subs);
    backup.lastAt = Date.now();
    backup.lastCount = subs.length;
    backup.lastError = null;
    lastFingerprint = fingerprint(subs);
    return subs.length;
  } catch (e) {
    backup.lastError = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    backup.busy = false;
  }
}

/** Auto tick — CSV only, and only when the submissions changed since the last save. */
async function tick(): Promise<void> {
  if (backup.busy) return;
  backup.busy = true;
  try {
    const subs = await fetchAllSubmissions();
    const fp = fingerprint(subs);
    if (fp === lastFingerprint) return; // nothing new — skip
    exportSubmissionsCsv(subs, formLabels());
    backup.lastAt = Date.now();
    backup.lastCount = subs.length;
    backup.lastError = null;
    lastFingerprint = fp;
  } catch (e) {
    backup.lastError = e instanceof Error ? e.message : String(e);
  } finally {
    backup.busy = false;
  }
}

/** Turn the auto-saver on/off. `immediate` saves a baseline file the moment the user opts in. */
export function setAutoBackup(enabled: boolean, immediate = false): void {
  backup.enabled = enabled;
  try {
    localStorage.setItem(LS_KEY, enabled ? '1' : '0');
  } catch {
    /* storage disabled (e.g. private mode) — the toggle still works for this session */
  }
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
  if (enabled) {
    timer = setInterval(tick, INTERVAL_MS);
    if (immediate) void tick();
  }
}

/** Called once the admin session is live: restores the persisted preference (no instant download). */
export function startAutoBackup(): void {
  let on = false;
  try {
    on = localStorage.getItem(LS_KEY) === '1';
  } catch {
    on = false;
  }
  if (on) setAutoBackup(true, false);
  else backup.enabled = false;
}

/** Stop the timer (e.g. on sign-out) without forgetting the persisted preference. */
export function stopAutoBackup(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
