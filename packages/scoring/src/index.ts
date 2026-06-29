/**
 * MGS Sports Day scoring engine — pure, deterministic, zero Firebase imports.
 *
 * Imported by BOTH the authoritative Cloud Function (server truth) and the admin
 * console (live what-if preview). The maths lives here once.
 *
 * The real MGS model (decoded from the "REGULAR POINT ALLOCATIONS" sheet) is a
 * single 30-deep points ladder. Each event's A/B/C strings are TIERS of that one
 * ladder: A maps to ranks 1-10 (winner 31), B to 11-20 (winner 20), C to 21-30
 * (winner 10). Single-string events (relays, high jump) score off the top (winner 31).
 */

import type {
  Contest,
  Form,
  RecordDoc,
  ScoringConfig,
  SeasonConfig,
  Standings,
  FormStanding,
  RecordBreak,
  AthleteStanding,
} from '@mgs/config-types';

/** The canonical MGS ladder: rank (1-based) -> points. Rank 1 carries a +2 premium; the rest are linear. */
export const DEFAULT_LADDER: readonly number[] = [
  31, 29, 28, 27, 26, 25, 24, 23, 22, 21, // ranks 1-10  (A string)
  20, 19, 18, 17, 16, 15, 14, 13, 12, 11, // ranks 11-20 (B string)
  10, 9, 8, 7, 6, 5, 4, 3, 2, 1, // ranks 21-30 (C string)
];

export const DEFAULT_STRING_OFFSETS: Readonly<Record<string, number>> = { A: 0, B: 10, C: 20 };
export const DEFAULT_RECORD_BONUS = { noRecord: 0, equal: 1, beat: 2 } as const;

/** A simple linear alternative ladder (1st = 8 ... 8th = 1), offered one-click in the config UI. */
export const LINEAR_LADDER: readonly number[] = [8, 7, 6, 5, 4, 3, 2, 1];

export function makeDefaultScoring(): ScoringConfig {
  return {
    ladder: [...DEFAULT_LADDER],
    stringOffsets: { ...DEFAULT_STRING_OFFSETS },
    tiePolicy: 'split-average',
    absentPolicy: 'zero',
    recordBonus: { ...DEFAULT_RECORD_BONUS },
  };
}

/**
 * Points for a single (string, position). `position` is 1-based.
 * Looks up the combined ladder at the string's tier offset.
 */
export function pointsForPlacement(position: number, stringCode: string, scoring: ScoringConfig): number {
  const offset = scoring.stringOffsets[stringCode] ?? 0;
  const idx = offset + position - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= scoring.ladder.length) return 0;
  return scoring.ladder[idx] ?? 0;
}

/**
 * Points per form within one contest, honouring the within-contest tie (dead-heat) policy.
 * Returns formId -> points.
 */
export function pointsForContest(
  contest: Pick<Contest, 'string' | 'placements'>,
  scoring: ScoringConfig,
): Map<string, number> {
  const out = new Map<string, number>();
  const placements = [...contest.placements].sort((a, b) => a.position - b.position);

  let i = 0;
  while (i < placements.length) {
    let j = i;
    while (j + 1 < placements.length && placements[j + 1]!.position === placements[i]!.position) j++;
    const groupSize = j - i + 1;
    const basePos = placements[i]!.position;

    let award: number;
    if (groupSize === 1) {
      award = pointsForPlacement(basePos, contest.string, scoring);
    } else {
      const slotPoints: number[] = [];
      for (let k = 0; k < groupSize; k++) slotPoints.push(pointsForPlacement(basePos + k, contest.string, scoring));
      if (scoring.tiePolicy === 'split-average') {
        award = slotPoints.reduce((a, b) => a + b, 0) / groupSize;
      } else if (scoring.tiePolicy === 'min-shared') {
        award = Math.max(...slotPoints); // tied forms all take the best (highest) points
      } else {
        award = pointsForPlacement(basePos, contest.string, scoring); // no-share
      }
    }
    for (let k = i; k <= j; k++) out.set(placements[k]!.formId, award);
    i = j + 1;
  }
  return out;
}

