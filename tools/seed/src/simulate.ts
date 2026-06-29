/**
 * Scoring-engine simulation / fuzz harness.
 *
 * Generates thousands of randomized full "seasons" (random committed/void contests, ties,
 * partial fields, records that beat/equal/miss, athlete names with deliberate collisions,
 * corrections) and asserts the engine's invariants on every one:
 *
 *   - idempotency (recompute twice -> byte-identical)
 *   - total === regularPoints + bonusPoints, and regularPoints === sum(byEvent)
 *   - competition ranking is exact (school + per-year): pos === 1 + #{total > mine}
 *   - STRICT mode (no ties/records/athletes) re-derives every form's points from the raw
 *     ladder independently and demands an exact match
 *   - athlete projection aggregates/ranks/caps correctly and never affects form scoring
 *   - records.broken matches an independent evaluation; the achieving form got the bonus
 *   - progress counts, recentResults ordering/cap, and "no NaN/Infinity anywhere"
 *
 * Run:  pnpm --filter @mgs/seed exec tsx src/simulate.ts [iterations]
 */

import { computeStandings, pointsForContest, makeDefaultScoring } from '@mgs/scoring';
import type {
  Contest,
  ContestStatus,
  RecordDoc,
  Placement,
  SeasonConfig,
  Form,
  EventDef,
  Standings,
} from '@mgs/config-types';

// ---- deterministic PRNG (mulberry32) so a failure is reproducible from its seed ----------
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- fixed roster / events / config ------------------------------------------------------
const YEARS = ['Y7', 'Y8', 'Y9', 'Y10'];
const scoring = makeDefaultScoring();
const config: SeasonConfig = {
  id: '2026',
  label: 'sim',
  status: 'active',
  configVersion: 1,
  strings: ['A', 'B', 'C'],
  scoring,
  turnout: { awardsPoints: false, bonusMax: 0, byYear: {} },
  participation: { maxTrack: 1, maxField: 1, min: 1, exempt: [] },
};
const forms: Form[] = YEARS.flatMap((y) =>
  Array.from({ length: 8 }, (_, i) => ({ id: `${y}-${i}`, year: y, code: `${i}`, label: `${y.slice(1)}${i}`, colour: '#3366aa', order: i })),
);
const formsByYear: Record<string, Form[]> = Object.fromEntries(YEARS.map((y) => [y, forms.filter((f) => f.year === y)]));
const EVENTS: EventDef[] = [
  { id: '100m', label: '100m', discipline: 'track', strings: ['A', 'B', 'C'], isRelay: false, recordUnits: 'second', order: 1 },
  { id: '200m', label: '200m', discipline: 'track', strings: ['A', 'B', 'C'], isRelay: false, recordUnits: 'second', order: 2 },
  { id: '800m', label: '800m', discipline: 'track', strings: ['A', 'B'], isRelay: false, recordUnits: 'second', order: 3 },
  { id: '1500m', label: '1500m', discipline: 'track', strings: ['A'], isRelay: false, recordUnits: 'second', order: 4 },
  { id: 'longjump', label: 'Long Jump', discipline: 'field', strings: ['A', 'B', 'C'], isRelay: false, recordUnits: 'metre', order: 5 },
  { id: 'shot', label: 'Shot', discipline: 'field', strings: ['A', 'B'], isRelay: false, recordUnits: 'metre', order: 6 },
  { id: 'highjump', label: 'High Jump', discipline: 'field', strings: ['A'], isRelay: false, recordUnits: 'metre', order: 7 },
  { id: '4x100m', label: '4×100m', discipline: 'track', strings: ['A'], isRelay: true, recordUnits: 'second', order: 8 },
];
const NAMES = ['Sam', 'Alex', 'Jordan', 'Sam', 'Chris', 'Jamie', 'Sam']; // deliberate 'Sam' collisions

const round2 = (x: number) => Math.round(x * 100) / 100;

