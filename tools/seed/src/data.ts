/**
 * MGS Sports Day seed data for season 2026.
 *
 * Everything here is editable config (a teacher re-configures each year in the admin
 * UI). It is seeded with the real 2025 structure so the platform has a faithful,
 * working dataset to build, test, and demo against.
 *
 * Records are transcribed from the four per-year "MGS SPORTS DAY 2025 RECORDS" sheets
 * and ROLLED FORWARD: where 2025 beat a standing record, that 2025 mark becomes the
 * 2026 standing record (e.g. Y7 shot 8.70 -> 9.30; Y8 100m 12.30 -> 12.19).
 */

import type { YearGroup, Form, EventDef, SeasonConfig, RecordDoc, Contest, ScheduleSlot } from '@mgs/config-types';
import { makeDefaultScoring } from '@mgs/scoring';

export const SEASON_ID = '2026';

// ---- year groups -------------------------------------------------------------
// Accent colours loosely echo the 2025 record-sheet tab colours.
export const YEAR_GROUPS: YearGroup[] = [
  { id: 'Y7', label: 'Year 7', order: 1, colour: '#db2777' }, // pink
  { id: 'Y8', label: 'Year 8', order: 2, colour: '#16a34a' }, // green
  { id: 'Y9', label: 'Year 9', order: 3, colour: '#ca8a04' }, // gold
  { id: 'Y10', label: 'Year 10', order: 4, colour: '#0d9488' }, // teal
];

// ---- forms (32) --------------------------------------------------------------
// Y7/Y8 are single letters (fixed every year); Y9/Y10 are tutor-code pairs.
// These are the CONFIRMED 2026 form codes.
const FORM_CODES: Record<string, string[]> = {
  Y7: ['B', 'D', 'E', 'H', 'J', 'L', 'S', 'W'],
  Y8: ['B', 'D', 'E', 'H', 'J', 'L', 'S', 'W'],
  Y9: ['AAG/PH', 'DAB/MWB', 'DPS/SL', 'EAN/FEH', 'JD/NWD', 'JPB/JPJ', 'LJM/MW', 'LT/SJL'],
  Y10: ['ABD/MF', 'AC/SJW', 'AW/JLM', 'DS/MAN', 'DWI/JLL', 'FCB/RTW', 'HFB/RMC', 'MPC/SG'],
};

// 8 distinct chip colours, reused per year (the label disambiguates in whole-school view).
const FORM_PALETTE = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

export function formId(year: string, code: string): string {
  return `${year}-${code.replace(/[^A-Za-z0-9]/g, '')}`;
}

export function buildForms(): Form[] {
  const forms: Form[] = [];
  for (const yg of YEAR_GROUPS) {
    const yearNum = yg.id.replace('Y', '');
    FORM_CODES[yg.id]!.forEach((code, i) => {
      forms.push({
        id: formId(yg.id, code),
        year: yg.id,
        code,
        label: `${yearNum}${code}`, // e.g. "7B", "9AAG/PH", "10ABD/MF"
        colour: FORM_PALETTE[i % FORM_PALETTE.length]!,
        order: i,
      });
    });
  }
  return forms;
}

// ---- events (11) -------------------------------------------------------------
type EventSeed = [id: string, label: string, discipline: EventDef['discipline'], strings: string[], isRelay: boolean, units: EventDef['recordUnits']];

const EVENT_SEEDS: EventSeed[] = [
  ['100m', '100m', 'track', ['A', 'B', 'C'], false, 'second'],
  ['200m', '200m', 'track', ['A', 'B', 'C'], false, 'second'],
  ['300m', '300m', 'track', ['A', 'B', 'C'], false, 'second'],
  ['800m', '800m', 'track', ['A', 'B', 'C'], false, 'second'],
  ['1500m', '1500m', 'track', ['A', 'B'], false, 'second'],
  ['4x200m', '4×200m Relay', 'track', ['A'], true, 'second'],
  ['4x100m', '4×100m Relay', 'track', ['A'], true, 'second'],
  ['longJump', 'Long Jump', 'field', ['A', 'B'], false, 'metre'],
  ['javelin', 'Javelin', 'field', ['A', 'B', 'C'], false, 'metre'],
  ['shot', 'Shot', 'field', ['A', 'B', 'C'], false, 'metre'],
  ['highJump', 'High Jump', 'field', ['A'], false, 'metre'],
];

