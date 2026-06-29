<script lang="ts">
  import type { FormStanding } from '@mgs/config-types';
  import { contrastText, type Delta } from '@mgs/ui';
  import AnimatedNumber from './AnimatedNumber.svelte';

  let {
    place,
    form,
    delta = 'same',
    variant = 'school',
    accent = 'var(--gold)',
    lead = 0,
  }: {
    place: number;
    form: FormStanding;
    delta?: Delta;
    variant?: 'school' | 'year';
    /** Highlight colour for the #1 row — gold for the school champion, the year colour per year. */
    accent?: string;
    /** Points ahead of the next form (shown only on the #1 row). */
    lead?: number;
  } = $props();

  let prev = form.total;
  let bump = $state(false);
  // The points delta of the most recent change, shown as a floating "+N" so spectators at the
  // back see HOW MANY points just landed (a +31 vs a +10). Re-keyed by popSeq to replay.
  let pop = $state<number | null>(null);
  let popSeq = $state(0);
  $effect(() => {
    const t = form.total;
    if (t !== prev) {
      const d = t - prev;
      prev = t;
      bump = true;
      const bid = setTimeout(() => (bump = false), 1100);
      let pid: ReturnType<typeof setTimeout> | undefined;
      if (d !== 0) {
        pop = d;
        popSeq++;
        pid = setTimeout(() => (pop = null), 1500);
      }
      return () => {
        clearTimeout(bid);
        if (pid) clearTimeout(pid);
      };
    }
  });
</script>

<div class="row" class:bump class:top={place === 1} class:podium={place <= 3} style="--row-accent:{accent}">
  <div class="place num">
    {#if place <= 3}<span class="medal m{place}">{place}</span>{:else}{place}{/if}
  </div>
  <div class="chip form-chip" style="background:{form.colour}; color:{contrastText(form.colour)}">{form.code}</div>
  <div class="who">
    <span class="label">{form.label}</span>
    <span class="sub">
      {#if variant === 'school'}<span class="yr">{form.year.replace('Y', 'Year ')}</span>{/if}
      {#if place === 1 && lead > 0}<span class="lead">▲ leading by {lead}</span>{/if}
    </span>
  </div>
  {#if variant === 'school'}
    <span class="delta {delta}" aria-hidden="true">
      {delta === 'up' ? '▲' : delta === 'down' ? '▼' : delta === 'new' ? '•' : '–'}
    </span>
  {/if}
  <div class="pts num">
    {#if pop != null}
      {#key popSeq}<span class="pop" class:neg={pop < 0} aria-hidden="true">{pop > 0 ? '+' : '−'}{Math.abs(pop)}</span>{/key}
    {/if}
    <AnimatedNumber value={form.total} />
  </div>
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: 2.4rem auto 1fr auto auto;
    align-items: center;
    gap: 0.7rem;
    padding: 0.5rem 0.7rem;
    border-radius: var(--r-md);
    transition: background var(--dur) var(--ease-out);
    position: relative;
  }
  .row.podium { background: var(--surface-2); }
  .row.top {
    background: linear-gradient(90deg, color-mix(in srgb, var(--row-accent) 26%, transparent), transparent 72%);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--row-accent) 42%, transparent);
  }
  .row.bump { animation: bump 1.1s var(--ease-out); }
  @keyframes bump {
    0% { background: color-mix(in srgb, var(--brand) 40%, transparent); transform: scale(1.012); }
    100% { transform: scale(1); }
  }
  .place {
    font-weight: 800;
    font-size: 1.1rem;
    text-align: center;
    color: var(--text-muted);
    display: grid;
    place-items: center;
  }
  .top .place,
  .podium .place { color: var(--text); }
  .form-chip {
    min-width: 2.5rem;
    height: 2.15rem;
    padding: 0 0.5rem;
    font-size: 0.95rem;
    box-shadow: inset 0 0 0 1.5px rgba(0, 0, 0, 0.14), var(--shadow-sm);
    max-width: 7rem;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .who { display: flex; flex-direction: column; min-width: 0; gap: 0.05rem; overflow: hidden; }
  .label {
    font-weight: 800;
    font-size: 1.02rem;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
  .yr { font-size: 0.74rem; color: var(--text-muted); font-weight: 600; }
  .lead {
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--row-accent) 85%, white);
    white-space: nowrap;
  }
  .delta { font-size: 0.9rem; width: 1.1rem; text-align: center; }
  .delta.up { color: var(--up); }
  .delta.down { color: var(--down); }
  .delta.new { color: var(--gold); }
  .delta.same,
  .delta.flat { color: var(--text-faint); }
  .pts {
    font-weight: 900;
    font-size: 1.55rem;
    min-width: 3rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
    position: relative;
  }
  /* Floating "+N" that rises and fades when the total changes. */
  .pop {
    position: absolute;
    right: 0;
    bottom: 100%;
    font-size: 1rem;
    font-weight: 900;
    color: var(--up);
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.45);
    pointer-events: none;
    white-space: nowrap;
    animation: pop-rise 1.4s var(--ease-out) forwards;
  }
  .pop.neg { color: var(--down); }
  @keyframes pop-rise {
    0% { opacity: 0; transform: translateY(0.3rem); }
    18% { opacity: 1; }
    100% { opacity: 0; transform: translateY(-1.3rem); }
  }
  @media (prefers-reduced-motion: reduce) {
    .pop { animation: none; opacity: 0; } /* no floaty badge when reduced motion is requested */
  }
  .top .pts {
    color: var(--row-accent);
    text-shadow: 0 0 18px color-mix(in srgb, var(--row-accent) 45%, transparent);
  }

  /* Smallest phones: reclaim width for the 1fr name column so it isn't crushed. */
  @media (max-width: 360px) {
    .row { gap: 0.4rem; padding: 0.5rem; grid-template-columns: 2rem auto 1fr auto auto; }
    .form-chip { min-width: 2.1rem; max-width: 4.5rem; padding: 0 0.35rem; }
    .delta { width: 0.9rem; }
    .pts { min-width: 2.4rem; font-size: 1.3rem; }
    .label { font-size: 0.95rem; }
    .lead { display: none; } /* the podium already shows the margin prominently */
  }
</style>