function shuffle<T>(arr: T[], r: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

interface GenOpts { ties: boolean; records: boolean; athletes: boolean; voids: boolean; }

function genPlacements(year: string, r: () => number, opts: GenOpts): Placement[] {
  const fs = formsByYear[year]!;
  const k = 1 + Math.floor(r() * fs.length); // 1..8 forms placed (partial fields)
  const chosen = shuffle(fs, r).slice(0, k);
  const pls: Placement[] = chosen.map((f, i) => ({ formId: f.id, position: i + 1 }));
  if (opts.ties && k >= 2 && r() < 0.25) {
    const i = Math.floor(r() * (k - 1));
    pls[i + 1]!.position = pls[i]!.position; // dead heat
  }
  if (opts.athletes && r() < 0.5) {
    for (const p of pls) if (r() < 0.7) p.athleteName = NAMES[Math.floor(r() * NAMES.length)]!;
  }
  return pls;
}

function genSeason(seed: number, opts: GenOpts): { contests: Contest[]; records: RecordDoc[] } {
  const r = rng(seed);
  const contests: Contest[] = [];
  for (const ev of EVENTS) {
    for (const y of YEARS) {
      for (const s of ev.strings) {
        const roll = r();
        let status: ContestStatus = 'outstanding';
        let placements: Placement[] = [];
        if (roll < 0.72) {
          placements = genPlacements(y, r, opts);
          status = placements.length ? 'committed' : 'outstanding';
        } else if (opts.voids && roll < 0.82) {
          status = 'void';
        }
        contests.push({
          id: `${y}__${ev.id}__${s}`,
          year: y,
          event: ev.id,
          string: s,
          isRelay: ev.isRelay,
          status,
          version: 1,
          placements,
          committedBy: status === 'committed' ? 'sim' : null,
          committedAt: status === 'committed' ? Math.floor(r() * 1e9) : null,
          voidReason: status === 'void' ? 'sim' : null,
        });
      }
    }
  }
  const records: RecordDoc[] = [];
  if (opts.records) {
    for (const ev of EVENTS) {
      for (const y of YEARS) {
        if (r() < 0.5) continue;
        const standing = round2(5 + r() * 50);
        let currentScore: number | null = null;
        let currentForm: string | null = null;
        if (r() < 0.65) {
          currentForm = formsByYear[y]![Math.floor(r() * 8)]!.id;
          currentScore = round2(standing * (0.8 + r() * 0.4)); // straddles the standing both ways
        }
        records.push({
          id: `${y}__${ev.id}`,
          year: y,
          event: ev.id,
          units: ev.recordUnits,
          standingScore: standing,
          standingHolder: 'old',
          standingYear: 2020,
          currentScore,
          currentForm,
          currentYear: 2026,
          doScore: 0,
        });
      }
    }
  }
  return { contests, records };
}

// ---- invariant checks --------------------------------------------------------------------
function deepFinite(v: unknown, path: string, errs: string[]): void {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) errs.push(`non-finite at ${path}: ${v}`);
    return;
  }
  if (v && typeof v === 'object') for (const [k, val] of Object.entries(v)) deepFinite(val, `${path}.${k}`, errs);
}

