<script lang="ts">
  import type { FormStanding } from '@mgs/config-types';
  import { contrastText } from '@mgs/ui';
  import AnimatedNumber from './AnimatedNumber.svelte';

  // forms must be the top-3, already sorted (index 0 = champion).
  let { forms, lead = 0 }: { forms: FormStanding[]; lead?: number } = $props();

  // Visual order is 2nd · 1st · 3rd, so the champion stands tallest in the centre.
  const slots = $derived(
    [
      { form: forms[1], place: 2 },
      { form: forms[0], place: 1 },
      { form: forms[2], place: 3 },
    ].filter((s): s is { form: FormStanding; place: number } => !!s.form),
  );

  function tally(f: FormStanding): string {
    const c = f.counts ?? { firsts: 0, seconds: 0, thirds: 0 };
    const bits: string[] = [];
    if (c.firsts) bits.push(`🥇${c.firsts}`);
    if (c.seconds) bits.push(`🥈${c.seconds}`);
    if (c.thirds) bits.push(`🥉${c.thirds}`);
    return bits.join('  ');
  }
</script>

<div class="podium" aria-label="Top three forms">
  {#each slots as s (s.form.formId)}
    <div class="slot p{s.place}" class:champ={s.place === 1}>
      <div class="medal m{s.place}">{s.place}</div>
      <div class="chip" style="background:{s.form.colour}; color:{contrastText(s.form.colour)}">{s.form.code}</div>
      <div class="name">{s.form.label}</div>
      {#if tally(s.form)}<div class="tally">{tally(s.form)}</div>{/if}
      <div class="block">
        <div class="pts num"><AnimatedNumber value={s.form.total} /></div>
        <div class="pts-label">pts</div>
        {#if s.place === 1 && lead > 0}<div class="lead">leading by {lead}</div>{/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .podium {
    display: grid;
    grid-template-columns: 1fr 1.12fr 1fr;
    align-items: end;
    gap: clamp(0.4rem, 1.2vw, 0.9rem);
    padding: 0.4rem 0.2rem 0.2rem;
  }
  .slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    text-align: center;
    min-width: 0;
    width: 100%;
  }
  .slot .medal { font-size: clamp(1rem, 2.4vw, 1.5rem); }
  .chip {
    font-weight: 900;
    font-size: clamp(0.95rem, 2.4vw, 1.5rem);
    padding: 0.2em 0.5em;
    border-radius: var(--r-md);
    box-shadow: inset 0 0 0 1.5px rgba(0, 0, 0, 0.14), var(--shadow-sm);
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .name {
    font-weight: 800;
    font-size: clamp(0.8rem, 1.8vw, 1.1rem);
    line-height: 1.1;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .tally { font-size: clamp(0.7rem, 1.5vw, 0.9rem); letter-spacing: 0.02em; }
  .block {
    width: 100%;
    border-radius: var(--r-lg) var(--r-lg) 0 0;
    background: linear-gradient(180deg, var(--surface-3), var(--surface-2));
    border: 1px solid var(--border);
    border-bottom: 0;
    padding: 0.5rem 0.3rem 0.6rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.05rem;
  }
  .pts { font-weight: 900; font-size: clamp(1.5rem, 4vw, 2.8rem); line-height: 1; }
  .pts-label { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
  .lead {
    margin-top: 0.2rem;
    font-size: 0.66rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #2a1c00;
    background: var(--gold);
    padding: 0.12rem 0.45rem;
    border-radius: var(--r-pill);
  }

  /* Champion: taller block, gold frame, glow. */
  .p1 .block {
    background: linear-gradient(180deg, color-mix(in srgb, var(--gold) 30%, var(--surface-2)), color-mix(in srgb, var(--gold) 12%, var(--surface-2)));
    border-color: color-mix(in srgb, var(--gold) 55%, transparent);
    box-shadow: 0 -6px 26px color-mix(in srgb, var(--gold) 22%, transparent);
    padding-top: 1.4rem;
    padding-bottom: 0.9rem;
  }
  .p1 .pts { color: var(--gold); text-shadow: 0 0 22px color-mix(in srgb, var(--gold) 45%, transparent); }
  .p2 .block { padding-top: 0.9rem; }
  .p3 .block { padding-top: 0.6rem; }
</style>
