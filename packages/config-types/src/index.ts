/**
 * Shared domain types for the MGS Sports Day platform.
 * These types are the contract between the scoring engine, the Cloud Functions,
 * the seed tooling, and the three front-end apps.
 */

export type StringCode = string; // 'A' | 'B' | 'C' (kept as string so config can extend)
export type Discipline = 'track' | 'field';
export type RecordUnits = 'second' | 'metre';
export type ContestStatus = 'outstanding' | 'committed' | 'void';
export type SubmissionStatus = 'pending' | 'committed' | 'superseded' | 'rejected' | 'clarify';
export type SeasonStatus = 'active' | 'locked';

// ---------------------------------------------------------------------------
// Config (lives under seasons/{seasonId})
// ---------------------------------------------------------------------------

export interface YearGroup {
  id: string; // 'Y7'
  label: string; // 'Year 7'
  order: number; // 1..4
  colour: string; // hex
}

export interface Form {
  id: string; // 'Y7-B' or 'Y9-JLLDWI'
  year: string; // 'Y7'
  code: string; // 'B' or 'JLL/DWI'
  label: string; // '7B' or 'JLL/DWI'
  colour: string; // hex (per-form chip colour)
  order: number; // display order within year
}

export interface EventDef {
  id: string; // '100m', '4x200m', 'HighJump'
  label: string; // '100m', '4×200m Relay', 'High Jump'
  discipline: Discipline;
  strings: StringCode[]; // ['A','B','C'] | ['A','B'] | ['A']
  isRelay: boolean;
  recordUnits: RecordUnits;
  order: number;
}

export type TiePolicy = 'split-average' | 'min-shared' | 'no-share';

export interface ScoringConfig {
  /** The single combined points ladder, rank (1-based) -> points. 30 entries by default. */
  ladder: number[];
  /** Tier offset into the ladder per string. A:0, B:10, C:20. Single-string events use the A offset (0). */
  stringOffsets: Record<string, number>;
  /** How tied (dead-heat) placements within one contest share points. */
  tiePolicy: TiePolicy;
  /** Forms absent from a contest score this many points there (0). */
  absentPolicy: 'zero';
  /** Bonus points for records. noRecord MUST be 0 (legacy invariant). */
  recordBonus: { noRecord: number; equal: number; beat: number };
}

/**
 * Turnout figures. NOTE: NOT yet wired into the scoring engine — `awardsPoints` and `bonusMax`
 * are stored for reference/future use only and currently have NO effect on points.
 */
export interface TurnoutConfig {
  awardsPoints: boolean; // reserved — NOT yet applied by the scoring engine
  bonusMax: number;
  byYear: Record<string, number>; // { Y7: 0.97, ... }
}

/** Participation limits. Reserved — NOT yet enforced by the scoring engine. */
export interface ParticipationConfig {
  maxTrack: number;
  maxField: number;
  min: number;
  exempt: string[];
}

export interface SeasonConfig {
  id: string; // '2026'
  label: string; // 'MGS Sports Day 2026'
  status: SeasonStatus;
  configVersion: number;
  strings: StringCode[];
  scoring: ScoringConfig;
  turnout: TurnoutConfig;
  participation: ParticipationConfig;
}

// ---------------------------------------------------------------------------
// Live data
// ---------------------------------------------------------------------------

export interface Placement {
  formId: string;
  position: number; // 1-based; ties share the same position
  athleteName?: string; // optional (Phase 2: individual champions) — back-fillable
}

export interface Contest {
  id: string; // 'Y9__100m__A'
  year: string; // 'Y9'
  event: string; // '100m'
  string: string; // 'A'
  isRelay: boolean;
  status: ContestStatus;
  version: number; // bumped on each correction
  placements: Placement[]; // committed truth; written only by Cloud Functions
  committedBy: string | null;
  committedAt: number | null; // epoch ms
  voidReason: string | null;
}

export interface ContestVersion {
  version: number;
  placements: Placement[];
  committedBy: string | null;
  committedAt: number | null;
  reason: string;
}

export interface RecordDoc {
  id: string; // 'Y7__shot'
  year: string; // 'Y7'
  event: string; // 'shot'
  units: RecordUnits; // 'second' (lower better) | 'metre' (higher better)
  standingScore: number | null;
  standingHolder: string | null; // historical free-text label (may be an old form code)
  standingYear: number | null;
  currentScore: number | null; // this year's best
  currentForm: string | null; // formId achieving currentScore
  currentYear: number | null;
  doScore: 0 | 1 | 2; // computed bonus (0 none, 1 equal, 2 beat)
}

export interface SubmissionAttribution {
  submittedByUid: string;
  prefectName: string;
  areaCode: string;
  codeId: string;
  deviceId: string;
}

/**
 * A results-tent query attached to a submission that was sent back for clarification.
 * Set by the requestClarification Cloud Function; cleared when the prefect resubmits
 * (a fresh setDoc overwrites the doc without this field, returning it to 'pending').
 */
