<script lang="ts">
  import { data } from '$lib/data.svelte';
  import { sortByPos, contrastText } from '@mgs/ui';
  import { YEAR_ORDER, YEAR_META, yearLabel } from '$lib/helpers';
  import type { FormStanding } from '@mgs/config-types';

  const std = $derived(data.standings);
  const allForms = $derived(std ? Object.values(std.forms) : []);
  const schoolSorted = $derived(sortByPos(allForms, 'schoolPos'));
  const leadMargin = $derived(Math.max(0, (schoolSorted[0]?.total ?? 0) - (schoolSorted[1]?.total ?? 0)));
  const mode = $derived(data.control?.mode ?? 'live');

  function yearForms(year: string): FormStanding[] {
    return sortByPos(
      allForms.filter((f) => f.year === year),
      'yearPos',
    );
  }
  const medal = ['🥇', '🥈', '🥉'];
</script>

<div class="page-head">
  <div>
    <h2>League Tables</h2>
    <div class="lede">The live standings for the announcer — always visible here, even while the public board is in suspense.</div>
  </div>
  {#if mode !== 'live'}
    <span class="mode-chip {mode}">{mode === 'suspense' ? '⏸ Public board hidden' : '🏆 Champions revealed'}</span>
  {/if}
</div>

{#if !std}
  <div class="card"><div class="empty-state">Waiting for the first committed result…</div></div>
{:else}
  <!-- Whole school -->
  <section class="card table-card school">
    <header class="tc-head">
      <span class="tc-title">🏆 Whole School</span>
      {#if schoolSorted[0] && (schoolSorted[0].total ?? 0) > 0}
        <span class="tc-lead">Leader: <b>{schoolSorted[0].label}</b>{#if leadMargin > 0} · +{leadMargin} pt{leadMargin === 1 ? '' : 's'}{/if}</span>
      {/if}
    </header>
    <ol class="rows">
      {#each schoolSorted as f (f.formId)}
        <li class:top={f.schoolPos <= 3}>
          <span class="pos">{f.schoolPos <= 3 ? medal[f.schoolPos - 1] : f.schoolPos}</span>
          <span class="chip" style="background:{f.colour}; color:{contrastText(f.colour)}">{f.label}</span>
          <span class="grow"></span>
          <span class="firsts">{f.counts.firsts}🥇</span>
          <span class="total num">{f.total}</span>
        </li>
      {/each}
    </ol>
  </section>

  <!-- Year groups -->
  <div class="year-grid">
    {#each YEAR_ORDER as year (year)}
      <section class="card table-card" style="--accent:{YEAR_META[year]?.colour ?? '#888'}">
        <header class="tc-head">
          <span class="tc-title yr">{yearLabel(year)}</span>
        </header>
        <ol class="rows">
          {#each yearForms(year) as f (f.formId)}
            <li class:top={f.yearPos <= 3}>
              <span class="pos">{f.yearPos <= 3 ? medal[f.yearPos - 1] : f.yearPos}</span>
              <span class="chip" style="background:{f.colour}; color:{contrastText(f.colour)}">{f.label}</span>
              <span class="grow"></span>
              <span class="total num">{f.total}</span>
            </li>
          {/each}
        </ol>
      </section>
    {/each}
  </div>
{/if}

<style>
  .mode-chip { font-size: 0.82rem; font-weight: 800; padding: 0.3rem 0.7rem; border-radius: var(--r-pill); white-space: nowrap; }
  .mode-chip.suspense { background: var(--warn-soft); color: var(--warn); }
  .mode-chip.revealed { background: var(--gold-soft); color: #7a5c00; }

  .table-card { padding: 0.8rem 0.9rem; margin-bottom: 1rem; }
  .table-card.school { border-left: 4px solid var(--gold); }
  .tc-head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.6rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
  .tc-title { font-weight: 800; font-size: 1.1rem; }
  .tc-title.yr { color: color-mix(in srgb, var(--accent) 80%, var(--text)); }
  .tc-lead { font-size: 0.86rem; color: var(--text-muted); }

  .year-grid { display: grid; gap: 1rem; grid-template-columns: 1fr; }
  @media (min-width: 760px) { .year-grid { grid-template-columns: 1fr 1fr; } }

  .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.1rem; }
  .rows li {
    display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0.55rem; border-radius: var(--r-sm);
    font-size: 1rem;
  }
  .rows li.top { background: color-mix(in srgb, var(--gold) 12%, transparent); }
  .pos { width: 2rem; text-align: center; font-weight: 800; color: var(--text-muted); font-size: 1.05rem; }
  .chip { font-weight: 800; font-size: 0.95rem; padding: 0.2em 0.6em; border-radius: var(--r-sm); box-shadow: var(--shadow-sm); }
  .grow { flex: 1; }
  .firsts { font-size: 0.82rem; color: var(--text-muted); white-space: nowrap; }
  .total { font-weight: 800; font-size: 1.15rem; min-width: 2.5rem; text-align: right; }
  .empty-state { text-align: center; color: var(--text-muted); padding: 2.5rem 1rem; }
</style>
