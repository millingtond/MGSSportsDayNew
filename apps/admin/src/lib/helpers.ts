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
// 1st-place mark parsing / formatting / sanity-checking now lives in @mgs/ui, so a time or
// distance means exactly the same thing (and mm:ss works the same) in the entry app, the
// results tent and the scoreboard. Re-exported here so existing imports keep resolving.
// ---------------------------------------------------------------------------
export {
  checkMark,
  parseMark,
  formatMark,
  markPlaceholder,
  markFormatHint,
  markInputMode,
  validateMarkInput,
  looksLikeMinutes,
  type MarkLevel,
  type MarkValidation,
} from '@mgs/ui';
