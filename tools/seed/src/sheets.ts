/**
 * Generates the printable A4 PAPER BACKUP result sheets — one sheet PER RACE
 * (year-group × event × A/B/C string, 100 sheets) so A, B and C each print on
 * their own page — from the canonical season data, so the legends match the live roster.
 *
 * Run: pnpm --filter @mgs/seed run sheets
 * Output: print/MGS-SportsDay-2026-Backup-Sheets.html  (open in a browser → Print / Save as PDF)
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { EventDef, Form, YearGroup } from '@mgs/config-types';
import { YEAR_GROUPS, EVENTS, buildForms } from './data';

function contrast(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? '#0f172a' : '#ffffff';
}

const ordSuffix = (n: number): string => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
};

function scoreLabel(ev: EventDef): { label: string; unit: string } {
  if (ev.discipline === 'field') {
    return ev.id === 'highJump' ? { label: 'Best height', unit: 'm' } : { label: 'Best distance', unit: 'm' };
  }
  return { label: 'Winning time', unit: 'sec' };
}

function columnLabel(ev: EventDef, s: string): string {
  if (ev.isRelay) return 'TEAM RESULT';
  if (ev.discipline === 'track') return `${s} RACE`;
  if (ev.strings.length === 1) return 'RESULT';
  return `${s} GROUP`;
}

// The MGS athletics emblem (gold medal over a three-step podium), inlined so the printout
// is self-contained. `mono` paints the whole mark one colour (for the header / watermark).
function crest(size: number, mono?: string): string {
  const gold = mono ?? '#f5b301';
  const dark = mono ?? '#0a1a33';
  return `<svg class="crest" width="${size}" height="${size}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="24" cy="12" r="5.6" fill="${gold}"/><circle cx="24" cy="12" r="2.4" fill="${dark}" opacity="0.82"/><rect x="8" y="29" width="9.5" height="9" rx="1.7" fill="${gold}" opacity="0.78"/><rect x="19.25" y="22.5" width="9.5" height="15.5" rx="1.7" fill="${gold}"/><rect x="30.5" y="25.5" width="9.5" height="12.5" rx="1.7" fill="${gold}" opacity="0.78"/></svg>`;
}

function sheet(year: YearGroup, ev: EventDef, s: string, forms: Form[], pageNo: number, pageTotal: number): string {
  const sc = scoreLabel(ev);
  const discipline = ev.discipline === 'track' ? 'Track' : 'Field';
  const raceName = columnLabel(ev, s); // "A RACE" / "FINAL" / "RESULT" / "A GROUP"
  const legend = forms
    .map((f) => `<span class="chip" style="background:${f.colour};color:${contrast(f.colour)}">${f.label}</span>`)
    .join('');

  const rows = forms
    .map((_, i) => {
      const p = i + 1;
      const pos =
        p <= 3
          ? `<span class="medal-badge m${p}">${p}</span>`
          : `<span class="pos-num">${p}<sup>${ordSuffix(p)}</sup></span>`;
      return `<li class="place rank-${p}"><span class="pos">${pos}</span><span class="write"></span></li>`;
    })
    .join('');
  const race = `<div class="race">
        <div class="race-head" style="--accent:${year.colour}">${raceName}</div>
        <div class="watermark">${crest(48, year.colour)}</div>
        <ol class="placings">${rows}</ol>
      </div>`;

  return `<section class="sheet" style="--accent:${year.colour}">
  <header class="band">
    <div class="band-top">
      <span class="logo">${crest(16, '#ffffff')} MGS SPORTS DAY 2026</span>
      <span class="backup-tag">PAPER BACKUP</span>
    </div>
    <div class="band-main">
      <div class="title-wrap">
        <div class="yr">${year.label}</div>
        <h1>${ev.label}</h1>
      </div>
      <span class="disc">${discipline} · ${raceName}</span>
    </div>
  </header>

  <section class="howto">
    <b>How to fill this in</b>
    <ol>
      <li>Write the <b>form code</b> that finished in every position for <b>this ${ev.isRelay ? 'final' : 'race'}</b> — use the codes below.</li>
      <li>Fill the <b>Event best</b> box: the winner's form, full name and ${sc.label.toLowerCase()}.</li>
      <li>Write your name at the bottom, then take this sheet to the <b>Results Tent</b>.</li>
    </ol>
  </section>

  <section class="legend">
    <span class="legend-label">${year.label} forms:</span>${legend}
  </section>

  <section class="winner">
    <span class="medal">🥇</span>
    <div class="wf"><label>Event best — form</label><span class="writeline"></span></div>
    <div class="wf grow"><label>Athlete's full name</label><span class="writeline"></span></div>
    <div class="wf"><label>${sc.label} (${sc.unit})</label><span class="writeline"></span></div>
    <span class="winner-note">for record check</span>
  </section>

  <section class="races single">${race}</section>

  <footer class="foot">
    <div class="ff"><label>Prefect name</label><span class="writeline"></span></div>
    <div class="tent">Tent use only:&nbsp; entered <span class="box"></span></div>
    <span class="brandfoot">${crest(13)} Manchester Grammar School</span>
    <span class="pageno">${pageNo} / ${pageTotal}</span>
  </footer>
</section>`;
}

function cover(order: 'year' | 'station', total: number): string {
  const orderText =
    order === 'year'
      ? `Sheets are grouped <b>by year group, then event, then race (A/B/C each on its own page)</b>. ${total} sheets follow this cover.`
      : `Sheets are grouped <b>by event, then year group</b> — hand each prefect their event's sheets; <b>each race (A, B, C) is its own page</b>. ${total} sheets follow this cover.`;
  const subtitle = order === 'year' ? 'Paper Backup — organised by Year Group' : 'Paper Backup — organised by Event / Station';
  return `<section class="sheet cover">
    <div class="cover-mark">🏆</div>
    <h1>MGS Sports Day 2026</h1>
    <h2>${subtitle}</h2>
    <p class="cover-lede">A complete set of handwriting sheets — <b>one per race</b> (every A, B and C heat on its own page) — to run scoring on paper if phones, signal, or the live system are unavailable.</p>
    <div class="cover-steps">
      <div><b>1. At the event</b><br/>The prefect records the finishing order (which form came where) and the winner's details.</div>
      <div><b>2. At the tent</b><br/>Staff type the sheet into the admin app's <b>Contests</b> page, or keep them as the official record.</div>
      <div><b>3. Organised</b><br/>${orderText}</div>
    </div>
    <p class="cover-foot">Tip: to print only some, choose the page range in your browser's print dialog. (This pack is also available ordered the other way.)</p>
  </section>`;
}

function buildHtml(order: 'year' | 'station'): string {
  const allForms = buildForms();
  const formsByYear = new Map(YEAR_GROUPS.map((y) => [y.id, allForms.filter((f) => f.year === y.id)]));
  // One sheet PER RACE — A, B and C each on their own page.
  const triples: { year: YearGroup; ev: EventDef; s: string }[] = [];
  if (order === 'year') {
    for (const year of YEAR_GROUPS) for (const ev of EVENTS) for (const s of ev.strings) triples.push({ year, ev, s });
  } else {
    for (const ev of EVENTS) for (const year of YEAR_GROUPS) for (const s of ev.strings) triples.push({ year, ev, s });
  }
  const pageTotal = triples.length;
  const sheets = triples.map(({ year, ev, s }, i) => sheet(year, ev, s, formsByYear.get(year.id) ?? [], i + 1, pageTotal));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>MGS Sports Day 2026 — Paper Backup Sheets</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  :root { --ink:#0f172a; --muted:#64748b; --line:#cbd5e1; }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif;
    color: var(--ink); background: #e2e8f0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sheet {
    width: 210mm; height: 297mm; padding: 12mm 12mm 9mm;
    margin: 0 auto 8mm; background: #fff; position: relative;
    display: flex; flex-direction: column; gap: 4mm;
    page-break-after: always; overflow: hidden;
  }
  .sheet:last-child { page-break-after: auto; }
  @media print { body { background: #fff; } .sheet { margin: 0; } }

  /* Header band */
  .band { background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 74%, #050d1c)); color: #fff; border-radius: 4mm; padding: 4mm 5mm; border-bottom: 1.4mm solid #f5b301; box-shadow: 0 1mm 2.5mm rgba(0,0,0,.1); }
  .band-top { display: flex; justify-content: space-between; align-items: center; font-size: 9pt; font-weight: 700; letter-spacing: .04em; opacity: .92; }
  .logo { display: inline-flex; align-items: center; gap: 1.8mm; }
  .logo .crest { flex: none; }
  .backup-tag { background: rgba(255,255,255,.22); padding: .8mm 2.4mm; border-radius: 99px; font-size: 8pt; }
  .band-main { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 1.5mm; }
  .yr { font-size: 11pt; font-weight: 700; opacity: .92; }
  .band h1 { margin: 0; font-size: 30pt; font-weight: 800; line-height: 1; letter-spacing: -.01em; }
  .disc { font-size: 9pt; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; background: rgba(255,255,255,.2); padding: 1.2mm 3mm; border-radius: 99px; }

  /* How-to */
  .howto { border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 2.5mm; padding: 2.5mm 4mm; font-size: 9.5pt; }
  .howto b { font-size: 9.5pt; }
  .howto ol { margin: 1mm 0 0; padding-left: 5mm; }
  .howto li { margin: .6mm 0; }

  /* Legend */
  .legend { display: flex; align-items: center; flex-wrap: wrap; gap: 2mm; }
  .legend-label { font-size: 9pt; font-weight: 700; color: var(--muted); }
  .chip { font-weight: 800; font-size: 10pt; padding: 1mm 2.6mm; border-radius: 2mm; }

  /* Winner box */
  .winner { display: flex; align-items: flex-end; gap: 3mm; border: 1.5px solid var(--accent); background: color-mix(in srgb, var(--accent) 8%, #fff); border-radius: 2.5mm; padding: 2.5mm 3.5mm; }
  .winner .medal { font-size: 18pt; line-height: 1; }
  .wf { display: flex; flex-direction: column; gap: 1mm; }
  .wf.grow { flex: 1; }
  .wf label { font-size: 8pt; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
  .winner .wf:nth-of-type(2) .writeline { min-width: 30mm; }
  .writeline { display: block; height: 7mm; border-bottom: 1.5px solid var(--ink); min-width: 22mm; }
  .winner-note { font-size: 7.5pt; color: var(--muted); writing-mode: vertical-rl; transform: rotate(180deg); align-self: center; }

  /* Races */
  .races { display: grid; gap: 4mm; flex: 1; }
  .races.cols-1 { grid-template-columns: minmax(0, 70mm); justify-content: center; }
  .races.cols-2 { grid-template-columns: 1fr 1fr; }
  .races.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
  .races.single { grid-template-columns: minmax(0, 130mm); justify-content: center; }
  .race { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 2.5mm; overflow: hidden; position: relative; }
  .race-head { background: var(--accent); color: #fff; font-weight: 800; font-size: 11pt; letter-spacing: .04em; text-align: center; padding: 2mm; position: relative; z-index: 1; }
  .watermark { position: absolute; top: 11mm; left: 0; right: 0; bottom: 0; display: grid; place-items: center; pointer-events: none; z-index: 0; }
  .watermark .crest { width: 76mm; height: 76mm; opacity: .06; }
  .placings { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; flex: 1; position: relative; z-index: 1; }
  .place { display: flex; align-items: center; gap: 2.5mm; padding: 0 3mm; flex: 1; border-top: 1px solid #eef1f6; }
  .place:first-child { border-top: 0; }
  .place .pos { font-weight: 800; font-size: 12pt; color: var(--muted); width: 11mm; flex: none; display: flex; align-items: center; }
  .place .pos sup { font-size: 7pt; }
  .place .write { flex: 1; align-self: stretch; border-bottom: 1.4px solid var(--line); margin: 1.4mm 0; }
  /* Translucent tints so the podium watermark reads evenly through every row. */
  .rank-1 { background: rgba(245, 179, 1, 0.14); }
  .rank-2 { background: rgba(148, 163, 184, 0.13); }
  .rank-3 { background: rgba(217, 119, 6, 0.11); }
  .medal-badge { display: inline-flex; align-items: center; justify-content: center; width: 8mm; height: 8mm; border-radius: 50%; font-size: 10pt; font-weight: 900; color: #4a3000; box-shadow: inset 0 0 0 .4mm rgba(255,255,255,.55), 0 .4mm .8mm rgba(0,0,0,.18); }
  .medal-badge.m1 { background: radial-gradient(circle at 35% 30%, #ffe9a0, #f3b203 72%); }
  .medal-badge.m2 { background: radial-gradient(circle at 35% 30%, #fbfdff, #b6c0cb 72%); color: #39414e; }
  .medal-badge.m3 { background: radial-gradient(circle at 35% 30%, #f7caa0, #c87d36 72%); color: #3a1e00; }

  /* Footer */
  .foot { display: flex; align-items: flex-end; gap: 5mm; border-top: 1px solid var(--line); padding-top: 2.5mm; }
  .ff { display: flex; flex-direction: column; gap: 1mm; flex: 1; }
  .ff label { font-size: 8pt; font-weight: 700; color: var(--muted); text-transform: uppercase; }
  .tent { font-size: 8.5pt; color: var(--muted); }
  .tent .box { display: inline-block; width: 3.5mm; height: 3.5mm; border: 1.3px solid var(--muted); vertical-align: -.5mm; border-radius: 1px; }
  .tent .u { display: inline-block; width: 16mm; border-bottom: 1px solid var(--muted); }
  .brandfoot { display: inline-flex; align-items: center; gap: 1.4mm; font-size: 7.5pt; font-weight: 700; color: var(--muted); }
  .brandfoot .crest { flex: none; }
  .pageno { font-size: 8pt; color: var(--muted); font-weight: 700; }

  /* Cover */
  .cover { align-items: center; justify-content: center; text-align: center; gap: 5mm; }
  .cover-mark { font-size: 54pt; }
  .cover h1 { font-size: 34pt; margin: 0; }
  .cover h2 { font-size: 16pt; margin: 0; color: var(--muted); font-weight: 700; }
  .cover-lede { max-width: 130mm; font-size: 11pt; color: #334155; }
  .cover-steps { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5mm; max-width: 170mm; margin-top: 4mm; }
  .cover-steps > div { border: 1px solid var(--line); border-radius: 3mm; padding: 4mm; font-size: 9.5pt; text-align: left; }
  .cover-foot { font-size: 9pt; color: var(--muted); margin-top: 6mm; }
</style>
</head>
<body>
${cover(order, pageTotal)}
${sheets.join('\n')}
</body>
</html>`;
}

// A single pen-fillable A4 results sheet for the presentation: 1st/2nd/3rd per year group,
// plus the overall whole-school champions. Filled in by hand as results are confirmed.
function buildFinalResults(): string {
  const place = (p: number) => `<div class="fr-place"><span class="medal-badge m${p}">${p}</span><span class="fr-line"></span></div>`;
  const yearBox = (y: YearGroup) =>
    `<div class="fr-year" style="--accent:${y.colour}"><div class="fr-year-head">${y.label}</div>${[1, 2, 3].map(place).join('')}</div>`;
  const ord = ['1st', '2nd', '3rd'];
  const overall = [1, 2, 3]
    .map((p) => `<div class="fr-oplace"><span class="medal-badge m${p}">${p}</span><span class="fr-oplabel">${ord[p - 1]}</span><span class="fr-line"></span></div>`)
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>MGS Sports Day 2026 — Final Results</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  :root { --ink:#0f172a; --muted:#64748b; --line:#cbd5e1; }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif; color: var(--ink); background: #e2e8f0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { width: 210mm; height: 297mm; padding: 13mm 13mm 10mm; margin: 0 auto; background: #fff; display: flex; flex-direction: column; gap: 6mm; }
  @media print { body { background: #fff; } }
  .band { background: linear-gradient(135deg, #c2185b, #7a1340); color: #fff; border-radius: 4mm; padding: 5mm 6mm; border-bottom: 1.6mm solid #f5b301; box-shadow: 0 1mm 2.5mm rgba(0,0,0,.1); }
  .band-top { display: flex; justify-content: space-between; align-items: center; font-size: 10pt; font-weight: 700; letter-spacing: .04em; opacity: .92; }
  .logo { display: inline-flex; align-items: center; gap: 2mm; }
  .crest { flex: none; }
  .backup-tag { background: rgba(255,255,255,.22); padding: 1mm 3mm; border-radius: 99px; font-size: 9pt; }
  .band-main { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 2mm; }
  .band h1 { margin: 0; font-size: 34pt; font-weight: 800; line-height: 1; }
  .disc { font-size: 10pt; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; background: rgba(255,255,255,.2); padding: 1.4mm 3.5mm; border-radius: 99px; }
  .intro { font-size: 10.5pt; color: var(--muted); margin: 0; }
  .medal-badge { display: inline-flex; align-items: center; justify-content: center; width: 9mm; height: 9mm; border-radius: 50%; font-size: 11pt; font-weight: 900; color: #4a3000; flex: none; box-shadow: inset 0 0 0 .4mm rgba(255,255,255,.55), 0 .4mm .8mm rgba(0,0,0,.18); }
  .medal-badge.m1 { background: radial-gradient(circle at 35% 30%, #ffe9a0, #f3b203 72%); }
  .medal-badge.m2 { background: radial-gradient(circle at 35% 30%, #fbfdff, #b6c0cb 72%); color: #39414e; }
  .medal-badge.m3 { background: radial-gradient(circle at 35% 30%, #f7caa0, #c87d36 72%); color: #3a1e00; }
  .fr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; flex: 1; }
  .fr-year { border: 1.5px solid var(--accent); border-radius: 3mm; overflow: hidden; display: flex; flex-direction: column; }
  .fr-year-head { background: var(--accent); color: #fff; font-weight: 800; font-size: 14pt; padding: 2.6mm 4mm; }
  .fr-place { display: flex; align-items: center; gap: 4mm; padding: 0 5mm; flex: 1; border-top: 1px solid #eef1f6; }
  .fr-place:first-of-type { border-top: 0; }
  .fr-line { flex: 1; border-bottom: 1.6px solid var(--ink); height: 8mm; }
  .fr-overall { border: 2px solid #f5b301; border-radius: 3mm; overflow: hidden; }
  .fr-overall-head { background: linear-gradient(135deg, #f5b301, #f97316); color: #2a1c00; font-weight: 900; font-size: 15pt; padding: 3mm 5mm; }
  .fr-oplaces { display: flex; flex-direction: column; }
  .fr-oplace { display: flex; align-items: center; gap: 4mm; padding: 0 6mm; min-height: 15mm; border-top: 1px solid #f3e7c4; }
  .fr-oplace:first-child { border-top: 0; }
  .fr-oplabel { font-weight: 800; font-size: 11pt; color: var(--muted); width: 11mm; flex: none; }
  .fr-oplace .fr-line { flex: 1; height: 9mm; }
  .foot { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--line); padding-top: 3mm; }
  .brandfoot { display: inline-flex; align-items: center; gap: 1.5mm; font-size: 8.5pt; font-weight: 700; color: var(--muted); }
  .pageno { font-size: 8.5pt; color: var(--muted); font-weight: 700; }
</style>
</head>
<body>
  <section class="sheet">
    <header class="band">
      <div class="band-top"><span class="logo">${crest(18, '#ffffff')} MGS SPORTS DAY 2026</span><span class="backup-tag">PRESENTATION</span></div>
      <div class="band-main"><h1>Final Results</h1><span class="disc">Champions</span></div>
    </header>
    <p class="intro">Fill in the winning forms as each result is confirmed — first by year group, then the overall whole-school champions.</p>
    <section class="fr-grid">${YEAR_GROUPS.map(yearBox).join('')}</section>
    <section class="fr-overall">
      <div class="fr-overall-head">🏆 Overall — Whole-School Champions</div>
      <div class="fr-oplaces">${overall}</div>
    </section>
    <footer class="foot">
      <span class="brandfoot">${crest(13)} Manchester Grammar School</span>
      <span class="pageno">Final Results · 2026</span>
    </footer>
  </section>
</body>
</html>`;
}

function indexHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>MGS Sports Day 2026 — Print Hub</title>
<style>
  body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; color: #0f172a;
    background: linear-gradient(160deg, #eef2f9, #e3e9f5); min-height: 100vh; }
  .wrap { max-width: 820px; margin: 0 auto; padding: 6vh 6vw; }
  h1 { font-size: 2rem; margin: 0 0 .3rem; }
  .lede { color: #5d6b82; margin: 0 0 2rem; }
  .cards { display: grid; gap: 1rem; grid-template-columns: 1fr 1fr; }
  @media (max-width: 640px) { .cards { grid-template-columns: 1fr; } }
  a.card { display: block; text-decoration: none; color: inherit; background: #fff; border: 1px solid #e3e8f0;
    border-radius: 16px; padding: 1.3rem 1.4rem; box-shadow: 0 4px 12px rgba(15,23,42,.06); transition: transform .15s, box-shadow .15s; }
  a.card:hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(15,23,42,.12); }
  .card h3 { margin: 0 0 .3rem; font-size: 1.1rem; }
  .card p { margin: 0; color: #5d6b82; font-size: .92rem; }
  .tag { display: inline-block; font-size: .7rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase;
    color: #2563eb; background: #dbeafe; padding: .2rem .55rem; border-radius: 99px; margin-bottom: .6rem; }
  .apps { margin-top: 2rem; font-size: .92rem; color: #5d6b82; }
  .apps a { color: #2563eb; font-weight: 600; }
</style></head>
<body><div class="wrap">
  <h1>🏆 MGS Sports Day 2026 — Print Hub</h1>
  <p class="lede">Printable paper backup result sheets. Open a pack, then Print → A4 (or Save as PDF).</p>
  <div class="cards">
    <a class="card" href="./backup-by-year.html"><span class="tag">For the tent</span><h3>By Year Group</h3><p>Every race sheet grouped Year 7 → 10, each year's events (and A/B/C heats) together.</p></a>
    <a class="card" href="./backup-by-station.html"><span class="tag">For prefects</span><h3>By Event / Station</h3><p>Same sheets grouped by event — hand each prefect their event's sheets. Each race (A, B, C) is its own page.</p></a>
    <a class="card" href="./final-results.html"><span class="tag">For the presentation</span><h3>Final Results sheet</h3><p>One page to fill in by hand — 1st/2nd/3rd for each year group plus the overall whole-school champions.</p></a>
    <a class="card" href="https://mgssportsday-55624.web.app/final"><span class="tag">For the announcer</span><h3>Live Final Results ↗</h3><p>The same sheet, <b>auto-filled from the platform</b> — open on a laptop in portrait to read out, or print. Updates live.</p></a>
  </div>
  <p class="apps">Live system: <a href="https://mgssportsday-55624.web.app">Scoreboard</a> ·
    <a href="https://mgssportsday-admin.web.app">Admin</a> ·
    <a href="https://mgssportsday-entry.web.app">Entry</a></p>
</div></body></html>`;
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../../print');
mkdirSync(outDir, { recursive: true });

const files: [string, string][] = [
  ['backup-by-year.html', buildHtml('year')],
  ['backup-by-station.html', buildHtml('station')],
  ['final-results.html', buildFinalResults()],
  ['index.html', indexHtml()],
];
for (const [name, html] of files) writeFileSync(resolve(outDir, name), html, 'utf8');

const total = YEAR_GROUPS.length * EVENTS.reduce((n, e) => n + e.strings.length, 0);
console.log(`\n✓ Wrote ${total} sheets (one per race) × 2 orderings + a print hub to:\n  ${outDir}`);
console.log(`  • index.html              (print hub)`);
console.log(`  • backup-by-year.html     (grouped by year group)`);
console.log(`  • backup-by-station.html  (grouped by event/station)`);
console.log(`  Open index.html in a browser → choose a pack → Print → A4 (or Save as PDF).\n`);
