<script lang="ts">
  import { data } from '$lib/data.svelte';
  import { sortByPos, contrastText, formatMark } from '@mgs/ui';
  import { YEAR_ORDER, YEAR_META, yearLabel } from '$lib/helpers';
  import { getSeasonId } from '@mgs/firebase';
  import type { FormStanding } from '@mgs/config-types';

  const std = $derived(data.standings);
  const allForms = $derived(std ? Object.values(std.forms) : []);
  const schoolSorted = $derived(sortByPos(allForms, 'schoolPos'));
  const leadMargin = $derived(Math.max(0, (schoolSorted[0]?.total ?? 0) - (schoolSorted[1]?.total ?? 0)));
  const mode = $derived(data.control?.mode ?? 'live');
  const scored = $derived((schoolSorted[0]?.total ?? 0) > 0);
  const broken = $derived(std?.records?.broken ?? []);
  const seasonName = getSeasonId();

  function yearForms(year: string): FormStanding[] {
    return sortByPos(
      allForms.filter((f) => f.year === year),
      'yearPos',
    );
  }
  // Podium slots in visual order 2 · 1 · 3 (champion tallest, centre).
  function podium(list: FormStanding[]) {
    return [
      { form: list[1], place: 2 },
      { form: list[0], place: 1 },
      { form: list[2], place: 3 },
    ].filter((s): s is { form: FormStanding; place: number } => !!s.form);
  }
  const medal = ['🥇', '🥈', '🥉'];
  const eventLabel = (id: string) => data.events.find((e) => e.id === id)?.label ?? id;
  const formLabel = (id: string) => allForms.find((f) => f.formId === id)?.label ?? id;
</script>