export const EVENTS: EventDef[] = EVENT_SEEDS.map(([id, label, discipline, strings, isRelay, recordUnits], order) => ({
  id,
  label,
  discipline,
  strings,
  isRelay,
  recordUnits,
  order,
}));

// ---- contests (25 per year × 4 = 100) ---------------------------------------
export function contestId(year: string, event: string, str: string): string {
  return `${year}__${event}__${str}`;
}

export function buildContests(): Contest[] {
  const contests: Contest[] = [];
  for (const yg of YEAR_GROUPS) {
    for (const ev of EVENTS) {
      for (const str of ev.strings) {
        contests.push({
          id: contestId(yg.id, ev.id, str),
          year: yg.id,
          event: ev.id,
          string: str,
          isRelay: ev.isRelay,
          status: 'outstanding',
          version: 0,
          placements: [],
          committedBy: null,
          committedAt: null,
          voidReason: null,
        });
      }
    }
  }
  return contests;
}

// ---- records (44) — 2026 standing records, rolled forward from 2025 ----------
// rec(year, event, units, standingScore, standingHolder, standingYear)
function rec(
  year: string,
  event: string,
  units: RecordDoc['units'],
  standingScore: number | null,
  standingHolder: string | null,
  standingYear: number | null,
): RecordDoc {
  return {
    id: `${year}__${event}`,
    year,
    event,
    units,
    standingScore,
    standingHolder,
    standingYear,
    currentScore: null,
    currentForm: null,
    currentYear: Number(SEASON_ID),
    doScore: 0,
  };
}

