/**
 * Dev-only: fill the EMULATOR with a realistic, fully-played season (committed results
 * across every year + athlete names) and write the computed standings, so the live
 * scoreboard has something to show for a visual check. Never touches production.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=mgssportsday-55624 tsx src/populate.ts
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { computeStandings } from '@mgs/scoring';
import { buildForms, EVENTS, buildSeasonConfig, RECORDS } from './data';
import type { Contest, Placement, RecordDoc } from '@mgs/config-types';

initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'mgssportsday-55624' });
const db = getFirestore();

const YEARS = ['Y7', 'Y8', 'Y9', 'Y10'];
const forms = buildForms();
const config = buildSeasonConfig();
const formsByYear: Record<string, typeof forms> = Object.fromEntries(YEARS.map((y) => [y, forms.filter((f) => f.year === y)]));

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
}

const contests: Contest[] = [];
EVENTS.forEach((ev, evIdx) => {
  for (const y of YEARS) {
    for (const s of ev.strings) {
      const id = `${y}__${ev.id}__${s}`;
      if (Math.random() < 0.18) {
        contests.push({ id, year: y, event: ev.id, string: s, isRelay: ev.isRelay, status: 'outstanding', version: 0, placements: [], committedBy: null, committedAt: null, voidReason: null });
        continue;
      }
      const placed = shuffle(formsByYear[y]!);
      // Each form fields 3 rotating athletes (A/B/C) across the programme, so an individual
      // accumulates points over several events — a real victor-ludorum race.
      const placements: Placement[] = placed.map((f, i) => ({
        formId: f.id,
        position: i + 1,
        athleteName: `${f.label}-${['A', 'B', 'C'][(evIdx + i) % 3]}`,
      }));
      contests.push({ id, year: y, event: ev.id, string: s, isRelay: ev.isRelay, status: 'committed', version: 1, placements, committedBy: 'pop', committedAt: Date.now() - Math.floor(Math.random() * 3_600_000), voidReason: null });
    }
  }
});

// Break a few records so the callout + bonus show.
const records: RecordDoc[] = RECORDS.map((r, i) => {
  if (i % 9 !== 0 || r.standingScore == null) return r;
  const better = r.units === 'second' ? r.standingScore - 0.3 : r.standingScore + 0.3;
  return { ...r, currentScore: Math.round(better * 100) / 100, currentForm: formsByYear[r.year]?.[0]?.id ?? null, currentYear: 2026 };
});

const st = computeStandings({ contests, records, forms, config });
st.computedAt = Date.now();

await Promise.all([
  db.doc('standings/2026').set(st),
  db.doc('control/2026').set({ seasonId: '2026', mode: 'live', message: null, revealScope: null, updatedAt: Date.now(), updatedBy: 'pop' }),
]);

const athYears = Object.entries(st.athletes?.byYear ?? {}).map(([y, a]) => `${y}:${a.length}`);
console.log(`✓ populated: ${st.progress.committed}/${st.progress.total} committed, ${st.records.broken.length} records broken, athletes ${athYears.join(' ')}`);
process.exit(0);
