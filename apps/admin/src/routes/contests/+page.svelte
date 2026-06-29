<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { data } from '$lib/data.svelte';
  import { YEAR_ORDER, YEAR_META, yearLabel } from '$lib/helpers';
  import ContestEditor from '$lib/components/ContestEditor.svelte';
  import type { Contest } from '@mgs/config-types';

  let editingId = $state<string | null>(null);
  let yearFilter = $state<string>('all');
  let outstandingOnly = $state(false);
  let jump = $state('');

  // Deep-link: /contests?c=<contestId> (e.g. from the audit log) opens that contest's editor.
  onMount(() => {
    const c = $page.url.searchParams.get('c');
    if (c && /^[A-Za-z0-9_]+$/.test(c)) editingId = c;
  });

  // Index contests by year+event+string for fast cell lookup.
  const byKey = $derived.by(() => {
    const m = new Map<string, Contest>();
    for (const c of data.contests) m.set(`${c.year}__${c.event}__${c.string}`, c);
    return m;
  });

  const years = $derived(yearFilter === 'all' ? YEAR_ORDER : [yearFilter]);
  const totalOutstanding = $derived(data.contests.filter((c) => c.status === 'outstanding').length);

  // Events to show for a year, after the "find" box and the "outstanding only" filter.
  function eventsForYear(year: string) {
    const q = jump.trim().toLowerCase();
    return data.events.filter((ev) => {
      if (q && !ev.label.toLowerCase().includes(q)) return false;
      if (outstandingOnly) {
        return ev.strings.some((s) => byKey.get(`${year}__${ev.id}__${s}`)?.status === 'outstanding');
      }
      return true;
    });
  }

  function cellsFor(year: string, eventId: string, strings: string[]): { string: string; contest: Contest | undefined }[] {
    return strings.map((s) => ({ string: s, contest: byKey.get(`${year}__${eventId}__${s}`) }));
  }

  function yearProgress(year: string): { committed: number; total: number } {
    const list = data.contests.filter((c) => c.year === year);
    return { committed: list.filter((c) => c.status === 'committed').length, total: list.length };
  }

  function statusClass(c: Contest | undefined): string {
    if (!c) return 'missing';
    return c.status;
  }
</script>

