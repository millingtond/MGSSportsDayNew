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
