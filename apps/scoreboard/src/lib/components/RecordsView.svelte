<script lang="ts">
  import type { Standings, RecordDoc } from '@mgs/config-types';
  import { contrastText, formatMark } from '@mgs/ui';
  import { season, YEAR_ORDER, YEAR_META } from '../season.svelte';

  let { standings }: { standings: Standings } = $props();

  const eventLabel = (id: string) => season.events.find((e) => e.id === id)?.label ?? id;
  const eventOrder = (id: string) => season.events.find((e) => e.id === id)?.order ?? 99;

  function recordsForYear(year: string): RecordDoc[] {
    return season.records.filter((r) => r.year === year).sort((a, b) => eventOrder(a.event) - eventOrder(b.event));
  }

  // Has this year's best beaten / equalled the standing record? (lower is better for times.)
  function kind(r: RecordDoc): 'none' | 'equal' | 'beat' {
    if (r.currentScore == null) return 'none';
    if (r.standingScore == null) return 'beat';
    if (r.currentScore === r.standingScore) return 'equal';
    const better = r.units === 'second' ? r.currentScore < r.standingScore : r.currentScore > r.standingScore;
    return better ? 'beat' : 'none';
  }

  const anyRecords = $derived(season.records.length > 0);
</script>

{#if anyRecords}
  <div class="rec-head-note">🏆 School records — beat one today and it lights up the board.</div>
  <div class="rec-grid">
    {#each YEAR_ORDER as year (year)}
      {@const recs = recordsForYear(year)}
      {#if recs.length}
        <section class="card rec-year" style="--accent:{YEAR_META[year]?.colour ?? '#888'}">
          <header class="ry-head">{YEAR_META[year]?.label ?? year}</header>
          <div class="rec-rows">
            {#each recs as r (r.id)}
              {@const k = kind(r)}
              {@const holder = r.currentForm ? standings.forms[r.currentForm] : null}
              <div class="rec-row" class:beat={k === 'beat'} class:equal={k === 'equal'}>
                <div class="rr-event">{eventLabel(r.event)}</div>
                <div class="rr-standing">
                  {#if r.standingScore != null}
                    <b class="rr-mark">{formatMark(r.standingScore, r.units)}</b>
                    {#if r.standingHolder}<span class="rr-holder">{r.standingHolder}</span>{/if}
                    {#if r.standingYear}<span class="rr-year">'{String(r.standingYear).slice(-2)}</span>{/if}
                  {:else}
                    <span class="rr-none">record up for grabs</span>
                  {/if}
                </div>
                <div class="rr-current">
                  {#if k === 'beat'}
                    <span class="badge beat">🔥 {formatMark(r.currentScore, r.units)}{#if holder} · {holder.code}{/if}</span>
                  {:else if k === 'equal'}
                    <span class="badge equal">🟰 {formatMark(r.currentScore, r.units)}{#if holder} · {holder.code}{/if}</span>
                  {:else if r.currentScore != null}
                    <span class="rr-best">best {formatMark(r.currentScore, r.units)}{#if holder} · {holder.code}{/if}</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    {/each}
  </div>
{:else}
  <div class="empty-state">Records will appear here.</div>
{/if}

<style>
  .rec-head-note { font-size: 0.95rem; color: var(--text-muted); font-weight: 700; margin-bottom: 0.8rem; }
  .rec-grid { display: grid; gap: clamp(0.75rem, 1.5vw, 1.2rem); grid-template-columns: 1fr; }
  @media (min-width: 720px) { .rec-grid { grid-template-columns: 1fr 1fr; } }
  .rec-year { padding: 0.6rem; }
  .ry-head {
    font-weight: 800; font-size: 1.05rem; padding: 0.3rem 0.5rem 0.6rem;
    color: color-mix(in srgb, var(--accent) 85%, white);
    border-bottom: 1px solid var(--border); margin-bottom: 0.4rem;
  }
  .rec-rows { display: flex; flex-direction: column; gap: 0.15rem; }
  .rec-row {
    display: grid; grid-template-columns: minmax(6rem, 1.1fr) minmax(6rem, 1.2fr) auto;
    align-items: center; gap: 0.5rem; padding: 0.38rem 0.5rem; border-radius: var(--r-sm);
  }
  .rec-row.beat { background: color-mix(in srgb, var(--gold) 20%, transparent); }
  .rec-row.equal { background: color-mix(in srgb, var(--brand) 12%, transparent); }
  .rr-event { font-weight: 800; font-size: 0.92rem; }
  .rr-standing { font-size: 0.86rem; display: flex; align-items: baseline; gap: 0.4rem; flex-wrap: wrap; min-width: 0; }
  .rr-mark { font-size: 0.98rem; }
  .rr-holder { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 8rem; }
  .rr-year { color: var(--text-faint); font-size: 0.78rem; }
  .rr-none { color: var(--text-faint); font-style: italic; font-size: 0.82rem; }
  .rr-current { justify-self: end; text-align: right; }
  .rr-best { font-size: 0.78rem; color: var(--text-muted); white-space: nowrap; }
  .badge { font-size: 0.76rem; font-weight: 800; padding: 0.2rem 0.5rem; border-radius: var(--r-pill); white-space: nowrap; }
  .badge.beat { background: var(--gold); color: #3a2c00; }
  .badge.equal { background: var(--brand-soft, color-mix(in srgb, var(--brand) 18%, transparent)); color: var(--brand); }
  .empty-state { text-align: center; color: var(--text-muted); padding: 2.5rem 1rem; }
</style>