<div class="page-head">
  <div>
    <h2>Contests</h2>
    <div class="lede">Tap any cell to enter or correct a finishing order. {data.contests.length} contests total.</div>
  </div>
  <div class="actions">
    <input class="jump" type="text" bind:value={jump} placeholder="Find event… e.g. 100m" aria-label="Find event" />
    <label class="oo-toggle" class:on={outstandingOnly}>
      <input type="checkbox" bind:checked={outstandingOnly} /> Outstanding only
      {#if totalOutstanding > 0}<span class="oo-count">{totalOutstanding}</span>{/if}
    </label>
    <select bind:value={yearFilter} aria-label="Filter by year" style="width:auto">
      <option value="all">All years</option>
      {#each YEAR_ORDER as y}
        <option value={y}>{yearLabel(y)}</option>
      {/each}
    </select>
  </div>
</div>

<div class="legend">
  <span><span class="status-dot" style="background:var(--up)"></span> Committed</span>
  <span><span class="status-dot" style="background:var(--text-faint)"></span> Outstanding</span>
  <span><span class="status-dot" style="background:var(--down)"></span> Void</span>
</div>

{#if data.events.length === 0}
  <div class="card"><div class="loading-state">Loading contests…</div></div>
{:else}
  {#each years as year (year)}
    {@const prog = yearProgress(year)}
    {@const evs = eventsForYear(year)}
    <section class="card year-block">
      <header class="yb-head" style="--accent:{YEAR_META[year]?.colour ?? '#888'}">
        <span class="yr-badge">{yearLabel(year)}</span>
        <span class="prog">{prog.committed} of {prog.total} committed</span>
      </header>
      <div class="matrix">
        {#if evs.length === 0}
          <div class="all-done">
            {#if jump.trim()}No events match your search.{:else if outstandingOnly}✓ Nothing outstanding in this year{:else}No events to show.{/if}
          </div>
        {:else}
          {#each evs as ev (ev.id)}
            <div class="ev-row">
              <div class="ev-name">{ev.label}</div>
              <div class="cells">
                {#each cellsFor(year, ev.id, ev.strings) as cell (cell.string)}
                  <button
                    class="cell {statusClass(cell.contest)}"
                    disabled={!cell.contest}
                    onclick={() => cell.contest && (editingId = cell.contest.id)}
                    title={cell.contest ? `${ev.label} String ${cell.string} — ${cell.contest.status}` : 'n/a'}
                  >
                    <span class="str">{cell.string}</span>
                    <span class="state">
                      {#if !cell.contest}—
                      {:else if cell.contest.status === 'committed'}✓ v{cell.contest.version}
                      {:else if cell.contest.status === 'void'}✕ void
                      {:else}…{/if}
                    </span>
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </section>
  {/each}
{/if}

<ContestEditor contestId={editingId} onclose={() => (editingId = null)} />

<style>
  .jump { width: auto; min-width: 11rem; }
  .oo-toggle { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.88rem; font-weight: 700; color: var(--text-muted); padding: 0.4rem 0.7rem; border: 1px solid var(--border-strong); border-radius: var(--r-md); cursor: pointer; user-select: none; white-space: nowrap; }
  .oo-toggle.on { background: var(--warn-soft); color: var(--warn); border-color: color-mix(in srgb, var(--warn) 40%, transparent); }
  .oo-toggle input { width: auto; min-height: 0; margin: 0; }
  .oo-count { font-size: 0.74rem; font-weight: 800; background: var(--warn); color: #fff; border-radius: var(--r-pill); padding: 0.05rem 0.45rem; }
  .all-done { color: var(--text-muted); font-weight: 600; padding: 0.4rem 0.2rem; }
  .legend { display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.82rem; color: var(--text-muted); }
  .legend span { display: inline-flex; align-items: center; gap: 0.4rem; }
  .year-block { padding: 1rem 1.1rem; display: flex; flex-direction: column; gap: 0.8rem; }
  .yb-head { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; }
  .yr-badge {
    font-weight: 800; font-size: 0.95rem; padding: 0.3rem 0.75rem; border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: color-mix(in srgb, var(--accent) 75%, black);
    border: 1px solid color-mix(in srgb, var(--accent) 36%, transparent);
  }
  .prog { font-size: 0.82rem; color: var(--text-muted); font-weight: 600; }
  .matrix { display: flex; flex-direction: column; gap: 0.45rem; }
  .ev-row { display: grid; grid-template-columns: 130px 1fr; gap: 0.6rem; align-items: center; }
  @media (max-width: 560px) { .ev-row { grid-template-columns: 1fr; gap: 0.3rem; } }
  .ev-name { font-weight: 700; font-size: 0.9rem; }
  .cells { display: flex; gap: 0.45rem; flex-wrap: wrap; }
  .cell {
    appearance: none; cursor: pointer;
    min-width: 5.2rem; padding: 0.4rem 0.6rem; border-radius: var(--r-md);
    border: 1px solid var(--border-strong); background: var(--surface);
    display: flex; flex-direction: column; align-items: flex-start; gap: 0.1rem;
    transition: transform var(--dur-fast), box-shadow var(--dur-fast);
  }
  .cell:hover:not(:disabled) { box-shadow: var(--shadow); transform: translateY(-1px); }
  .cell:disabled { opacity: 0.4; cursor: not-allowed; }
  .cell .str { font-size: 0.68rem; font-weight: 800; letter-spacing: 0.04em; color: var(--text-faint); }
  .cell .state { font-weight: 700; font-size: 0.84rem; }
  .cell.committed { background: var(--up-soft); border-color: color-mix(in srgb, var(--up) 35%, transparent); }
  .cell.committed .state { color: var(--up); }
  .cell.void { background: var(--down-soft); border-color: color-mix(in srgb, var(--down) 35%, transparent); }
  .cell.void .state { color: var(--down); }
  .cell.outstanding .state { color: var(--text-muted); }
</style>
