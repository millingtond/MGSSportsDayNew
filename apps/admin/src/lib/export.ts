/** Client-side result exports for the school's records + post-event verification. */
import type { Standings, Contest, RecordDoc, SeasonConfig, Submission } from '@mgs/config-types';
import { sortByPos } from '@mgs/ui';

function triggerDownload(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function cell(v: unknown): string {
  let s = v == null ? '' : String(v);
  // Neutralise spreadsheet formula injection — athlete names + form labels are free text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const toCsv = (rows: unknown[][]): string => rows.map((r) => r.map(cell).join(',')).join('\r\n');

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Human-readable local datetime for a CSV cell (e.g. '2026-07-01 09:23:14'). */
function localDt(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Whole-school + per-year standings as a spreadsheet (the main results table). */
export function exportStandingsCsv(std: Standings): void {
  const forms = sortByPos(Object.values(std.forms), 'schoolPos');
  const rows: unknown[][] = [
    ['School Rank', 'Year Rank', 'Form', 'Year', 'Total', 'Regular', 'Bonus', '1sts', '2nds', '3rds'],
    ...forms.map((f) => [f.schoolPos, f.yearPos, f.label, f.year, f.total, f.regularPoints, f.bonusPoints, f.counts.firsts, f.counts.seconds, f.counts.thirds]),
  ];
  // Append individual champions, if any, as a labelled second block.
  const byYear = std.athletes?.byYear ?? {};
  const indiv = Object.entries(byYear).flatMap(([year, list]) => list.map((a) => [year, a.pos, a.name, a.total, a.firsts]));
  if (indiv.length) {
    rows.push([], ['INDIVIDUAL CHAMPIONS'], ['Year', 'Rank', 'Athlete', 'Total', '1sts'], ...indiv);
  }
  triggerDownload(`mgs-sportsday-standings-${stamp()}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
}

/** Everything — standings, every committed event's placements, records — as a JSON archive. */
export function exportArchiveJson(opts: {
  standings: Standings | null;
  contests: Contest[];
  records: RecordDoc[];
  config: SeasonConfig | null;
}): void {
  const archive = {
    exportedAt: new Date().toISOString(),
    season: opts.config?.id ?? null,
    label: opts.config?.label ?? null,
    standings: opts.standings,
    committedContests: opts.contests
      .filter((c) => c.status === 'committed')
      .map((c) => ({ id: c.id, year: c.year, event: c.event, string: c.string, version: c.version, committedAt: c.committedAt, placements: c.placements })),
    records: opts.records.map((r) => ({
      id: r.id, year: r.year, event: r.event, units: r.units,
      standingScore: r.standingScore, standingHolder: r.standingHolder,
      currentScore: r.currentScore, currentForm: r.currentForm, doScore: r.doScore,
    })),
  };
  triggerDownload(`mgs-sportsday-archive-${stamp()}.json`, JSON.stringify(archive, null, 2), 'application/json');
}

/**
 * Every RAW prefect submission (the whole queue — pending AND committed) as a spreadsheet.
 * This is the off-platform safety net: one row per submission with the finishing order spelled
 * out, so it reads like the old paper/Sheets method if you ever have to fall back to it.
 */
export function exportSubmissionsCsv(subs: Submission[], formLabel: Record<string, string>): void {
  const order = (ps: Submission['placements']) =>
    [...ps]
      .sort((a, b) => a.position - b.position)
      .map((p) => `${p.position}: ${formLabel[p.formId] ?? p.formId}${p.athleteName ? ` (${p.athleteName})` : ''}`)
      .join('   ');
  const rows: unknown[][] = [
    ['Submitted (local)', 'Status', 'Year', 'Event', 'String', 'Finishing order', 'Winning mark', 'Station', 'Prefect', 'Note', 'Synced (local)', 'Device', 'Submission ID'],
    ...[...subs]
      .sort((a, b) => a.clientCreatedAt - b.clientCreatedAt)
      .map((s) => [
        localDt(s.clientCreatedAt),
        s.status,
        s.year,
        s.event,
        s.string,
        order(s.placements),
        s.winnerMark ?? '',
        s.attribution?.areaCode ?? '',
        s.attribution?.prefectName ?? '',
        s.note ?? '',
        s.syncedAt ? localDt(s.syncedAt) : '',
        s.attribution?.deviceId ?? '',
        s.id,
      ]),
  ];
  triggerDownload(`mgs-sportsday-submissions-${stamp()}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
}

/** The same raw submissions as a faithful JSON copy (every field) for exact recovery. */
export function exportSubmissionsJson(subs: Submission[]): void {
  const archive = {
    exportedAt: new Date().toISOString(),
    count: subs.length,
    submissions: [...subs].sort((a, b) => a.clientCreatedAt - b.clientCreatedAt),
  };
  triggerDownload(`mgs-sportsday-submissions-${stamp()}.json`, JSON.stringify(archive, null, 2), 'application/json');
}