{#snippet podiumRow(list: FormStanding[])}
  <div class="podium">
    {#each podium(list) as s (s.form.formId)}
      <div class="pslot p{s.place}">
        <div class="pmedal">{medal[s.place - 1]}</div>
        <div class="pchip" style="background:{s.form.colour}; color:{contrastText(s.form.colour)}">{s.form.label}</div>
        <div class="pblock">
          <span class="ptotal num">{s.form.total}</span>
          <span class="ppts">pts</span>
        </div>
      </div>
    {/each}
  </div>
{/snippet}

{#snippet resultTable(list: FormStanding[], posField: 'schoolPos' | 'yearPos')}
  <ol class="rows">
    {#each list as f (f.formId)}
      <li class:top={f[posField] <= 3}>
        <span class="pos">{f[posField] <= 3 ? medal[f[posField] - 1] : f[posField]}</span>
        <span class="chip" style="background:{f.colour}; color:{contrastText(f.colour)}">{f.label}</span>
        <span class="grow"></span>
        {#if f.counts.firsts}<span class="firsts">{f.counts.firsts}🥇</span>{/if}
        <span class="total num">{f.total}</span>
      </li>
    {/each}
  </ol>
{/snippet}

<div class="page-head no-print">
  <div>
    <h2>Champions Sheet</h2>
    <div class="lede">Final standings + podiums for the announcer — always visible here, even while the public board stays in suspense.</div>
  </div>
  <div class="head-actions">
    {#if mode !== 'live'}
      <span class="mode-chip {mode}">{mode === 'suspense' ? '⏸ Public board hidden' : '🏆 Champions revealed'}</span>
    {/if}
    <button class="btn btn-primary" onclick={() => window.print()}>🖨 Print</button>
  </div>
</div>

{#if !std || !scored}
  <div class="card"><div class="empty-state">No committed results yet — the champions sheet fills in as the tent commits results.</div></div>
{:else}
  <div class="sheet">
    <div class="print-title">🏆 MGS Sports Day {seasonName} — Final Standings</div>

    <!-- Whole school -->
    <section class="card block school">
      <header class="b-head">
        <span class="b-title">🏆 Whole School</span>
        <span class="b-champ">Champions: <b>{schoolSorted[0]?.label}</b>{#if leadMargin > 0} · by {leadMargin} pt{leadMargin === 1 ? '' : 's'}{/if}</span>
      </header>
      {@render podiumRow(schoolSorted)}
      {@render resultTable(schoolSorted, 'schoolPos')}
    </section>

    <!-- Year groups -->
    <div class="year-grid">
      {#each YEAR_ORDER as year (year)}
        {@const yf = yearForms(year)}
        {#if yf.length}
          <section class="card block" style="--accent:{YEAR_META[year]?.colour ?? '#888'}">
            <header class="b-head">
              <span class="b-title yr">{yearLabel(year)}</span>
              <span class="b-champ">Champions: <b>{yf[0]?.label}</b></span>
            </header>
            {@render podiumRow(yf)}
            {@render resultTable(yf, 'yearPos')}
          </section>
        {/if}
      {/each}
    </div>

    <!-- Records broken -->
    {#if broken.length}
      <section class="card block records">
        <header class="b-head"><span class="b-title">🔥 Records {broken.length === 1 ? 'broken' : 'broken/equalled'} today</span></header>
        <ul class="rec-list">
          {#each broken as b (b.recordId + b.score)}
            <li>
              <span class="rec-badge {b.kind}">{b.kind === 'beat' ? '🔥 New' : '🟰 Equal'}</span>
              <span class="rec-ev">{yearLabel(b.year)} {eventLabel(b.event)}</span>
              <span class="rec-mark">{formatMark(b.score, b.units, 2)}</span>
              <span class="rec-by">{formLabel(b.formId)}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
{/if}

<style>
  .head-actions { display: flex; align-items: center; gap: 0.6rem; }
  .mode-chip { font-size: 0.82rem; font-weight: 800; padding: 0.3rem 0.7rem; border-radius: var(--r-pill); white-space: nowrap; }
  .mode-chip.suspense { background: var(--warn-soft); color: var(--warn); }
  .mode-chip.revealed { background: var(--gold-soft); color: #7a5c00; }

  .print-title { display: none; }

  .block { padding: 0.8rem 0.9rem; margin-bottom: 1rem; }
  .block.school { border-left: 4px solid var(--gold); }
  .b-head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.6rem; margin-bottom: 0.6rem; flex-wrap: wrap; }
  .b-title { font-weight: 800; font-size: 1.1rem; }
  .b-title.yr { color: color-mix(in srgb, var(--accent) 80%, var(--text)); }
  .b-champ { font-size: 0.9rem; color: var(--text-muted); }

  .year-grid { display: grid; gap: 1rem; grid-template-columns: 1fr; }
  @media (min-width: 780px) { .year-grid { grid-template-columns: 1fr 1fr; } }

  /* Podium — 2 · 1 · 3 */
  .podium { display: grid; grid-template-columns: 1fr 1.15fr 1fr; align-items: end; gap: 0.5rem; margin-bottom: 0.7rem; }
  .pslot { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; min-width: 0; }
  .pmedal { font-size: 1.2rem; }
  .pchip {
    font-weight: 900; font-size: 1rem; padding: 0.2em 0.55em; border-radius: var(--r-sm);
    max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; box-shadow: var(--shadow-sm);
  }
  .pblock {
    width: 100%; text-align: center; border: 1px solid var(--border); border-bottom: 0;
    border-radius: var(--r-md) var(--r-md) 0 0; background: var(--surface-2); padding: 0.4rem 0.2rem 0.5rem;
    display: flex; flex-direction: column; line-height: 1;
  }
  .ptotal { font-weight: 900; font-size: 1.5rem; }
  .ppts { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
  .p1 .pblock { padding-top: 1rem; background: color-mix(in srgb, var(--gold) 20%, var(--surface-2)); border-color: color-mix(in srgb, var(--gold) 50%, transparent); }
  .p1 .ptotal { color: #7a5c00; }

  .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.1rem; }
  .rows li { display: flex; align-items: center; gap: 0.55rem; padding: 0.34rem 0.5rem; border-radius: var(--r-sm); font-size: 0.98rem; }
  .rows li.top { background: color-mix(in srgb, var(--gold) 10%, transparent); }
  .pos { width: 1.9rem; text-align: center; font-weight: 800; color: var(--text-muted); font-size: 1rem; }
  .chip { font-weight: 800; font-size: 0.92rem; padding: 0.18em 0.55em; border-radius: var(--r-sm); box-shadow: var(--shadow-sm); }
  .grow { flex: 1; }
  .firsts { font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; }
  .total { font-weight: 800; font-size: 1.1rem; min-width: 2.4rem; text-align: right; }

  .records .rec-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
  .rec-list li { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; font-size: 0.95rem; }
  .rec-badge { font-size: 0.74rem; font-weight: 800; padding: 0.2rem 0.5rem; border-radius: var(--r-pill); white-space: nowrap; }
  .rec-badge.beat { background: var(--gold); color: #3a2c00; }
  .rec-badge.equal { background: var(--brand-soft); color: var(--brand-strong); }
  .rec-ev { font-weight: 700; }
  .rec-mark { font-weight: 800; }
  .rec-by { color: var(--text-muted); }
  .empty-state { text-align: center; color: var(--text-muted); padding: 2.5rem 1rem; }

  /* Print: drop the console chrome and hand a clean sheet to the announcer / printer. */
  @media print {
    :global(.sidebar),
    :global(.topbar-mobile),
    :global(.mobile-drawer),
    :global(.status-strip),
    :global(.dryrun-banner) { display: none !important; }
    :global(.app) { display: block !important; }
    :global(.main) { padding: 0 !important; }
    .no-print { display: none !important; }
    .print-title { display: block; font-size: 1.4rem; font-weight: 900; margin: 0 0 0.8rem; }
    .year-grid { grid-template-columns: 1fr 1fr; }
    .block { break-inside: avoid; box-shadow: none; border: 1px solid #ccc; }
    :global(*) { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
