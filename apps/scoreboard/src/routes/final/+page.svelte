<script lang="ts">
  import { onMount } from 'svelte';
  import { sortByPos, contrastText } from '@mgs/ui';
  import { season, startSeason, allForms, formsForYear, YEAR_ORDER, YEAR_META } from '$lib/season.svelte';
  import Crest from '$lib/components/Crest.svelte';
  import SuspenseScreen from '$lib/components/SuspenseScreen.svelte';

  onMount(() => startSeason());

  const std = $derived(season.standings);
  const mode = $derived(season.control?.mode ?? 'live');
  const overall = $derived(std ? sortByPos(allForms(std), 'schoolPos').slice(0, 3) : []);
  const hasResults = $derived((overall[0]?.total ?? 0) > 0);
  function yearPodium(y: string) {
    return std ? sortByPos(formsForYear(std, y), 'yearPos').slice(0, 3) : [];
  }
</script>

<svelte:head><title>Final Results — MGS Sports Day 2026</title></svelte:head>

{#if mode === 'suspense'}
  <SuspenseScreen message={season.control?.message} />
{:else}
  <div class="final">
    <header class="fh">
      <span class="mark"><Crest /></span>
      <div class="ht">
        <h1>Final Results</h1>
        <div class="sub">MGS Sports Day 2026{#if mode !== 'revealed' && hasResults} · provisional{/if}</div>
      </div>
      <button class="print" onclick={() => window.print()} title="Print this sheet">🖨 Print</button>
    </header>

    {#if !std || !season.ready}
      <div class="await">Loading…</div>
    {:else if !hasResults}
      <div class="await">Awaiting the first results…</div>
    {:else}
      <div class="years">
        {#each YEAR_ORDER as y (y)}
          {@const podium = yearPodium(y)}
          <section class="ybox" style="--c:{YEAR_META[y]?.colour ?? '#888'}">
            <h2>{YEAR_META[y]?.label ?? y}</h2>
            <ol>
              {#each podium as f, i (f.formId)}
                <li>
                  <span class="m m{i + 1}">{i + 1}</span>
                  <span class="chip" style="background:{f.colour}; color:{contrastText(f.colour)}">{f.label}</span>
                  <span class="pts">{f.total}<small>pts</small></span>
                </li>
              {/each}
              {#if !podium.length}<li class="none">—</li>{/if}
            </ol>
          </section>
        {/each}
      </div>

      <section class="overall">
        <h2>🏆 Overall — Whole-School Champions</h2>
        <ol>
          {#each overall as f, i (f.formId)}
            <li>
              <span class="m m{i + 1}">{i + 1}</span>
              <span class="chip" style="background:{f.colour}; color:{contrastText(f.colour)}">{f.label}</span>
              <span class="pts">{f.total}<small>pts</small></span>
            </li>
          {/each}
        </ol>
      </section>
    {/if}
  </div>
{/if}

<style>
  .final {
    min-height: 100dvh;
    background: var(--bg, #06101f);
    color: var(--text, #fff);
    padding: clamp(1rem, 3vw, 2.5rem);
    display: flex;
    flex-direction: column;
    gap: clamp(1rem, 2.5vh, 1.8rem);
  }
  .fh { display: flex; align-items: center; gap: 1rem; }
  .mark { width: clamp(2.6rem, 5vw, 4rem); height: clamp(2.6rem, 5vw, 4rem); display: inline-grid; place-items: center; flex: none; }
  .ht { flex: 1; min-width: 0; }
  .fh h1 { margin: 0; font-size: clamp(1.8rem, 5vw, 3.2rem); font-weight: 900; line-height: 1; }
  .fh .sub { font-size: clamp(0.9rem, 2vw, 1.3rem); color: var(--text-muted, #93a4bd); font-weight: 700; }
  .print {
    flex: none; appearance: none; cursor: pointer; font-weight: 800; font-size: 0.95rem;
    color: var(--text, #fff); background: var(--surface-2, #16243d); border: 1px solid var(--border, #2b3a55);
    padding: 0.5rem 0.9rem; border-radius: var(--r-pill, 99px);
  }
  .await { flex: 1; display: grid; place-items: center; font-size: 1.4rem; color: var(--text-muted, #93a4bd); }

  .years { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(0.8rem, 2vw, 1.4rem); flex: 1; }
  @media (max-width: 820px) { .years { grid-template-columns: 1fr; } }

  .ybox {
    background: var(--surface, #0d1830); border: 1px solid var(--border, #25344f);
    border-top: 5px solid var(--c); border-radius: var(--r-lg, 16px);
    padding: clamp(0.7rem, 1.6vw, 1.1rem) clamp(0.9rem, 2vw, 1.4rem); display: flex; flex-direction: column; gap: 0.4rem;
  }
  .ybox h2, .overall h2 { margin: 0 0 0.3rem; font-size: clamp(1.1rem, 2.4vw, 1.7rem); font-weight: 800; }
  .overall h2 { color: #f5b301; }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  li { display: flex; align-items: center; gap: clamp(0.6rem, 1.4vw, 1rem); }
  li.none { color: var(--text-muted, #93a4bd); }
  .m {
    flex: none; width: clamp(1.7rem, 3.4vw, 2.4rem); height: clamp(1.7rem, 3.4vw, 2.4rem); border-radius: 50%;
    display: inline-grid; place-items: center; font-weight: 900; font-size: clamp(0.9rem, 1.8vw, 1.25rem); color: #4a3000;
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.5);
  }
  .m1 { background: radial-gradient(circle at 35% 30%, #ffe9a0, #f3b203 72%); }
  .m2 { background: radial-gradient(circle at 35% 30%, #fbfdff, #b6c0cb 72%); color: #39414e; }
  .m3 { background: radial-gradient(circle at 35% 30%, #f7caa0, #c87d36 72%); color: #3a1e00; }
  .chip {
    font-weight: 900; font-size: clamp(1.1rem, 2.6vw, 1.9rem); padding: 0.12em 0.5em; border-radius: 0.4em;
    line-height: 1.15;
  }
  .pts { margin-left: auto; font-weight: 900; font-size: clamp(1.1rem, 2.6vw, 1.9rem); font-variant-numeric: tabular-nums; }
  .pts small { font-size: 0.5em; font-weight: 700; color: var(--text-muted, #93a4bd); margin-left: 0.2em; }

  .overall {
    background: var(--surface, #0d1830); border: 2px solid #f5b301; border-radius: var(--r-lg, 16px);
    padding: clamp(0.8rem, 1.8vw, 1.3rem) clamp(1rem, 2.2vw, 1.6rem);
  }
  .overall li { gap: clamp(0.8rem, 1.8vw, 1.3rem); }
  .overall .chip, .overall .pts { font-size: clamp(1.4rem, 3.4vw, 2.6rem); }
  .overall .m { width: clamp(2.1rem, 4.2vw, 3rem); height: clamp(2.1rem, 4.2vw, 3rem); font-size: clamp(1.1rem, 2.2vw, 1.6rem); }

  /* Print the auto-filled sheet cleanly (light) */
  @media print {
    .print { display: none; }
    .final { background: #fff; color: #0f172a; min-height: auto; }
    .fh .sub { color: #64748b; }
    .ybox, .overall { background: #fff; border-color: #cbd5e1; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .overall { border-color: #f5b301; }
    .pts small { color: #64748b; }
  }
</style>
