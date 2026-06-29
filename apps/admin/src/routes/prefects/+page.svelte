<script lang="ts">
  import { onMount } from 'svelte';
  import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
  import { getDb, paths, getSeasonId } from '@mgs/firebase';
  import { data } from '$lib/data.svelte';
  import { formatDateTime } from '$lib/helpers';
  import type { Submission } from '@mgs/config-types';

  // The shared data layer only subscribes to PENDING submissions; the prefect log needs every
  // status, so this page runs its own season-scoped query.
  let subs = $state<Submission[]>([]);
  let loaded = $state(false);
  onMount(() => {
    const db = getDb();
    const unsub: Unsubscribe = onSnapshot(
      query(collection(db, paths.submissions()), where('seasonId', '==', getSeasonId())),
      (snap) => {
        subs = snap.docs.map((d) => d.data() as Submission);
        loaded = true;
      },
      () => (loaded = true),
    );
    return () => unsub();
  });

  function contestShort(cid: string): string {
    const [y, ev, str] = cid.split('__');
    const evl = data.events.find((e) => e.id === ev)?.label ?? ev;
    return str ? `${y} ${evl} ${str}` : `${y} ${evl}`;
  }

  interface PrefectRow {
    name: string;
    stations: string[];
    count: number;
    lastAt: number;
    items: { contestId: string; status: string; at: number }[];
  }
  const prefects = $derived.by(() => {
    const m = new Map<string, PrefectRow>();
    for (const s of subs) {
      const name = s.attribution?.prefectName?.trim() || '(no name given)';
      let row = m.get(name);
      if (!row) {
        row = { name, stations: [], count: 0, lastAt: 0, items: [] };
        m.set(name, row);
      }
      row.count++;
      const at = s.clientCreatedAt ?? 0;
      row.lastAt = Math.max(row.lastAt, at);
      const area = s.attribution?.areaCode;
      if (area && !row.stations.includes(area)) row.stations.push(area);
      row.items.push({ contestId: s.contestId, status: s.status, at });
    }
    for (const r of m.values()) r.items.sort((a, b) => b.at - a.at);
    return [...m.values()].sort((a, b) => b.lastAt - a.lastAt);
  });

  const totalSubs = $derived(subs.length);
</script>

<div class="page-head">
  <div>
    <h2>Prefects</h2>
    <div class="lede">Who entered what, and when — for chasing up any query about the data. {prefects.length} prefect{prefects.length === 1 ? '' : 's'}, {totalSubs} submission{totalSubs === 1 ? '' : 's'} this season.</div>
  </div>
</div>

{#if !loaded}
  <div class="card"><div class="empty-state">Loading…</div></div>
{:else if !prefects.length}
  <div class="card"><div class="empty-state">No submissions yet — prefect activity will appear here as results come in.</div></div>
{:else}
  <div class="grid">
    {#each prefects as p (p.name)}
      <section class="card prefect">
        <header class="ph">
          <div class="who">
            <span class="name">{p.name}</span>
            <span class="meta">
              {#each p.stations as st}<span class="station">📍 {st}</span>{/each}
            </span>
          </div>
          <div class="stat"><b>{p.count}</b> <span>result{p.count === 1 ? '' : 's'}</span><span class="last">last {formatDateTime(p.lastAt)}</span></div>
        </header>
        <div class="chips">
          {#each p.items as it (it.contestId + it.at)}
            <a class="chip s-{it.status}" href={`/contests?c=${encodeURIComponent(it.contestId)}`} title="{contestShort(it.contestId)} — {it.status}">
              {contestShort(it.contestId)}
            </a>
          {/each}
        </div>
      </section>
    {/each}
  </div>
{/if}

<style>
  .grid { display: grid; gap: 0.9rem; grid-template-columns: 1fr; }
  @media (min-width: 760px) { .grid { grid-template-columns: 1fr 1fr; } }
  .prefect { display: flex; flex-direction: column; gap: 0.7rem; }
  .ph { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
  .who { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
  .name { font-weight: 800; font-size: 1.05rem; }
  .meta { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .station { font-size: 0.78rem; font-weight: 700; color: var(--text-muted); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-pill); padding: 0.05rem 0.5rem; }
  .stat { text-align: right; display: flex; flex-direction: column; line-height: 1.25; white-space: nowrap; }
  .stat b { font-size: 1.2rem; }
  .stat span { font-size: 0.78rem; color: var(--text-muted); }
  .stat .last { font-size: 0.72rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .chip {
    font-size: 0.78rem; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: var(--r-md);
    text-decoration: none; color: var(--text); background: var(--surface-2); border: 1px solid var(--border);
  }
  .chip:hover { border-color: var(--brand); color: var(--brand-strong); }
  .chip.s-committed { background: var(--up-soft); color: var(--up); border-color: color-mix(in srgb, var(--up) 30%, transparent); }
  .chip.s-pending { background: var(--warn-soft); color: var(--warn); border-color: color-mix(in srgb, var(--warn) 30%, transparent); }
  .chip.s-superseded, .chip.s-rejected { opacity: 0.6; text-decoration: line-through; }
</style>