export interface SubmissionClarification {
  message: string; // the admin's question for the prefect
  byUid: string; // admin uid who asked
  byName: string; // admin display name (shown to the prefect)
  at: number; // epoch ms
}

export interface Submission {
  id: string; // `${deviceId}__${contestId}`
  seasonId?: string; // which season this belongs to (dry-run isolation); absent = the live season
  contestId: string;
  year: string;
  event: string;
  string: string;
  placements: Placement[];
  status: SubmissionStatus;
  attribution: SubmissionAttribution;
  clientCreatedAt: number; // Date.now() on device (offline-safe ordering)
  clientSubmissionId: string;
  syncedAt: number | null;
  note?: string | null; // e.g. "possible record" flag text
  winnerMark?: number | null; // optional winning time (seconds) / distance (metres), for record checking
  clarification?: SubmissionClarification | null; // present only while status === 'clarify'
}

// ---------------------------------------------------------------------------
// Derived: standings (the scoreboard's single read)
// ---------------------------------------------------------------------------

export interface FormStanding {
  formId: string;
  year: string;
  code: string;
  label: string;
  colour: string;
  total: number;
  regularPoints: number;
  bonusPoints: number;
  yearPos: number; // 1..8 within year (competition ranking)
  schoolPos: number; // 1..32 whole school
  prevSchoolPos: number | null; // drives up/down arrows
  counts: { firsts: number; seconds: number; thirds: number };
  byEvent: Record<string, number>; // contestId -> points (drill-down)
}

/** Individual champion (victor ludorum) — projected from named placements. Phase 2. */
export interface AthleteStanding {
  name: string;
  year: string;
  total: number;
  firsts: number;
  pos: number; // 1-based rank within year (competition ranking)
}

export interface RecordBreak {
  recordId: string;
  event: string;
  year: string;
  formId: string;
  score: number;
  units: RecordUnits; // so the scoreboard can format the mark (12.4s / 4.2m) without a lookup
  kind: 'equal' | 'beat';
}

export interface Standings {
  seasonId: string;
  computedAt: number;
  configVersion: number;
  sourceHash: string;
  progress: { committed: number; total: number; void: number };
  forms: Record<string, FormStanding>;
  recentResults: { contestId: string; label: string; committedAt: number }[];
  records: { broken: RecordBreak[] };
  /** Individual champions per year (Phase 2). Empty until placements carry athlete names. */
  athletes?: { byYear: Record<string, AthleteStanding[]> };
}

// ---------------------------------------------------------------------------
// Public display control (the results-tent "suspense / reveal" kill switch)
// ---------------------------------------------------------------------------

/**
 * - 'live'      : the public scoreboard updates in real time as results commit.
 * - 'suspense'  : the public board switches to a holding screen — the audience can
 *                 no longer see who is winning, so the final results stay secret
 *                 until the official announcement.
 * - 'revealed'  : triggers the dramatic champion reveal animation from the final standings.
 */
export type DisplayMode = 'live' | 'suspense' | 'revealed';

export interface DisplayControl {
  seasonId: string;
  mode: DisplayMode;
  /** Optional custom holding-screen message for suspense mode. */
  message: string | null;
  /** When set, the public board reveals at most this year-group's results (staged reveals). */
  revealScope: string | null; // null = all / whole school
  updatedAt: number;
  updatedBy: string;
}

// ---------------------------------------------------------------------------
// Schedule / timetable (the day's running order)
// ---------------------------------------------------------------------------

export type ScheduleKind = 'track' | 'field' | 'relay' | 'info';

export interface ScheduleSlot {
  time: number; // minutes since midnight (time of day), e.g. 9*60+22 = 562 for 09:22
  label: string; // human label, e.g. '200m · Year 7 · C'
  kind: ScheduleKind;
  year?: string; // 'Y7' (for colour / grouping)
  area?: string; // field-event location (e.g. 'Long Jump Pits')
  contestIds?: string[]; // contests this slot covers — for "overdue" + tap-to-enter
}

/** The day's running order. One world-readable doc; admins seed/edit it. */
export interface ScheduleDoc {
  seasonId: string;
  offsetMin: number; // "running N minutes behind" — shifts now/next/overdue on the day
  eventDate?: string; // 'YYYY-MM-DD' — now/next/overdue only go live on this date; dormant before/after
  slots: ScheduleSlot[];
}

// ---------------------------------------------------------------------------
// Audit / access
// ---------------------------------------------------------------------------

export type AuditAction =
  | 'commit'
  | 'correct'
  | 'void'
  | 'unvoid'
  | 'config-change'
  | 'record'
  | 'resolve-duplicate'
  | 'clarify';

export interface AuditEntry {
  ts: number;
  actor: string;
  actorName: string;
  action: AuditAction;
  target: string;
  before: unknown;
  after: unknown;
  reason: string;
}
