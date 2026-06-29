<script lang="ts">
  import type { Standings } from '@mgs/config-types';
  import { sortByPos, contrastText } from '@mgs/ui';
  import { YEAR_ORDER, YEAR_META } from '../season.svelte';
  import Confetti from './Confetti.svelte';

  // scope null / 'all' / 'school' = full finale (every year + the overall champion).
  // A year id (e.g. 'Y9') = a staged reveal: years up to and including that one are shown,
  // the overall champion stays sealed until the finale.
  let { standings, scope = null }: { standings: Standings; scope?: string | null } = $props();

  const forms = $derived(Object.values(standings.forms));
  const champion = $derived(sortByPos(forms, 'schoolPos')[0]);
  const yearWinners = $derived(
    YEAR_ORDER.map((y) => ({
      year: y,
      meta: YEAR_META[y],
      form: sortByPos(
        forms.filter((f) => f.year === y),
        'yearPos',
      )[0],
    })),
  );
  const isFull = $derived(!scope || scope === 'all' || scope === 'school');
  // An unknown/typo'd scope fails SAFE — show all year winners (never a blank screen), with
  // the overall champion still sealed.
  const revealedThrough = $derived.by(() => {
    if (isFull) return YEAR_ORDER.length;
    const idx = YEAR_ORDER.indexOf(scope!);
    return idx < 0 ? YEAR_ORDER.length : idx + 1;
  });

  // Re-fire confetti each time a new stage is revealed (bigger burst for the finale).
  let cKey = $state(0);
  let lastScope: string | null | undefined = undefined;
  $effect(() => {
    if (scope !== lastScope) {
      lastScope = scope;
      cKey++;
    }
  });
</script>

<div class="reveal">
  {#key cKey}<Confetti count={isFull ? 240 : 130} />{/key}
  <p class="kicker">MGS Sports Day 2026 · Champions</p>

  {#if isFull && champion}
    <div class="champ">
      <div class="trophy">🏆</div>
      <div class="champ-chip" style="background:{champion.colour}; color:{contrastText(champion.colour)}">
        {champion.code}
      </div>
      <h1>{champion.label}</h1>
      <p class="champ-sub">Whole-School Champions · <b>{champion.total}</b> points</p>
    </div>
  {:else}
    <div class="champ sealed">
      <div class="trophy sealed-trophy">🏆</div>
      <h1 class="sealed-title">Overall Champions</h1>
      <p class="champ-sub">Revealed at the finale…</p>
    </div>
  {/if}

  <div class="year-winners">
    {#each yearWinners as yw, i (yw.year)}
      {#if i < revealedThrough && yw.form}
        <div class="yw revealed" style="--accent:{yw.meta?.colour}">
          <span class="yw-year">{yw.meta?.label}</span>
          <span class="yw-form">{yw.form.label}</span>
          <span class="yw-pts num">{yw.form.total} pts</span>
        </div>
      {:else}
        <div class="yw pending" style="--accent:{yw.meta?.colour}">
          <span class="yw-year">{yw.meta?.label}</span>
          <span class="yw-form q">?</span>
          <span class="yw-pts muted">up next…</span>
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .reveal {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 1.4rem;
    padding: max(2rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
      max(2rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
    position: relative;
  }
  .kicker {
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold);
    font-size: clamp(0.8rem, 2vw, 1.1rem);
    animation: fade-up 0.6s var(--ease-out) both;
  }
  .champ { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; animation: pop 0.7s var(--ease-spring) both 0.1s; }
  .trophy { font-size: clamp(4rem, min(13vw, 26vh), 8rem); filter: drop-shadow(0 12px 30px rgba(245, 179, 1, 0.4)); animation: float 3.5s ease-in-out infinite; }
  .sealed { opacity: 0.92; }
  .sealed-trophy { filter: grayscale(0.4) drop-shadow(0 12px 30px rgba(245, 179, 1, 0.18)); opacity: 0.7; }
  .sealed-title {
    font-size: clamp(2rem, min(8vw, 12vh), 5rem);
    color: var(--text-muted);
    letter-spacing: 0.02em;
  }
  .champ-chip {
    font-weight: 800;
    font-size: clamp(1.4rem, 4vw, 2.4rem);
    padding: 0.3rem 1rem;
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-lg);
  }
  .champ h1 {
    font-size: clamp(2.6rem, min(11vw, 16vh), 7rem);
    background: linear-gradient(92deg, #fff, var(--gold));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    max-width: 100%;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .champ-sub { font-size: clamp(1rem, 3vw, 1.5rem); color: var(--text-muted); }
  .champ-sub b { color: var(--text); }
  .year-winners {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.8rem;
    width: min(100%, 900px);
    animation: fade-up 0.7s var(--ease-out) both 0.35s;
  }
  .yw {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.9rem;
    border-radius: var(--r-lg);
    background: var(--surface-2);
    border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
    box-shadow: var(--shadow);
  }
  .yw.revealed { animation: pop 0.6s var(--ease-spring) both; }
  .yw.pending { opacity: 0.45; border-style: dashed; box-shadow: none; }
  .yw-year { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: color-mix(in srgb, var(--accent) 80%, white); }
  .yw-form { font-size: 1.5rem; font-weight: 850; }
  .yw-form.q { font-size: 1.5rem; font-weight: 850; color: var(--text-faint); }
  .yw-pts { color: var(--text-muted); font-weight: 600; }
  @keyframes pop { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }
  @keyframes fade-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-16px); } }

  /* Short landscape phones (~740x360): shrink the stack so the whole reveal fits without scrolling. */
  @media (max-height: 480px) {
    .reveal { gap: 0.6rem; padding: 0.75rem 1rem; }
    .champ { gap: 0.25rem; }
    .trophy { font-size: clamp(3rem, 18vh, 5rem); }
    .champ h1, .sealed-title { font-size: clamp(2rem, 14vh, 4rem); }
    .champ-chip { font-size: clamp(1.1rem, 6vh, 1.8rem); }
    .champ-sub { font-size: clamp(0.85rem, 4vh, 1.2rem); }
    .year-winners { gap: 0.5rem; }
    .yw { padding: 0.5rem; }
  }

  /* High-contrast: gradient-clipped title would vanish — fall back to a solid colour. */
  @media (forced-colors: active) {
    .champ h1 { -webkit-text-fill-color: CanvasText; color: CanvasText; background: none; }
  }
</style>
