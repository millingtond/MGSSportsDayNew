<script lang="ts">
  import type { Standings, EventDef } from '@mgs/config-types';
  import { contrastText, initials, formatMark } from '@mgs/ui';
  import { YEAR_ORDER, YEAR_META, contestResults, scoreboardContestId, contestWinnerName, eventMark } from '../season.svelte';

  let { standings, event }: { standings: Standings; event: EventDef } = $props();

  function rows(year: string, s: string) {
    return contestResults(standings, scoreboardContestId(year, event.id, s));
  }
  function yearHasResults(year: string): boolean {
    return event.strings.some((s) => rows(year, s).length > 0);
  }
  function stringLabel(s: string): string {
    if (event.isRelay) return 'Final';
    if (event.strings.length === 1) return 'Result';
    return `${s} race`;
  }
  const anyResults = $derived(YEAR_ORDER.some((y) => yearHasResults(y)));
</script>

{#if anyResults}
  <div class="ev-grid">
    {#each YEAR_ORDER as year}
      {#if yearHasResults(year)}
        {@const mark = eventMark(year, event.id)}
        <section class="card ev-year" style="--accent:{YEAR_META[year]?.colour ?? '#888'}">
          <header class="ey-head">
            <span>{YEAR_META[year]?.label ?? year}</span>
            {#if mark}
              <span class="ey-mark">🏅 {formatMark(mark.score, mark.units)}{#if mark.formId && standings.forms[mark.formId]} · {standings.forms[mark.formId].code}{/if}</span>
            {/if}
          </header>
          <div class="strings">
            {#each event.strings as s}
              {@const cid = scoreboardContestId(year, event.id, s)}
              {@const rs = contestResults(standings, cid)}
              {@const wn = contestWinnerName(cid)}
              {#if rs.length}
                <div class="str">
                  <div class="str-head">{stringLabel(s)}</div>
                  <ol>
                    {#each rs as r (r.form.formId)}
                      <li class:top={r.position === 1}>
                        <span class="pos">
                          {#if r.position <= 3}<span class="medal m{r.position}">{r.position}</span>{:else}{r.position}{/if}
                        </span>
                        <span class="chip" style="background:{r.form.colour}; color:{contrastText(r.form.colour)}">{r.form.label}</span>
                        {#if r.position === 1 && wn && wn.formId === r.form.formId}<span class="ath" title={wn.name}>{initials(wn.name)}</span>{/if}
                        <span class="grow"></span>
                        <span class="pts num">{r.points}</span>
                      </li>
                    {/each}
                  </ol>
                </div>
              {/if}
            {/each}
          </div>
        </section>
      {/if}
    {/each}
  </div>
{:else}
  <div class="empty-state">No results for {event.label} yet — they'll appear here as the tent commits them.</div>
{/if}

<style>
  .ev-grid { display: grid; gap: clamp(0.75rem, 1.5vw, 1.2rem); grid-template-columns: 1fr; }
  @media (min-width: 720px) { .ev-grid { grid-template-columns: 1fr 1fr; } }
  .ev-year { padding: 0.6rem; }
  .ey-head {
    display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;
    font-weight: 800; font-size: 1.05rem; padding: 0.3rem 0.5rem 0.6rem;
    color: color-mix(in srgb, var(--accent) 85%, white);
    border-bottom: 1px solid var(--border); margin-bottom: 0.4rem;
  }
  .ey-mark {
    font-size: 0.82rem; font-weight: 800; color: #7a5c00;
    background: color-mix(in srgb, var(--gold) 22%, transparent);
    padding: 0.15rem 0.5rem; border-radius: 999px; white-space: nowrap;
  }
  .ath {
    font-size: 0.76rem; font-weight: 800; color: var(--text-muted); letter-spacing: 0.04em; white-space: nowrap;
    background: color-mix(in srgb, var(--text-muted) 14%, transparent); padding: 0.08rem 0.4rem; border-radius: var(--r-sm);
  }
  .strings { display: flex; flex-direction: column; gap: 0.6rem; }
  .str-head { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); padding: 0 0.5rem 0.25rem; }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.12rem; }
  li { display: flex; align-items: center; gap: 0.5rem; padding: 0.32rem 0.5rem; border-radius: var(--r-sm); }
  li.top { background: color-mix(in srgb, var(--gold) 18%, transparent); }
  .pos { width: 1.7rem; text-align: center; font-weight: 800; color: var(--text-muted); }
  .chip { font-weight: 800; font-size: 0.88rem; padding: 0.2em 0.55em; border-radius: var(--r-sm); max-width: 8rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .grow { flex: 1; }
  .pts { font-weight: 800; color: var(--text); }
  .empty-state { text-align: center; color: var(--text-muted); padding: 2.5rem 1rem; }
</style>
