import { onSnapshot, doc, collection, type Unsubscribe } from 'firebase/firestore';
import { getDb, paths } from '@mgs/firebase';
import { nowMinutes } from '@mgs/ui';
import type { Standings, DisplayControl, FormStanding, EventDef, ScheduleDoc } from '@mgs/config-types';

export const YEAR_ORDER = ['Y7', 'Y8', 'Y9', 'Y10'];

export const YEAR_META: Record<string, { label: string; short: string; colour: string }> = {
  Y7: { label: 'Year 7', short: 'Y7', colour: '#ec4899' },
  Y8: { label: 'Year 8', short: 'Y8', colour: '#22c55e' },
  Y9: { label: 'Year 9', short: 'Y9', colour: '#eab308' },
  Y10: { label: 'Year 10', short: 'Y10', colour: '#14b8a6' },
};

/** Reactive season state shared across the scoreboard. */
export const season = $state({
  standings: null as Standings | null,
  control: null as DisplayControl | null,
  connected: false,
  lastUpdate: 0,
  ready: false,
  events: [] as EventDef[],
  schedule: null as ScheduleDoc | null,
  clockMin: nowMinutes(new Date()), // local time-of-day, ticked so now/next stays fresh
});

let unsubs: Unsubscribe[] = [];
let clockTimer: ReturnType<typeof setInterval> | undefined;

export function startSeason(): void {
  if (unsubs.length) return;
  const db = getDb();
  unsubs.push(
    onSnapshot(doc(db, paths.schedule()), (snap) => {
      season.schedule = (snap.data() as ScheduleDoc) ?? null;
    }),
  );
  if (!clockTimer) clockTimer = setInterval(() => (season.clockMin = nowMinutes(new Date())), 15000);
  unsubs.push(
    onSnapshot(
      doc(db, paths.standings()),
      (snap) => {
        season.standings = (snap.data() as Standings) ?? null;
        season.connected = !snap.metadata.fromCache;
        season.lastUpdate = Date.now();
        season.ready = true;
      },
      () => {
        season.connected = false;
      },
    ),
  );
  unsubs.push(
    onSnapshot(doc(db, paths.control()), (snap) => {
      season.control = (snap.data() as DisplayControl) ?? null;
    }),
  );
  unsubs.push(
    onSnapshot(collection(db, paths.events()), (snap) => {
      season.events = snap.docs.map((d) => d.data() as EventDef).sort((a, b) => a.order - b.order);
    }),
  );
}

export function stopSeason(): void {
  unsubs.forEach((u) => u());
  unsubs = [];
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = undefined;
  }
}

export function allForms(s: Standings | null): FormStanding[] {
  // Guard `s.forms` too: a structurally corrupt/partial standings doc (missing forms map) must
  // not crash the public board with "Cannot convert undefined to object" — show empty instead.
  return s && s.forms ? Object.values(s.forms) : [];
}

export function formsForYear(s: Standings | null, year: string): FormStanding[] {
  return allForms(s).filter((f) => f.year === year);
}

export interface EventResultRow {
  form: FormStanding;
  points: number;
  position: number;
}

export function scoreboardContestId(year: string, event: string, str: string): string {
  return `${year}__${event}__${str}`;
}

/** Reconstruct an event-string's finishing order from each form's per-contest points
 * (no extra Firestore reads — it's all in the standings doc the board already has). */
export function contestResults(s: Standings | null, contestId: string): EventResultRow[] {
  if (!s) return [];
  const rows = Object.values(s.forms)
    .filter((f) => f.byEvent[contestId] != null)
    .map((f) => ({ form: f, points: f.byEvent[contestId]! }));
  rows.sort((a, b) => b.points - a.points || a.form.label.localeCompare(b.form.label));
  return rows.map((r) => ({ ...r, position: 1 + rows.filter((x) => x.points > r.points).length }));
}

/** The winner (form label) of a contest, if any results are in. */
export function contestWinner(s: Standings | null, contestId: string): FormStanding | null {
  return contestResults(s, contestId)[0]?.form ?? null;
}
