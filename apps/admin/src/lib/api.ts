/** Thin wrappers around the admin Cloud Functions + direct allowed Firestore writes. */

import { setDoc, updateDoc, addDoc, doc, collection } from 'firebase/firestore';
import { getDb, callable, paths, getSeasonId, getAuthInstance } from '@mgs/firebase';
import type { SeasonConfig, DisplayMode, Placement } from '@mgs/config-types';
import { sha256hex, generateCode } from './helpers';

// ---- Callable Cloud Functions ----------------------------------------------

export interface CommitInput {
  seasonId: string;
  contestId: string;
  placements: Placement[];
  reason?: string;
  expectedVersion?: number;
}
export interface CommitResult {
  ok: boolean;
  version: number;
  action: 'commit' | 'correct';
}

export function commitContest(input: Omit<CommitInput, 'seasonId'>): Promise<CommitResult> {
  return callable<CommitInput, CommitResult>('commitContest')({ seasonId: getSeasonId(), ...input }).then((r) => r.data);
}

export function voidContest(contestId: string, reason: string): Promise<unknown> {
  return callable<{ seasonId: string; contestId: string; reason: string }, { ok: boolean }>('voidContest')({
    seasonId: getSeasonId(),
    contestId,
    reason,
  }).then((r) => r.data);
}

export function unvoidContest(contestId: string): Promise<unknown> {
  return callable<{ seasonId: string; contestId: string }, { ok: boolean; status: string }>('unvoidContest')({
    seasonId: getSeasonId(),
    contestId,
  }).then((r) => r.data);
}

export interface RecordEntryResult {
  ok: boolean;
  changed?: boolean;
  doScore: 0 | 1 | 2;
  kind: 'beat' | 'equal' | 'none';
}
export function recordEntry(
  recordId: string,
  currentScore: number | null,
  currentForm: string | null,
  keepBest = false,
): Promise<RecordEntryResult> {
  return callable<
    { seasonId: string; recordId: string; currentScore: number | null; currentForm: string | null; keepBest: boolean },
    RecordEntryResult
  >('recordEntry')({ seasonId: getSeasonId(), recordId, currentScore, currentForm, keepBest }).then((r) => r.data);
}

export function recomputeStandings(): Promise<unknown> {
  return callable<{ seasonId: string }, { ok: boolean }>('recomputeStandings')({ seasonId: getSeasonId() }).then((r) => r.data);
}

/** Send a submission back to its prefect with a question; it returns to the queue once they resubmit. */
export function requestClarification(submissionId: string, message: string): Promise<{ ok: boolean }> {
  return callable<{ seasonId: string; submissionId: string; message: string }, { ok: boolean }>('requestClarification')({
    seasonId: getSeasonId(),
    submissionId,
    message,
  }).then((r) => r.data);
}

export interface SeedResult {
  ok: boolean;
  forms: number;
  events: number;
  contests: number;
  records: number;
}
/** Initialise (or, with force, reset) the whole season from the canonical seed data. */
export function seedSeason(force = false): Promise<SeedResult> {
  return callable<{ force: boolean; seasonId: string }, SeedResult>('seedSeason')({ force, seasonId: getSeasonId() }).then((r) => r.data);
}

export function addAdmin(email: string): Promise<{ ok: boolean; uid: string }> {
  return callable<{ email: string }, { ok: boolean; uid: string }>('addAdmin')({ email }).then((r) => r.data);
}

export function removeAdmin(uid: string): Promise<unknown> {
  return callable<{ uid: string }, { ok: boolean }>('removeAdmin')({ uid }).then((r) => r.data);
}

// ---- Direct Firestore writes (allowed for admins by rules) ------------------

/** Persist the (already-mutated) season config doc, bumping configVersion, then recompute. */
export async function saveConfig(config: SeasonConfig): Promise<void> {
  const next: SeasonConfig = { ...config, configVersion: (config.configVersion ?? 0) + 1 };
  await setDoc(doc(getDb(), paths.season()), next);
  await recomputeStandings();
}

/** Save a single roster form doc (code/label/colour edits). Recompute afterwards. */
export async function saveForm(formId: string, patch: Record<string, unknown>): Promise<void> {
  await updateDoc(doc(getDb(), `${paths.forms()}/${formId}`), patch);
}

export async function setControl(patch: { mode: DisplayMode; message?: string | null; revealScope?: string | null }): Promise<void> {
  const uid = getAuthInstance().currentUser?.uid ?? '';
  await setDoc(doc(getDb(), paths.control()), {
    seasonId: getSeasonId(),
    mode: patch.mode,
    message: patch.message ?? null,
    revealScope: patch.revealScope ?? null,
    updatedAt: Date.now(),
    updatedBy: uid,
  });
}

/** Publish (or refresh) the timetable for this season without a reseed — preserves the offset. */
export function publishSchedule(): Promise<{ ok: boolean; slots: number }> {
  return callable<{ seasonId: string }, { ok: boolean; slots: number }>('publishSchedule')({ seasonId: getSeasonId() }).then((r) => r.data);
}

/** Adjust the timetable's "running N minutes behind" offset (shifts now/next/overdue). */
export async function setScheduleOffset(offsetMin: number): Promise<void> {
  await updateDoc(doc(getDb(), paths.schedule()), { offsetMin: Math.round(offsetMin) });
}

/** Set the event date ('YYYY-MM-DD') — now/next/overdue only go live on this day. */
export async function setScheduleEventDate(eventDate: string): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || Number.isNaN(new Date(eventDate + 'T12:00:00').getTime())) {
    throw new Error('Event date must be a valid YYYY-MM-DD.');
  }
  await updateDoc(doc(getDb(), paths.schedule()), { eventDate });
}

export interface NewAccessCode {
  areaCode: string;
  eventScope: string[];
  expiresAt: number;
  maxMints: number;
}

/** Create an access code; returns the PLAINTEXT code (only shown once) + doc id. */
export async function createAccessCode(input: NewAccessCode): Promise<{ code: string; id: string }> {
  const code = generateCode(8);
  const codeHash = await sha256hex(code);
  const ref = await addDoc(collection(getDb(), 'accessCodes'), {
    code, // plaintext kept (admin-only collection) so the QR/link can be re-shown later
    codeHash,
    areaCode: input.areaCode,
    eventScope: input.eventScope,
    expiresAt: input.expiresAt,
    maxMints: input.maxMints,
    mints: 0,
    active: true,
    createdAt: Date.now(),
  });
  return { code, id: ref.id };
}

export async function setAccessCodeActive(id: string, active: boolean): Promise<void> {
  // Routed through a Function so disabling can also revoke prefects already minted from it.
  await callable<{ codeId: string; active: boolean }, { ok: boolean }>('setCodeActive')({ codeId: id, active });
}

/** Permanently delete a station code (revokes its prefects, then removes the doc). */
export async function deleteAccessCode(id: string): Promise<void> {
  await callable<{ codeId: string }, { ok: boolean }>('deleteCode')({ codeId: id });
}
