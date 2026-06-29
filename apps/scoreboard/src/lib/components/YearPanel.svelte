<script lang="ts">
  import { flip } from 'svelte/animate';
  import type { FormStanding } from '@mgs/config-types';
  import { sortByPos } from '@mgs/ui';
  import LeaderRow from './LeaderRow.svelte';

  let {
    label,
    colour,
    forms,
  }: { label: string; colour: string; forms: FormStanding[] } = $props();

  let sorted = $derived(sortByPos(forms, 'yearPos'));
  let leader = $derived(sorted[0]);
  let anyPoints = $derived(sorted.some((f) => f.total > 0));
  let lead = $derived(Math.max(0, (sorted[0]?.total ?? 0) - (sorted[1]?.total ?? 0)));
</script>

<section class="card year-panel" style="--accent:{colour}">
  <header>
    <span class="yr-badge">{label}</span>
    {#if leader && anyPoints}
      <span class="leader">Leading&nbsp;<b>{leader.label}</b>{#if lead > 0}<span class="by">+{lead}</span>{/if}</span>
    {:else}
      <span class="leader muted">No results yet</span>
    {/if}
  </header>
  <div class="rows">
    {#each sorted as f (f.formId)}
      <div animate:flip={{ duration: 600 }}>
        <LeaderRow place={f.yearPos} form={f} variant="year" accent={colour} lead={f.yearPos === 1 ? lead : 0} />
      </div>
    {/each}
  </div>
</section>

<style>
  .year-panel {
    padding: 0.5rem;
    overflow: hidden;
    border-top: 3px solid color-mix(in srgb, var(--accent) 75%, transparent);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--accent) 7%, transparent), transparent 38%),
      var(--surface);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.6rem 0.7rem;
    border-bottom: 1px solid var(--border);
    margin-bottom: 0.4rem;
  }
  .yr-badge {
    font-weight: 800;
    font-size: 1.02rem;
    padding: 0.3rem 0.7rem;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--accent) 24%, transparent);
    color: color-mix(in srgb, var(--accent) 82%, white);
    border: 1px solid color-mix(in srgb, var(--accent) 42%, transparent);
  }
  .leader { font-size: 0.88rem; color: var(--text-muted); display: inline-flex; align-items: center; gap: 0.4rem; }
  .leader b { color: var(--text); }
  .by {
    font-weight: 800;
    font-size: 0.78rem;
    color: color-mix(in srgb, var(--accent) 85%, white);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    padding: 0.1rem 0.4rem;
    border-radius: var(--r-pill);
  }
</style>
