<script lang="ts">
  import type { Standings } from '@mgs/config-types';
  import { YEAR_ORDER, YEAR_META } from '../season.svelte';

  let { standings }: { standings: Standings } = $props();

  const byYear = $derived(standings.athletes?.byYear ?? {});
  const anyData = $derived(YEAR_ORDER.some((y) => (byYear[y]?.length ?? 0) > 0));
</script>

{#if anyData}
  <div class="ind-grid">
    {#each YEAR_ORDER as year}
      {@const rows = byYear[year] ?? []}
      {#if rows.length}
        <section class="card ind-year" style="--accent:{YEAR_META[year]?.colour ?? '#888'}">
          <header class="iy-head">{YEAR_META[year]?.label ?? year} · Victor Ludorum</header>
          <ol>
            {#each rows as a (a.name)}
              <li class:top={a.pos === 1}>
                <span class="pos">
                  {#if a.pos <= 3}<span class="medal m{a.pos}">{a.pos}</span>{:else}{a.pos}{/if}
                </span>
                <span class="name">{a.name}</span>
                {#if a.firsts > 0}<span class="firsts">🥇{a.firsts}</span>{/if}
                <span class="grow"></span>
                <span class="pts num">{a.total}</span>
              </li>
            {/each}
          </ol>
        </section>
      {/if}
    {/each}
  </div>
{:else}
  <div class="empty-state">
    Individual champions appear here once athlete names are added to results (in the results tent).
  </div>
{/if}

<style>
  .ind-grid { display: grid; gap: clamp(0.75rem, 1.5vw, 1.2rem); grid-template-columns: 1fr; }
  @media (min-width: 720px) { .ind-grid { grid-template-columns: 1fr 1fr; } }
  .ind-year { padding: 0.6rem; border-top: 3px solid color-mix(in srgb, var(--accent) 75%, transparent); }
  .iy-head {
    font-weight: 800; font-size: 1.05rem; padding: 0.3rem 0.5rem 0.6rem;
    color: color-mix(in srgb, var(--accent) 85%, white);
    border-bottom: 1px solid var(--border); margin-bottom: 0.3rem;
  }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.12rem; }
  li { display: flex; align-items: center; gap: 0.6rem; padding: 0.36rem 0.5rem; border-radius: var(--r-sm); }
  li.top { background: color-mix(in srgb, var(--gold) 16%, transparent); }
  .pos { width: 1.8rem; text-align: center; font-weight: 800; color: var(--text-muted); display: grid; place-items: center; }
  .name { font-weight: 700; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .firsts { font-size: 0.8rem; flex: none; }
  .grow { flex: 1; }
  .pts { font-weight: 900; color: var(--text); min-width: 2.2rem; text-align: right; }
  .empty-state { text-align: center; color: var(--text-muted); padding: 2.5rem 1rem; }
</style>
