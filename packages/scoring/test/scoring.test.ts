import { describe, it, expect } from 'vitest';
import type { Contest, Form, RecordDoc, SeasonConfig, Placement } from '@mgs/config-types';
import {
  pointsForPlacement,
  pointsForContest,
  evaluateRecord,
  recordDoScore,
  computeStandings,
  makeDefaultScoring,
} from '../src/index.js';

// ---- fixtures ----------------------------------------------------------------

function makeConfig(): SeasonConfig {
  return {
    id: '2026',
    label: 'MGS Sports Day 2026',
    status: 'active',
    configVersion: 1,
    strings: ['A', 'B', 'C'],
    scoring: makeDefaultScoring(),
    turnout: { awardsPoints: false, bonusMax: 0, byYear: {} },
    participation: { maxTrack: 1, maxField: 1, min: 1, exempt: ['bigband'] },
  };
}

function form(id: string, year: string, code: string, label: string): Form {
  return { id, year, code, label, colour: '#123456', order: 0 };
}

function pl(...pairs: [string, number][]): Placement[] {
  return pairs.map(([formId, position]) => ({ formId, position }));
}

function contest(
  id: string,
  year: string,
  event: string,
  str: string,
  placements: Placement[],
  opts: Partial<Contest> = {},
): Contest {
  return {
    id,
    year,
    event,
    string: str,
    isRelay: false,
    status: 'committed',
    version: 1,
    placements,
    committedBy: 'admin',
    committedAt: 1000,
    voidReason: null,
    ...opts,
  };
}

// ---- the ladder & tiers ------------------------------------------------------

describe('pointsForPlacement — the real MGS 30-deep ladder', () => {
  const s = makeDefaultScoring();
  it('A string maps to ladder ranks 1-10 (winner 31)', () => {
    expect(pointsForPlacement(1, 'A', s)).toBe(31);
    expect(pointsForPlacement(2, 'A', s)).toBe(29);
    expect(pointsForPlacement(3, 'A', s)).toBe(28);
    expect(pointsForPlacement(8, 'A', s)).toBe(23);
  });
  it('B string maps to ladder ranks 11-20 (winner 20)', () => {
    expect(pointsForPlacement(1, 'B', s)).toBe(20);
    expect(pointsForPlacement(2, 'B', s)).toBe(19);
    expect(pointsForPlacement(8, 'B', s)).toBe(13);
  });
  it('C string maps to ladder ranks 21-30 (winner 10, last 1)', () => {
    expect(pointsForPlacement(1, 'C', s)).toBe(10);
    expect(pointsForPlacement(2, 'C', s)).toBe(9);
    expect(pointsForPlacement(10, 'C', s)).toBe(1);
  });
  it('single-string events (relays / high jump) score off the top of the ladder', () => {
    // single-string events are stored with string "A"
    expect(pointsForPlacement(1, 'A', s)).toBe(31);
    expect(pointsForPlacement(8, 'A', s)).toBe(23);
  });
  it('out-of-range positions score 0', () => {
    expect(pointsForPlacement(0, 'A', s)).toBe(0); // before the start
    expect(pointsForPlacement(11, 'C', s)).toBe(0); // past the end of the 30-deep ladder
    expect(pointsForPlacement(99, 'A', s)).toBe(0);
  });
});

describe('pointsForContest — within-contest ties', () => {
  const s = makeDefaultScoring();
  it('awards distinct points with no ties', () => {
    const c = contest('e__A', 'Y9', '100m', 'A', pl(['x', 1], ['y', 2], ['z', 3]));
    const m = pointsForContest(c, s);
    expect(m.get('x')).toBe(31);
    expect(m.get('y')).toBe(29);
    expect(m.get('z')).toBe(28);
  });
  it('split-average: two forms tied for 1st in A each get (31+29)/2 = 30', () => {
    const c = contest('e__A', 'Y9', '100m', 'A', pl(['x', 1], ['y', 1], ['z', 3]));
    const m = pointsForContest(c, s);
    expect(m.get('x')).toBe(30);
    expect(m.get('y')).toBe(30);
    expect(m.get('z')).toBe(28); // next distinct slot
  });
  it('min-shared: tied forms both take the better points', () => {
    const cfg = { ...s, tiePolicy: 'min-shared' as const };
    const c = contest('e__A', 'Y9', '100m', 'A', pl(['x', 1], ['y', 1]));
    const m = pointsForContest(c, cfg);
    expect(m.get('x')).toBe(31);
    expect(m.get('y')).toBe(31);
  });
});

