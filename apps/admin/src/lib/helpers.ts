/** Pure helpers for the admin console (no runes, no Firebase). */

import type { Form, EventDef, Contest, Placement, RecordDoc } from '@mgs/config-types';

// ---------------------------------------------------------------------------
// Scoring constants + record evaluation, mirrored from @mgs/scoring.
// (The admin package does not depend on @mgs/scoring directly, so the few
// pure values/functions the console needs are inlined here to stay in sync.)
// ---------------------------------------------------------------------------

/** The canonical MGS ladder: rank (1-based) -> points. */
export const DEFAULT_LADDER: readonly number[] = [
  31, 29, 28, 27, 26, 25, 24, 23, 22, 21, // ranks 1-10  (A string)
  20, 19, 18, 17, 16, 15, 14, 13, 12, 11, // ranks 11-20 (B string)
  10, 9, 8, 7, 6, 5, 4, 3, 2, 1, // ranks 21-30 (C string)
];

/** Linear alternative ladder (1st = 8 ... 8th = 1). */
export const LINEAR_LADDER: readonly number[] = [8, 7, 6, 5, 4, 3, 2, 1];

export const DEFAULT_STRING_OFFSETS: Readonly<Record<string, number>> = { A: 0, B: 10, C: 20 };

export type RecordKind = 'none' | 'equal' | 'beat';

/** Whether this year's best (currentScore) beats/equals the standing record. */
export function evaluateRecord(rec: Pick<RecordDoc, 'units' | 'standingScore' | 'currentScore'>): RecordKind {
  if (rec.currentScore == null) return 'none';
  if (rec.standingScore == null) return 'beat'; // no prior record -> any mark sets one
  if (rec.currentScore === rec.standingScore) return 'equal';
  const better = rec.units === 'second' ? rec.currentScore < rec.standingScore : rec.currentScore > rec.standingScore;
  return better ? 'beat' : 'none';
}

export const YEAR_ORDER = ['Y7', 'Y8', 'Y9', 'Y10'];

export const YEAR_META: Record<string, { label: string; short: string; colour: string }> = {
  Y7: { label: 'Year 7', short: 'Y7', colour: '#db2777' },
  Y8: { label: 'Year 8', short: 'Y8', colour: '#16a34a' },
  Y9: { label: 'Year 9', short: 'Y9', colour: '#ca8a04' },
  Y10: { label: 'Year 10', short: 'Y10', colour: '#0d9488' },
};

export function yearLabel(year: string): string {
  return YEAR_META[year]?.label ?? year;
}

export function yearSort(a: string, b: string): number {
  const ia = YEAR_ORDER.indexOf(a);
  const ib = YEAR_ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
}

/** Parse a contestId 'Y9__100m__A' into parts (fallback to doc fields if odd shape). */
export function parseContestId(id: string): { year: string; event: string; string: string } {
  const [year = '', event = '', string = ''] = id.split('__');
  return { year, event, string };
}

export function contestLabel(c: Pick<Contest, 'year' | 'event' | 'string'>, events?: EventDef[]): string {
  const ev = events?.find((e) => e.id === c.event);
  const evLabel = ev?.label ?? c.event;
  return `${c.year} · ${evLabel} · String ${c.string}`;
}

/**
 * A short, easily-typeable identifier for a contest, used for type-to-confirm prompts on
 * destructive actions — e.g. "Y9 100m A". ASCII-only (× -> x) and space-separated so it can
 * be typed straight in; the dialog matches it case-insensitively with whitespace collapsed.
 */
export function contestTypePhrase(c: Pick<Contest, 'year' | 'event' | 'string'>, events?: EventDef[]): string {
  const ev = events?.find((e) => e.id === c.event);
  const evLabel = (ev?.label ?? c.event).replace(/×/g, 'x');
  return `${c.year} ${evLabel} ${c.string}`.replace(/\s+/g, ' ').trim();
}

export function formLabel(formId: string, forms: Form[]): string {
  return forms.find((f) => f.id === formId)?.label ?? formId;
}

export function formsForYear(forms: Form[], year: string): Form[] {
  return forms.filter((f) => f.year === year).sort((a, b) => a.order - b.order);
}