export type RecordKind = 'none' | 'equal' | 'beat';

/** Evaluate whether this year's best (currentScore) beats/equals the standing record. */
export function evaluateRecord(
  rec: Pick<RecordDoc, 'units' | 'standingScore' | 'currentScore'>,
): RecordKind {
  if (rec.currentScore == null) return 'none';
  if (rec.standingScore == null) return 'beat'; // no prior record -> any mark sets one
  if (rec.currentScore === rec.standingScore) return 'equal';
  const better = rec.units === 'second' ? rec.currentScore < rec.standingScore : rec.currentScore > rec.standingScore;
  return better ? 'beat' : 'none';
}

export function recordBonusPoints(kind: RecordKind, scoring: ScoringConfig): number {
  if (kind === 'beat') return scoring.recordBonus.beat;
  if (kind === 'equal') return scoring.recordBonus.equal;
  return scoring.recordBonus.noRecord;
}

/** doScore value (0/1/2) stored on the record doc, derived from the same logic. */
export function recordDoScore(rec: Pick<RecordDoc, 'units' | 'standingScore' | 'currentScore'>): 0 | 1 | 2 {
  const kind = evaluateRecord(rec);
  return kind === 'beat' ? 2 : kind === 'equal' ? 1 : 0;
}

export function contestLabel(c: Pick<Contest, 'year' | 'event' | 'string'>): string {
  return `${c.year} ${c.event} ${c.string}`;
}

export interface ComputeInput {
  contests: Contest[];
  records: RecordDoc[];
  forms: Form[];
  config: SeasonConfig;
  prevStandings?: Standings | null;
}