// ---- records -----------------------------------------------------------------

describe('evaluateRecord — direction driven by units', () => {
  it('metres: higher beats (Y7 shot 9.30 > 8.70)', () => {
    expect(evaluateRecord({ units: 'metre', standingScore: 8.7, currentScore: 9.3 })).toBe('beat');
  });
  it('seconds: lower beats (Y8 100m 12.19 < 12.30)', () => {
    expect(evaluateRecord({ units: 'second', standingScore: 12.3, currentScore: 12.19 })).toBe('beat');
  });
  it('equal mark equals the record', () => {
    expect(evaluateRecord({ units: 'second', standingScore: 12.3, currentScore: 12.3 })).toBe('equal');
  });
  it('slower / shorter does not beat', () => {
    expect(evaluateRecord({ units: 'second', standingScore: 12.3, currentScore: 12.5 })).toBe('none');
    expect(evaluateRecord({ units: 'metre', standingScore: 8.7, currentScore: 8.0 })).toBe('none');
  });
  it('no current mark = none; no standing record = beat (sets a new one)', () => {
    expect(evaluateRecord({ units: 'metre', standingScore: 8.7, currentScore: null })).toBe('none');
    expect(evaluateRecord({ units: 'metre', standingScore: null, currentScore: 8.0 })).toBe('beat');
  });
  it('doScore mirrors the bonus table (0/1/2)', () => {
    expect(recordDoScore({ units: 'second', standingScore: 12.3, currentScore: 12.19 })).toBe(2);
    expect(recordDoScore({ units: 'second', standingScore: 12.3, currentScore: 12.3 })).toBe(1);
    expect(recordDoScore({ units: 'second', standingScore: 12.3, currentScore: 12.9 })).toBe(0);
  });
});

// ---- full standings ----------------------------------------------------------

describe('computeStandings', () => {
  const config = makeConfig();
  const forms = [
    form('Y9-A', 'Y9', 'A', '9A'),
    form('Y9-B', 'Y9', 'B', '9B'),
    form('Y9-C', 'Y9', 'C', '9C'),
  ];

  it('sums regular points and records a byEvent breakdown', () => {
    const contests = [
      contest('Y9__100m__A', 'Y9', '100m', 'A', pl(['Y9-A', 1], ['Y9-B', 2], ['Y9-C', 3])),
      contest('Y9__100m__B', 'Y9', '100m', 'B', pl(['Y9-B', 1], ['Y9-A', 2], ['Y9-C', 3])),
    ];
    const st = computeStandings({ contests, records: [], forms, config });
    // A: 31 (100m A) + 19 (100m B 2nd) = 50 ; B: 29 + 20 = 49 ; C: 28 + 18 = 46
    expect(st.forms['Y9-A']!.regularPoints).toBe(50);
    expect(st.forms['Y9-B']!.regularPoints).toBe(49);
    expect(st.forms['Y9-C']!.regularPoints).toBe(46);
    expect(st.forms['Y9-A']!.byEvent['Y9__100m__A']).toBe(31);
    expect(st.forms['Y9-A']!.byEvent['Y9__100m__B']).toBe(19);
  });

  it('adds record bonus points to the achieving form', () => {
    const contests = [contest('Y9__shot__A', 'Y9', 'shot', 'A', pl(['Y9-A', 1], ['Y9-B', 2]))];
    const records: RecordDoc[] = [
      {
        id: 'Y9__shot',
        year: 'Y9',
        event: 'shot',
        units: 'metre',
        standingScore: 11.5,
        standingHolder: '9SJL/JG',
        standingYear: 2023,
        currentScore: 13.4,
        currentForm: 'Y9-A',
        currentYear: 2026,
        doScore: 2,
      },
    ];
    const st = computeStandings({ contests, records, forms, config });
    expect(st.forms['Y9-A']!.regularPoints).toBe(31);
    expect(st.forms['Y9-A']!.bonusPoints).toBe(2);
    expect(st.forms['Y9-A']!.total).toBe(33);
    expect(st.records.broken).toHaveLength(1);
    expect(st.records.broken[0]).toMatchObject({ formId: 'Y9-A', kind: 'beat' });
  });

  it('absent forms score 0 in contests they did not enter', () => {
    const contests = [contest('Y9__100m__A', 'Y9', '100m', 'A', pl(['Y9-A', 1], ['Y9-B', 2]))];
    const st = computeStandings({ contests, records: [], forms, config });
    expect(st.forms['Y9-C']!.total).toBe(0);
  });
});