/** Are two placement lists identical (same forms in the same order/position)? */
export function placementsEqual(a: Placement[], b: Placement[]): boolean {
  if (a.length !== b.length) return false;
  const norm = (p: Placement[]) =>
    [...p].sort((x, y) => x.position - y.position || x.formId.localeCompare(y.formId)).map((x) => `${x.position}:${x.formId}`).join('|');
  return norm(a) === norm(b);
}

/** SHA-256 hex of a string using the Web Crypto API. */
export async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no easily-confused chars (0/O, 1/I)

/** Generate a random short station code (default 8 uppercase alphanumerics; ~40 bits). */
export function generateCode(len = 8): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return out;
}

export function formatDateTime(epochMs: number | null | undefined): string {
  if (!epochMs) return '—';
  return new Date(epochMs).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function recordUnitHint(units: 'second' | 'metre'): string {
  return units === 'second' ? 'seconds — lower is better' : 'metres — higher is better';
}

// ---------------------------------------------------------------------------
// 1st-place mark sanity check — catches typos (a 100m "run" in 2s, a 500m javelin).
// Per-event plausible ranges for Years 7-10. `imp*` = physically impossible (≈ world-record
// territory and beyond) → almost certainly a typo. `unu*` = outside the normal school range
// → worth a manual double-check. Generous on purpose, to avoid crying wolf on a real result.
// Numbers are direction-agnostic: B(elow) / A(bove) the raw value (seconds: below=faster,
// above=slower; metres: below=shorter, above=farther).
// ---------------------------------------------------------------------------
type Bounds = { impB: number; unuB: number; unuA: number; impA: number };
const MARK_BOUNDS: Record<string, Bounds> = {
  '100m': { impB: 9, unuB: 11, unuA: 25, impA: 60 },
  '200m': { impB: 19, unuB: 22, unuA: 55, impA: 120 },
  '300m': { impB: 30, unuB: 38, unuA: 95, impA: 200 },
  '800m': { impB: 90, unuB: 115, unuA: 360, impA: 600 },
  '1500m': { impB: 180, unuB: 240, unuA: 720, impA: 1200 },
  '4x200m': { impB: 80, unuB: 95, unuA: 220, impA: 400 },
  '4x100m': { impB: 38, unuB: 45, unuA: 95, impA: 180 },
  longJump: { impB: 0.5, unuB: 1.5, unuA: 7, impA: 8.95 },
  javelin: { impB: 1, unuB: 5, unuA: 65, impA: 98 },
  shot: { impB: 0.5, unuB: 2, unuA: 17, impA: 23.5 },
  highJump: { impB: 0.5, unuB: 0.8, unuA: 2.0, impA: 2.45 },
};

export type MarkLevel = 'ok' | 'unusual' | 'impossible';

export function checkMark(eventId: string, units: 'second' | 'metre', score: number): { level: MarkLevel; message: string } {
  if (!Number.isFinite(score) || score <= 0) return { level: 'impossible', message: 'Enter a positive time or distance.' };
  const fallback: Bounds = units === 'second' ? { impB: 0.5, unuB: 0.5, unuA: 3600, impA: 3600 } : { impB: 0.01, unuB: 0.01, unuA: 150, impA: 150 };
  const b = MARK_BOUNDS[eventId] ?? fallback;
  const f = `${score}${units === 'second' ? 's' : 'm'}`;
  if (score <= b.impB) return { level: 'impossible', message: units === 'second' ? `${f} is impossibly fast — check for a typo.` : `${f} is impossibly short — check for a typo.` };
  if (score >= b.impA) return { level: 'impossible', message: units === 'second' ? `${f} is impossibly slow — check for a typo.` : `${f} is impossibly far — check for a typo.` };
  if (score <= b.unuB) return { level: 'unusual', message: units === 'second' ? `${f} is unusually fast — please double-check.` : `${f} is unusually short — please double-check.` };
  if (score >= b.unuA) return { level: 'unusual', message: units === 'second' ? `${f} is unusually slow — please double-check.` : `${f} is unusually far — please double-check.` };
  return { level: 'ok', message: '' };
}