/** Standard competition ranking by total (desc): equal totals share a position, the next skips. */
function competitionRank(items: { formId: string; total: number }[]): Map<string, number> {
  const totals = items.map((i) => i.total);
  const pos = new Map<string, number>();
  for (const it of items) {
    const rank = 1 + totals.filter((t) => t > it.total).length;
    pos.set(it.formId, rank);
  }
  return pos;
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Deterministic fingerprint of the inputs that affect standings (for the stale-guard). */
export function sourceHash(committed: Contest[], records: RecordDoc[]): string {
  const parts: string[] = [];
  for (const c of [...committed].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    parts.push(`${c.id}@${c.version}=${c.placements.map((p) => `${p.formId}#${p.position}`).join(',')}`);
  }
  for (const r of [...records].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    parts.push(`${r.id}=${r.currentScore ?? ''}/${r.currentForm ?? ''}`);
  }
  return fnv1a(parts.join('|'));
}

/**
 * The single source of truth for standings. Pure: same inputs -> identical output
 * (except `computedAt`, which the caller stamps). Recomputes from ALL committed
 * contests + records every time — never an increment.
 */
export function computeStandings(input: ComputeInput): Standings {
  const { contests, records, forms, config } = input;
  const scoring = config.scoring;

  const acc = new Map<string, FormStanding>();
  for (const f of forms) {
    acc.set(f.id, {
      formId: f.id,
      year: f.year,
      code: f.code,
      label: f.label,
      colour: f.colour,
      total: 0,
      regularPoints: 0,
      bonusPoints: 0,
      yearPos: 0,
      schoolPos: 0,
      prevSchoolPos: null,
      counts: { firsts: 0, seconds: 0, thirds: 0 },
      byEvent: {},
    });
  }

  const committed = contests.filter((c) => c.status === 'committed' && c.placements.length > 0);
  const voidCount = contests.filter((c) => c.status === 'void').length;

  // Individual champions (Phase 2): the SAME placement points, aggregated by athlete name
  // where one is present. Sparse/empty until names are entered or back-filled.
  const athAcc = new Map<string, AthleteStanding>();

  for (const c of committed) {
    const pts = pointsForContest(c, scoring);
    for (const p of c.placements) {
      const gained = pts.get(p.formId) ?? 0;
      const name = p.athleteName?.trim();
      if (name) {
        const key = `${c.year}::${name.toLowerCase()}`;
        let a = athAcc.get(key);
        if (!a) {
          a = { name, year: c.year, total: 0, firsts: 0, pos: 0 };
          athAcc.set(key, a);
        }
        a.total += gained;
        if (p.position === 1) a.firsts++;
      }
      const fs = acc.get(p.formId);
      if (!fs) continue; // unknown form is ignored, never throws
      fs.regularPoints += gained;
      fs.byEvent[c.id] = (fs.byEvent[c.id] ?? 0) + gained;
      if (p.position === 1) fs.counts.firsts++;
      else if (p.position === 2) fs.counts.seconds++;
      else if (p.position === 3) fs.counts.thirds++;
    }
  }

  const broken: RecordBreak[] = [];
  for (const rec of records) {
    const kind = evaluateRecord(rec);
    if (kind === 'none') continue;
    const bonus = recordBonusPoints(kind, scoring);
    if (rec.currentForm) {
      const fs = acc.get(rec.currentForm);
      if (fs) fs.bonusPoints += bonus;
    }
    broken.push({
      recordId: rec.id,
      event: rec.event,
      year: rec.year,
      formId: rec.currentForm ?? '',
      score: rec.currentScore ?? 0,
      units: rec.units,
      kind: kind === 'beat' ? 'beat' : 'equal',
    });
  }

  for (const fs of acc.values()) fs.total = fs.regularPoints + fs.bonusPoints;

  const schoolPos = competitionRank([...acc.values()].map((f) => ({ formId: f.formId, total: f.total })));

  const byYear = new Map<string, { formId: string; total: number }[]>();
  for (const f of acc.values()) {
    if (!byYear.has(f.year)) byYear.set(f.year, []);
    byYear.get(f.year)!.push({ formId: f.formId, total: f.total });
  }
  const yearPos = new Map<string, number>();
  for (const arr of byYear.values()) for (const [k, v] of competitionRank(arr)) yearPos.set(k, v);

  const prevForms = input.prevStandings?.forms;
  for (const fs of acc.values()) {
    fs.schoolPos = schoolPos.get(fs.formId) ?? 0;
    fs.yearPos = yearPos.get(fs.formId) ?? 0;
    fs.prevSchoolPos = prevForms?.[fs.formId]?.schoolPos ?? null;
  }

  // Rank athletes within each year (competition ranking), keep the top dozen per year.
  const athByYear: Record<string, AthleteStanding[]> = {};
  for (const a of athAcc.values()) (athByYear[a.year] ??= []).push(a);
  for (const y of Object.keys(athByYear)) {
    const list = athByYear[y]!;
    list.sort((x, z) => z.total - x.total || z.firsts - x.firsts || x.name.localeCompare(z.name));
    for (const a of list) a.pos = 1 + list.filter((o) => o.total > a.total).length;
    athByYear[y] = list.slice(0, 12);
  }

  const recentResults = committed
    .filter((c) => c.committedAt != null)
    .sort((a, b) => (b.committedAt ?? 0) - (a.committedAt ?? 0))
    .slice(0, 12)
    .map((c) => ({ contestId: c.id, label: contestLabel(c), committedAt: c.committedAt ?? 0 }));

  return {
    seasonId: config.id,
    computedAt: 0, // stamped by the caller (Cloud Function uses serverTimestamp/Date.now)
    configVersion: config.configVersion,
    sourceHash: sourceHash(committed, records),
    progress: { committed: committed.length, total: contests.length, void: voidCount },
    forms: Object.fromEntries(acc),
    recentResults,
    records: { broken },
    athletes: { byYear: athByYear },
  };
}