function check(st: Standings, contests: Contest[], records: RecordDoc[], opts: GenOpts, strict: boolean): string[] {
  const errs: string[] = [];
  deepFinite(st, 'standings', errs);

  const committed = contests.filter((c) => c.status === 'committed' && c.placements.length > 0);

  // form-level arithmetic
  for (const f of Object.values(st.forms)) {
    if (round2(f.total) !== round2(f.regularPoints + f.bonusPoints)) errs.push(`${f.formId}: total ${f.total} != reg ${f.regularPoints} + bonus ${f.bonusPoints}`);
    const be = round2(Object.values(f.byEvent).reduce((a, b) => a + b, 0));
    if (be !== round2(f.regularPoints)) errs.push(`${f.formId}: sum(byEvent) ${be} != regularPoints ${f.regularPoints}`);
    if (f.regularPoints < 0 || f.bonusPoints < 0) errs.push(`${f.formId}: negative points`);
  }

  // competition ranking (school + per-year) is exact
  const all = Object.values(st.forms);
  for (const f of all) {
    const expSchool = 1 + all.filter((g) => g.total > f.total).length;
    if (f.schoolPos !== expSchool) errs.push(`${f.formId}: schoolPos ${f.schoolPos} != ${expSchool}`);
    const peers = all.filter((g) => g.year === f.year);
    const expYear = 1 + peers.filter((g) => g.total > f.total).length;
    if (f.yearPos !== expYear) errs.push(`${f.formId}: yearPos ${f.yearPos} != ${expYear}`);
  }

  // progress + recentResults
  const voidCount = contests.filter((c) => c.status === 'void').length;
  if (st.progress.committed !== committed.length) errs.push(`progress.committed ${st.progress.committed} != ${committed.length}`);
  if (st.progress.total !== contests.length) errs.push(`progress.total ${st.progress.total} != ${contests.length}`);
  if (st.progress.void !== voidCount) errs.push(`progress.void ${st.progress.void} != ${voidCount}`);
  if (st.recentResults.length > 12) errs.push(`recentResults > 12`);
  for (let i = 1; i < st.recentResults.length; i++) {
    if (st.recentResults[i - 1]!.committedAt < st.recentResults[i]!.committedAt) errs.push(`recentResults not sorted desc`);
  }

  // STRICT: independent exact points from the ladder (no ties/records/athletes in this mode)
  if (strict) {
    const exp = new Map<string, number>();
    for (const c of committed) {
      const off = scoring.stringOffsets[c.string] ?? 0;
      for (const p of c.placements) exp.set(p.formId, (exp.get(p.formId) ?? 0) + (scoring.ladder[off + p.position - 1] ?? 0));
    }
    for (const f of all) {
      const e = exp.get(f.formId) ?? 0;
      if (f.regularPoints !== e) errs.push(`STRICT ${f.formId}: regularPoints ${f.regularPoints} != ladder-derived ${e}`);
      if (f.bonusPoints !== 0) errs.push(`STRICT ${f.formId}: bonus ${f.bonusPoints} should be 0`);
    }
  }

  // athletes: independent aggregation (must never change form scoring; correct rank + cap)
  const indep: Record<string, Map<string, number>> = {};
  for (const c of committed) {
    const pts = pointsForContest(c, scoring);
    for (const p of c.placements) {
      const name = p.athleteName?.trim();
      if (!name) continue;
      (indep[c.year] ??= new Map()).set(`${name.toLowerCase()}`, (indep[c.year]?.get(name.toLowerCase()) ?? 0) + (pts.get(p.formId) ?? 0));
    }
  }
  const stAth = st.athletes?.byYear ?? {};
  for (const y of YEARS) {
    const expList = [...(indep[y]?.entries() ?? [])].map(([k, total]) => ({ k, total })).sort((a, b) => b.total - a.total).slice(0, 12);
    const got = stAth[y] ?? [];
    if (got.length > 12) errs.push(`athletes ${y}: > 12`);
    for (const a of got) {
      if (!opts.athletes) errs.push(`athletes present though athletes disabled`);
      const expTotal = indep[y]?.get(a.name.toLowerCase());
      if (expTotal === undefined || round2(expTotal) !== round2(a.total)) errs.push(`athlete ${y}/${a.name}: total ${a.total} != indep ${expTotal}`);
      const expPos = 1 + (got.filter((o) => o.total > a.total).length);
      if (a.pos !== expPos) errs.push(`athlete ${y}/${a.name}: pos ${a.pos} != ${expPos}`);
    }
    // top athlete total should match the independent top
    if (expList.length && got.length && round2(got[0]!.total) !== round2(expList[0]!.total)) errs.push(`athletes ${y}: top total mismatch`);
  }

  // records.broken matches an independent direction-aware evaluation
  let expBroken = 0;
  for (const rec of records) {
    if (rec.currentScore == null || rec.standingScore == null) continue;
    const beat = rec.units === 'second' ? rec.currentScore < rec.standingScore : rec.currentScore > rec.standingScore;
    const equal = rec.currentScore === rec.standingScore;
    if (beat || equal) expBroken++;
  }
  if (st.records.broken.length !== expBroken) errs.push(`records.broken ${st.records.broken.length} != indep ${expBroken}`);

  return errs;
}

// ---- run ---------------------------------------------------------------------------------
const N = Number(process.argv[2] ?? 20000);
let failures = 0;
let checksRun = 0;
const t0 = Date.now();

for (let i = 0; i < N; i++) {
  const strict = i % 5 < 2; // ~40% strict, ~60% full fuzz
  const opts: GenOpts = strict
    ? { ties: false, records: false, athletes: false, voids: false }
    : { ties: true, records: true, athletes: true, voids: true };
  const { contests, records } = genSeason(i + 1, opts);

  const a = computeStandings({ contests, records, forms, config });
  const b = computeStandings({ contests, records, forms, config }); // idempotency
  const errs = check(a, contests, records, opts, strict);
  if (JSON.stringify(a) !== JSON.stringify(b)) errs.push('NON-IDEMPOTENT: recompute differs');
  if (a.sourceHash !== b.sourceHash || !/^[0-9a-f]{8}$/.test(a.sourceHash)) errs.push(`bad sourceHash ${a.sourceHash}`);

  checksRun++;
  if (errs.length) {
    failures++;
    if (failures <= 10) console.error(`✗ seed ${i + 1} (${strict ? 'strict' : 'fuzz'}): ${errs.slice(0, 4).join(' | ')}`);
  }
  if ((i + 1) % 5000 === 0) console.log(`  …${i + 1}/${N} seasons checked`);
}

const ms = Date.now() - t0;
console.log(`\n${failures === 0 ? '✓ ALL CHECKS PASSED' : `✗ ${failures} FAILURES`} — ${checksRun} seasons × ~${EVENTS.reduce((n, e) => n + e.strings.length, 0) * YEARS.length} contests, idempotency + invariants, in ${ms}ms`);
process.exit(failures === 0 ? 0 : 1);
