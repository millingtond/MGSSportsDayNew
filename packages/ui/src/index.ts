/** Shared presentation helpers for the MGS Sports Day apps. */

import type { FormStanding, ScheduleSlot } from '@mgs/config-types';

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 11 -> "11th". */
export function ordinal(n: number): string {
  if (n <= 0) return '—';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

export type Delta = 'up' | 'down' | 'same' | 'new';

/** Direction a form moved since the previous standings (for up/down arrows). */
export function rankDelta(current: number, previous: number | null | undefined): Delta {
  if (previous == null || previous === 0) return 'new';
  if (current < previous) return 'up';
  if (current > previous) return 'down';
  return 'same';
}

/** Black or white text for legibility on a coloured chip. */
export function contrastText(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // relative luminance
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? '#0f172a' : '#ffffff';
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Sort forms for a whole-school or per-year leaderboard (by schoolPos/yearPos asc). */
export function sortByPos(forms: FormStanding[], key: 'schoolPos' | 'yearPos'): FormStanding[] {
  return [...forms].sort((a, b) => {
    const pa = a[key] || 999;
    const pb = b[key] || 999;
    if (pa !== pb) return pa - pb;
    return b.total - a.total || a.label.localeCompare(b.label);
  });
}

/** "5s ago", "2m ago" — for the results ticker. */
export function timeAgo(epochMs: number, now: number): string {
  const s = Math.max(0, Math.round((now - epochMs) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export const MEDAL = ['🥇', '🥈', '🥉'];

/** Initials from a name: "Aisha Patel" -> "AP", "Mary Jane Watson" -> "MJW". Up to 3 letters. */
export function initials(name: string | null | undefined): string {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts
    .slice(0, 3)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

// ---------------------------------------------------------------------------
// Marks: one shared parser / formatter / plausibility check, so a winning time or
// distance means EXACTLY the same thing wherever it is typed or shown. Track times
// are stored as a plain number of seconds; field results as metres. Track times can
// be typed as "minutes:seconds" (e.g. 2:05.4) OR plain seconds (125.4) — whichever
// the stopwatch shows — and are always displayed as m:ss once they pass a minute.
// ---------------------------------------------------------------------------

export type MarkUnits = 'second' | 'metre';

/** Round to `dp` decimals and drop trailing zeros: 12.40 -> "12.4", 12 -> "12". */
function trimDecimals(n: number, dp = 2): string {
  return String(Math.round(n * 10 ** dp) / 10 ** dp);
}

/**
 * Parse a typed mark into the stored number (seconds for track, metres for field).
 * Track accepts "m:ss(.d)" AND plain seconds. Returns null for blank OR unparseable input,
 * so a half-typed or nonsense value can never be silently stored as a wrong number.
 */
export function parseMark(input: string | number | null | undefined, units: MarkUnits, minutesLikely = false): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? input : null;
  const s = String(input ?? '').trim().replace(/,/g, '.');
  if (s === '') return null;

  if (units === 'second') {
    // Colon form: "M:SS" or "M:SS.d" (the canonical minutes:seconds notation).
    if (s.includes(':')) {
      const parts = s.split(':');
      if (parts.length !== 2) return null;
      const [mmStr, ssStr] = parts;
      // Both segments must be present + numeric — Number('') is 0, which would turn a half-typed
      // "2:" or ":30" into a real time. mm = whole minutes, ss = seconds (may be decimal).
      if (!/^\d+$/.test(mmStr) || !/^\d+(\.\d+)?$/.test(ssStr)) return null;
      const mm = Number(mmStr);
      const ss = Number(ssStr);
      if (!Number.isFinite(mm) || !Number.isFinite(ss) || ss >= 60) return null;
      const total = mm * 60 + ss;
      return total > 0 ? total : null;
    }
    // For events run in minutes, people habitually type the time with DOTS ("2.14" for 2:14,
    // "2.14.35" for 2:14.35). Disambiguate from plain decimal seconds: a value that is a plausible
    // number of seconds (>= 60) is taken literally; a smaller one (implausibly fast for a
    // minutes-length race) is read as minutes.seconds.
    if (minutesLikely && s.includes('.')) {
      const parts = s.split('.');
      if (parts.length === 3) {
        // "M.SS.d" -> M minutes, SS.d seconds
        const [mmStr, ssStr, decStr] = parts;
        if (/^\d+$/.test(mmStr) && /^\d{1,2}$/.test(ssStr) && /^\d+$/.test(decStr) && Number(ssStr) < 60) {
          const total = Number(mmStr) * 60 + Number(`${ssStr}.${decStr}`);
          return total > 0 ? total : null;
        }
        return null;
      }
      if (parts.length === 2) {
        const dec = Number(s);
        if (Number.isFinite(dec) && dec >= 60) return dec > 0 ? dec : null; // plain seconds, e.g. "134.35"
        const [mmStr, ssStr] = parts;
        if (/^\d+$/.test(mmStr) && /^\d{1,2}$/.test(ssStr) && Number(mmStr) < 20 && Number(ssStr) < 60) {
          const total = Number(mmStr) * 60 + Number(ssStr); // "2.14" -> 2:14
          return total > 0 ? total : null;
        }
      }
    }
  }

  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Display a stored mark: "2:05.4" for track times ≥ 1 min, "12.19s" under a minute, "4.35m" for field.
 * Pass `dp` to force a fixed number of decimal places (e.g. 2 for a records board: "2:23.00", "12.40")
 * so the decimal part always shows even when the mark is a whole number of seconds. Omit `dp` to trim
 * trailing zeros for a compact result.
 */
export function formatMark(value: number | null | undefined, units: MarkUnits, dp?: number): string {
  if (value == null || !Number.isFinite(value)) return '—';
  // Normalise to 2dp FIRST so a value like 119.999 becomes 120 (=> "2:00"), never "1:60".
  const v = Math.round(value * 100) / 100;
  const num = (n: number) => (dp != null ? n.toFixed(dp) : trimDecimals(n));
  if (units === 'metre') return `${num(v)}m`;
  if (v >= 60) {
    const mm = Math.floor(v / 60);
    const rem = Math.round((v - mm * 60) * 100) / 100; // exact 2dp, strictly < 60
    if (dp != null) {
      // Zero-pad the seconds to 2 integer digits + dp decimals: 5.4 -> "05.40", 23 -> "23.00".
      return `${mm}:${rem.toFixed(dp).padStart(dp > 0 ? dp + 3 : 2, '0')}`;
    }
    const whole = Math.floor(rem);
    const frac = Math.round((rem - whole) * 100); // 0..99
    let sec = String(whole).padStart(2, '0');
    if (frac > 0) sec += '.' + String(frac).padStart(2, '0').replace(/0$/, '');
    return `${mm}:${sec}`;
  }
  return `${num(v)}s`;
}

// Per-event plausible ranges for Years 7-10, in the stored unit (seconds / metres).
// `imp*` = physically impossible (≈ world-record territory and beyond) -> almost certainly a typo.
// `unu*` = outside the normal school range -> worth a double-check. B(elow)/A(bove) the raw value.
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

/** Plausibility of a numeric mark — catches a 2-second 800m, a 500m javelin, etc. */
export function checkMark(eventId: string, units: MarkUnits, score: number): { level: MarkLevel; message: string } {
  if (!Number.isFinite(score) || score <= 0) return { level: 'impossible', message: 'Enter a positive time or distance.' };
  const fallback: Bounds = units === 'second' ? { impB: 0.5, unuB: 0.5, unuA: 3600, impA: 3600 } : { impB: 0.01, unuB: 0.01, unuA: 150, impA: 150 };
  const b = MARK_BOUNDS[eventId] ?? fallback;
  const f = formatMark(score, units);
  if (score <= b.impB) return { level: 'impossible', message: units === 'second' ? `${f} is impossibly fast — check for a typo.` : `${f} is impossibly short — check for a typo.` };
  if (score >= b.impA) return { level: 'impossible', message: units === 'second' ? `${f} is impossibly slow — check for a typo.` : `${f} is impossibly far — check for a typo.` };
  if (score <= b.unuB) return { level: 'unusual', message: units === 'second' ? `${f} is unusually fast — please double-check.` : `${f} is unusually short — please double-check.` };
  if (score >= b.unuA) return { level: 'unusual', message: units === 'second' ? `${f} is unusually slow — please double-check.` : `${f} is unusually far — please double-check.` };
  return { level: 'ok', message: '' };
}

/** Does this event usually take over a minute? Drives the mm:ss example + keyboard. */
export function looksLikeMinutes(eventId: string): boolean {
  const b = MARK_BOUNDS[eventId];
  return !!b && b.impB >= 60;
}

/** A concrete placeholder for the mark input, matched to the event's expected format. */
export function markPlaceholder(eventId: string, units: MarkUnits): string {
  if (units === 'metre') return 'e.g. 4.35';
  return looksLikeMinutes(eventId) ? 'e.g. 2:05.4' : 'e.g. 12.19';
}

/** A one-line, plain-English hint that spells out exactly what to type. */
export function markFormatHint(eventId: string, units: MarkUnits): string {
  if (units === 'metre') return 'Distance in metres — e.g. 4.35';
  return looksLikeMinutes(eventId)
    ? 'Minutes:seconds — type 2:14.35 or 2.14.35 for 2 min 14.35 sec. (Plain seconds like 134.35 also work.)'
    : 'Seconds — e.g. 12.19. (For a long race you can type minutes:seconds, like 2:14.35.)';
}

/** A mm:ss race needs the ':' key (full keyboard); sprints & field get the number pad. */
export function markInputMode(eventId: string, units: MarkUnits): 'decimal' | 'text' {
  return units === 'second' && looksLikeMinutes(eventId) ? 'text' : 'decimal';
}

export interface MarkValidation {
  level: MarkLevel | 'invalid';
  message: string;
  value: number | null; // parsed stored number, or null if blank/unparseable
  empty: boolean;
}

/** Parse + plausibility in one call — the single source every input's live check uses. */
export function validateMarkInput(eventId: string, input: string | number | null | undefined, units: MarkUnits): MarkValidation {
  const raw = String(input ?? '').trim();
  if (raw === '') return { level: 'ok', message: '', value: null, empty: true };
  const value = parseMark(raw, units, looksLikeMinutes(eventId));
  if (value === null) {
    return {
      level: 'invalid',
      message: units === 'metre' ? 'Enter a distance in metres, e.g. 4.35.' : 'Enter a time like 2:05.4 (min:sec) or 12.19 (seconds).',
      value: null,
      empty: false,
    };
  }
  const c = checkMark(eventId, units, value);
  return { level: c.level, message: c.message, value, empty: false };
}

// ---- Schedule / timetable helpers -------------------------------------------

/** Minutes since local midnight for a Date (the schedule's time base). */
export function nowMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Minutes-since-midnight -> "09:22". */
export function formatClock(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Where 'today' sits relative to the event date. */
export type DayPhase = 'before' | 'today' | 'after';

/** Local 'YYYY-MM-DD' for a Date (matches ScheduleDoc.eventDate). */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Is today before / on / after the event date? No date set → always 'today' (live). */
export function eventDayPhase(eventDate: string | null | undefined, now: Date): DayPhase {
  if (!eventDate) return 'today';
  const today = localDateKey(now);
  return today < eventDate ? 'before' : today > eventDate ? 'after' : 'today';
}

/** 'YYYY-MM-DD' → 'Wednesday 1 July' (en-GB long weekday + day + month). Empty string if unset. */
export function formatEventDate(eventDate: string | null | undefined): string {
  if (!eventDate) return '';
  const d = new Date(eventDate + 'T12:00:00'); // midday-local parse avoids a TZ date shift
  return isNaN(d.getTime()) ? eventDate : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export interface ScheduleView {
  current: ScheduleSlot | null; // most-recently-started timed slot
  next: ScheduleSlot | null; // next timed slot
  fieldRunning: ScheduleSlot[]; // field events in the block currently in progress
  started: boolean; // the day has begun (adjustedNow >= first slot)
  finished: boolean; // past the final slot
  adjustedNow: number; // wall-clock minus the running-late offset
  phase: DayPhase; // before / today / after the event date
}

const FIELD_LAST_BLOCK_MIN = 60; // the final field block runs ~this long

/** Compute now / next / field-running from the timetable + a "running N min late" offset.
 *  `phase` gates the live logic: 'before' shows the opening slot as upcoming, 'after' reports
 *  finished, only 'today' produces a live current/now. */
export function scheduleView(slots: ScheduleSlot[], offsetMin: number, nowMin: number, phase: DayPhase = 'today'): ScheduleView {
  const adjustedNow = nowMin - (offsetMin || 0);
  const sorted = [...slots].sort((a, b) => a.time - b.time);
  const timed = sorted.filter((s) => s.kind !== 'field');

  if (phase === 'before') {
    return { current: null, next: timed[0] ?? null, fieldRunning: [], started: false, finished: false, adjustedNow, phase };
  }
  if (phase === 'after') {
    return { current: timed[timed.length - 1] ?? null, next: null, fieldRunning: [], started: true, finished: true, adjustedNow, phase };
  }

  const fields = sorted.filter((s) => s.kind === 'field');

  let current: ScheduleSlot | null = null;
  let next: ScheduleSlot | null = null;
  for (const s of timed) {
    if (s.time <= adjustedNow) current = s;
    else {
      next = s;
      break;
    }
  }

  // Which field block is in progress (each runs until the next block starts; the final block
  // for ~FIELD_LAST_BLOCK_MIN, but never past the last race of the day — so the "Field" chip
  // clears before the relays' tail / Presentation / Disperse instead of lingering for an hour).
  const lastContestTime = sorted.reduce((m, s) => (s.contestIds?.length ? Math.max(m, s.time) : m), 0);
  const fieldStarts = [...new Set(fields.map((s) => s.time))].sort((a, b) => a - b);
  let blockStart: number | null = null;
  for (let i = 0; i < fieldStarts.length; i++) {
    const start = fieldStarts[i]!;
    const end = fieldStarts[i + 1] ?? Math.min(start + FIELD_LAST_BLOCK_MIN, Math.max(lastContestTime, start) + 1);
    if (adjustedNow >= start && adjustedNow < end) {
      blockStart = start;
      break;
    }
  }
  const fieldRunning = blockStart == null ? [] : fields.filter((s) => s.time === blockStart);

  const first = sorted[0]?.time ?? 0;
  const last = sorted[sorted.length - 1]?.time ?? 0;
  return {
    current,
    next,
    fieldRunning,
    started: sorted.length > 0 && adjustedNow >= first,
    finished: sorted.length > 0 && adjustedNow > last,
    adjustedNow,
    phase,
  };
}

export interface OverdueItem {
  slot: ScheduleSlot;
  minsLate: number;
  outstanding: string[]; // contestIds still not committed
}

/**
 * Slots whose scheduled time has passed (by more than graceMin) but still have outstanding
 * contests — the results tent's "chase these" list. `isOutstanding` is supplied by the caller
 * (the admin app knows each contest's status).
 */
export function overdueSlots(
  slots: ScheduleSlot[],
  offsetMin: number,
  nowMin: number,
  isOutstanding: (contestId: string) => boolean,
  graceMin = 5,
): OverdueItem[] {
  const adjustedNow = nowMin - (offsetMin || 0);
  const out: OverdueItem[] = [];
  for (const s of slots) {
    if (!s.contestIds?.length) continue;
    if (s.time + graceMin > adjustedNow) continue; // not yet due (with grace)
    const outstanding = s.contestIds.filter(isOutstanding);
    if (outstanding.length) out.push({ slot: s, minsLate: Math.round(adjustedNow - s.time), outstanding });
  }
  return out.sort((a, b) => b.minsLate - a.minsLate);
}