export const RECORDS: RecordDoc[] = [
  // YEAR 7  (shot & 4x200m were beaten in 2025 -> rolled forward)
  rec('Y7', 'longJump', 'metre', 4.1, '7B', 2023),
  rec('Y7', 'highJump', 'metre', 1.25, null, 2018),
  rec('Y7', 'shot', 'metre', 9.3, '7B', 2025), // was 8.70 (7W, 2022), beaten by B 9.30
  rec('Y7', 'javelin', 'metre', 20.0, '7L', 2024),
  rec('Y7', '100m', 'second', 13.35, '7S', 2019),
  rec('Y7', '200m', 'second', 28.5, null, 2018),
  rec('Y7', '300m', 'second', 45.6, null, 2018),
  rec('Y7', '800m', 'second', 162.25, '7W', 2024),
  rec('Y7', '1500m', 'second', 326.57, '7B', 2022),
  rec('Y7', '4x200m', 'second', 134.68, '7B', 2025), // was 146.33 (7D, 2024), beaten by B 134.68
  rec('Y7', '4x100m', 'second', 60.87, '7B', 2019),

  // YEAR 8  (javelin, 100m, 200m, 800m beaten in 2025)
  rec('Y8', 'longJump', 'metre', 4.3, '8J', 2023),
  rec('Y8', 'highJump', 'metre', 1.34, '8H', 2019),
  rec('Y8', 'shot', 'metre', 11.98, null, 2018),
  rec('Y8', 'javelin', 'metre', 29.2, '8W', 2025), // was 24.60 (2018), beaten by W 29.20
  rec('Y8', '100m', 'second', 12.19, '8S', 2025), // was 12.30 (8B, 2019), beaten by S 12.19
  rec('Y8', '200m', 'second', 26.4, '8W', 2025), // was 26.75 (8B, 2019), beaten by W 26.40
  rec('Y8', '300m', 'second', 42.59, '8S', 2023),
  rec('Y8', '800m', 'second', 143.0, '8W', 2025), // was 155.78 (8W, 2022), beaten by W 143.00
  rec('Y8', '1500m', 'second', 296.77, '8W', 2022),
  rec('Y8', '4x200m', 'second', 125.25, '8S', 2024),
  rec('Y8', '4x100m', 'second', 57.7, '8L', 2019),

  // YEAR 9  (4x200m beaten in 2025)
  rec('Y9', 'longJump', 'metre', 4.81, 'CAO/AAK', 2024),
  rec('Y9', 'highJump', 'metre', 1.45, '9AC/GMT', 2022),
  rec('Y9', 'shot', 'metre', 11.5, '9SJL/JG', 2023),
  rec('Y9', 'javelin', 'metre', 26.0, 'KLD/ST', 2024),
  rec('Y9', '100m', 'second', 12.1, null, 2018),
  rec('Y9', '200m', 'second', 25.8, null, 2018),
  rec('Y9', '300m', 'second', 41.6, '9LS/TCJ+TA', 2019),
  rec('Y9', '800m', 'second', 134.88, '9SJL/JG', 2023),
  rec('Y9', '1500m', 'second', 283.14, '9SJL/JG', 2023),
  rec('Y9', '4x200m', 'second', 114.62, '9MF/GJM', 2025), // was 118.16 (9NJS/OLS, 2024), beaten by MF/GJM
  rec('Y9', '4x100m', 'second', 52.72, 'KLD/ST', 2024),

  // YEAR 10  (shot & 4x200m beaten in 2025)
  rec('Y10', 'longJump', 'metre', 5.4, 'JG/SJL', 2024),
  rec('Y10', 'highJump', 'metre', 1.65, '10GJM/AAK', 2022),
  rec('Y10', 'shot', 'metre', 13.4, '10FCB/RFJ', 2025), // was 11.6 (10DMT/PJH, 2019), beaten by FCB/RFJ
  rec('Y10', 'javelin', 'metre', 35.0, 'FEH/EAN', 2024),
  rec('Y10', '100m', 'second', 11.6, null, 2018),
  rec('Y10', '200m', 'second', 25.01, '10KT/DS', 2023),
  rec('Y10', '300m', 'second', 40.95, '10VEH/GW', 2019),
  rec('Y10', '800m', 'second', 134.51, 'JG/SJL', 2024),
  rec('Y10', '1500m', 'second', 277.62, 'JG/SJL', 2024),
  rec('Y10', '4x200m', 'second', 111.03, '10OLS/NJS', 2025), // was 112.81 (10JG/SJL, 2024), beaten by OLS/NJS
  rec('Y10', '4x100m', 'second', 50.6, '10SRG/JCB', 2019),
];

// ---- season config -----------------------------------------------------------
export function buildSeasonConfig(): SeasonConfig {
  return {
    id: SEASON_ID,
    label: 'MGS Sports Day 2026',
    status: 'active',
    configVersion: 1,
    strings: ['A', 'B', 'C'],
    scoring: makeDefaultScoring(),
    turnout: {
      awardsPoints: false,
      bonusMax: 0,
      byYear: { Y7: 0.97, Y8: 0.98, Y9: 0.86, Y10: 0.81 },
    },
    participation: { maxTrack: 1, maxField: 1, min: 1, exempt: ['bigband'] },
  };
}

// ---- schedule / timetable ----------------------------------------------------
// Transcribed from the MGS Sports Day running order. Times are minutes-since-midnight.
export const SCHEDULE_EVENT_DATE = '2026-07-01'; // Sports Day — now/next stays dormant until this date.
const FIELD_AREA: Record<string, string> = {
  highJump: 'Sports Hall',
  longJump: 'Long Jump Pits',
  javelin: 'Centre of Track',
  shot: 'Centre of Track',
};