describe('competition ranking — ties share a position, the next skips (reproduces 7E/7H both 2nd)', () => {
  const config = makeConfig();
  const forms = [
    form('Y7-S', 'Y7', 'S', '7S'),
    form('Y7-E', 'Y7', 'E', '7E'),
    form('Y7-H', 'Y7', 'H', '7H'),
    form('Y7-B', 'Y7', 'B', '7B'),
  ];

  it('equal totals tie; the rank after a 2-way tie is 4, not 3', () => {
    // Build totals: S=62, E=31, H=31, B=10
    const contests = [
      // event e1 A: S 1st (31), E 2nd (29 -> but we want E=31) -- instead use single winners across events
      contest('Y7__100m__A', 'Y7', '100m', 'A', pl(['Y7-S', 1])), // S +31
      contest('Y7__200m__A', 'Y7', '200m', 'A', pl(['Y7-S', 1])), // S +31  => S = 62
      contest('Y7__300m__A', 'Y7', '300m', 'A', pl(['Y7-E', 1])), // E +31
      contest('Y7__800m__A', 'Y7', '800m', 'A', pl(['Y7-H', 1])), // H +31
      contest('Y7__1500m__C', 'Y7', '1500m', 'C', pl(['Y7-B', 1])), // B +10
    ];
    const st = computeStandings({ contests, records: [], forms, config });
    expect(st.forms['Y7-S']!.total).toBe(62);
    expect(st.forms['Y7-E']!.total).toBe(31);
    expect(st.forms['Y7-H']!.total).toBe(31);
    expect(st.forms['Y7-B']!.total).toBe(10);

    expect(st.forms['Y7-S']!.yearPos).toBe(1);
    expect(st.forms['Y7-E']!.yearPos).toBe(2);
    expect(st.forms['Y7-H']!.yearPos).toBe(2); // tied
    expect(st.forms['Y7-B']!.yearPos).toBe(4); // skips 3
  });
});

describe('idempotency — recompute twice yields identical output', () => {
  const config = makeConfig();
  const forms = [form('Y9-A', 'Y9', 'A', '9A'), form('Y9-B', 'Y9', 'B', '9B')];
  const contests = [contest('Y9__100m__A', 'Y9', '100m', 'A', pl(['Y9-A', 1], ['Y9-B', 2]))];
  it('produces a stable sourceHash and equal forms', () => {
    const a = computeStandings({ contests, records: [], forms, config });
    const b = computeStandings({ contests, records: [], forms, config });
    expect(a.sourceHash).toBe(b.sourceHash);
    expect(a.forms).toEqual(b.forms);
    expect(a.progress).toEqual({ committed: 1, total: 1, void: 0 });
  });
});

describe('individual champions (Phase 2) — points project onto named athletes', () => {
  const config = makeConfig();
  const forms = [form('Y9-A', 'Y9', 'A', '9A'), form('Y9-B', 'Y9', 'B', '9B')];

  it('aggregates the same placement points by athlete name, ranked within year', () => {
    const contests = [
      contest('Y9__100m__A', 'Y9', '100m', 'A', [
        { formId: 'Y9-A', position: 1, athleteName: 'Sam Lee' }, // +31
        { formId: 'Y9-B', position: 2, athleteName: 'Joe Day' }, // +29
      ]),
      contest('Y9__200m__A', 'Y9', '200m', 'A', [
        { formId: 'Y9-A', position: 1, athleteName: 'Sam Lee' }, // +31  => Sam 62
      ]),
    ];
    const st = computeStandings({ contests, records: [], forms, config });
    const y9 = st.athletes?.byYear['Y9'] ?? [];
    expect(y9).toHaveLength(2);
    expect(y9[0]).toMatchObject({ name: 'Sam Lee', total: 62, firsts: 2, pos: 1 });
    expect(y9[1]).toMatchObject({ name: 'Joe Day', total: 29, firsts: 0, pos: 2 });
  });

  it('is empty when no placements carry a name, and form scoring is unaffected', () => {
    const contests = [contest('Y9__100m__A', 'Y9', '100m', 'A', pl(['Y9-A', 1], ['Y9-B', 2]))];
    const st = computeStandings({ contests, records: [], forms, config });
    expect(st.athletes?.byYear['Y9']).toBeUndefined();
    expect(st.forms['Y9-A']!.total).toBe(31);
  });
});