export function buildSchedule(): ScheduleSlot[] {
  const hm = (h: number, m: number) => h * 60 + m;
  const yl = (y: string) => YEAR_GROUPS.find((g) => g.id === y)?.label ?? y;
  const el = (id: string) => EVENTS.find((e) => e.id === id)?.label ?? id;
  const stringsOf = (id: string) => EVENTS.find((e) => e.id === id)?.strings ?? ['A'];
  const Y = ['Y7', 'Y8', 'Y9', 'Y10'];
  const slots: ScheduleSlot[] = [];
  const track = (time: number, event: string, year: string, str: string, label: string) =>
    slots.push({ time, label, kind: 'track', year, contestIds: [contestId(year, event, str)] });

  // 200m — strings C, B, A; each a group of 4 years 2 min apart, groups 10 min apart.
  ['C', 'B', 'A'].forEach((s, si) => Y.forEach((y, yi) => track(hm(9, 22) + si * 10 + yi * 2, '200m', y, s, `200m · ${yl(y)} · ${s}`)));

  // 800m — combined years per string (C, B, A), 5 min apart.
  const pairs: [string, string][] = [['Y7', 'Y8'], ['Y9', 'Y10']];
  ['C', 'B', 'A'].forEach((s, si) =>
    pairs.forEach(([a, b], pi) =>
      slots.push({
        time: hm(9, 55) + (si * 2 + pi) * 5,
        label: `800m · ${a.slice(1)}+${b.slice(1)} · ${s}`,
        kind: 'track',
        year: a,
        contestIds: [contestId(a, '800m', s), contestId(b, '800m', s)],
      }),
    ),
  );

  // 1500m — by year, A+B together, 8 min apart.
  Y.forEach((y, yi) =>
    slots.push({
      time: hm(10, 28) + yi * 8,
      label: `1500m · ${yl(y)} · A+B`,
      kind: 'track',
      year: y,
      contestIds: [contestId(y, '1500m', 'A'), contestId(y, '1500m', 'B')],
    }),
  );

  // 300m — by year then C, B, A, 2 min apart.
  let i300 = 0;
  Y.forEach((y) => ['C', 'B', 'A'].forEach((s) => track(hm(11, 2) + i300++ * 2, '300m', y, s, `300m · ${yl(y)} · ${s}`)));

  // 100m — by year then C, B, A, 1 min apart.
  let i100 = 0;
  Y.forEach((y) => ['C', 'B', 'A'].forEach((s) => track(hm(11, 30) + i100++, '100m', y, s, `100m · ${yl(y)} · ${s}`)));

  // Relays.
  Y.forEach((y, yi) => slots.push({ time: hm(11, 50) + yi * 4, label: `4×200m Relay · ${yl(y)}`, kind: 'relay', year: y, contestIds: [contestId(y, '4x200m', 'A')] }));
  Y.forEach((y, yi) => slots.push({ time: hm(12, 12) + yi * 3, label: `4×100m Relay · ${yl(y)}`, kind: 'relay', year: y, contestIds: [contestId(y, '4x100m', 'A')] }));

  // Field events — each block starts together; the year doing each rotates per block.
  const fieldBlocks: { start: [number, number]; assign: Record<string, string> }[] = [
    { start: [9, 22], assign: { highJump: 'Y7', longJump: 'Y8', javelin: 'Y9', shot: 'Y10' } },
    { start: [9, 55], assign: { highJump: 'Y8', longJump: 'Y9', javelin: 'Y10', shot: 'Y7' } },
    { start: [11, 2], assign: { highJump: 'Y9', longJump: 'Y10', javelin: 'Y7', shot: 'Y8' } },
    { start: [11, 30], assign: { highJump: 'Y10', longJump: 'Y7', javelin: 'Y8', shot: 'Y9' } },
  ];
  for (const blk of fieldBlocks) {
    for (const [ev, year] of Object.entries(blk.assign)) {
      slots.push({
        time: hm(blk.start[0], blk.start[1]),
        label: `${el(ev)} · ${yl(year)}`,
        kind: 'field',
        year,
        area: FIELD_AREA[ev],
        contestIds: stringsOf(ev).map((s) => contestId(year, ev, s)),
      });
    }
  }

  slots.push({ time: hm(12, 28), label: 'Presentation', kind: 'info' });
  slots.push({ time: hm(12, 30), label: 'Disperse', kind: 'info' });

  return slots.sort((a, b) => a.time - b.time);
}
