<script lang="ts">
  import { scheduleView, formatClock, eventDayPhase, formatEventDate } from '@mgs/ui';
  import type { ScheduleSlot } from '@mgs/config-types';
  import { season, YEAR_META } from '$lib/season.svelte';

  const sched = $derived(season.schedule);
  const offset = $derived(sched?.offsetMin ?? 0);
  const eventLabel = $derived(formatEventDate(sched?.eventDate));
  const view = $derived.by(() => {
    if (!sched?.slots?.length) return null;
    const phase = eventDayPhase(sched.eventDate, new Date());
    return scheduleView(sched.slots, offset, season.clockMin, phase);
  });
  const isToday = $derived(view?.phase === 'today');

  // contestIds already committed (they appear in the standings) — drives the ✓ done markers.
  const committed = $derived.by(() => {
    const set = new Set<string>();
    for (const f of Object.values(season.standings?.forms ?? {})) for (const cid of Object.keys(f.byEvent ?? {})) set.add(cid);
    return set;
  });

  const KIND_ORDER: Record<string, number> = { track: 0, relay: 0, info: 0, field: 1 };

  // Group slots into one row per start time.
  const rows = $derived.by(() => {
    const byTime = new Map<number, ScheduleSlot[]>();
    for (const s of [...(sched?.slots ?? [])]) {
      const arr = byTime.get(s.time);
      if (arr) arr.push(s);
      else byTime.set(s.time, [s]);
    }
    return [...byTime.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([time, items]) => ({ time, items: items.sort((a, b) => (KIND_ORDER[a.kind] ?? 0) - (KIND_ORDER[b.kind] ?? 0)) }));
  });

  const isDone = (s: ScheduleSlot) => !!s.contestIds?.length && s.contestIds.every((c) => committed.has(c));
  // now/past styling only applies on the event day itself.
  const rowNow = (time: number) => isToday && !!view && (view.current?.time === time || view.fieldRunning.some((f) => f.time === time));
  const rowPast = (time: number) => isToday && !!view && time < view.adjustedNow && !rowNow(time);
  const colour = (s: ScheduleSlot) => (s.year ? YEAR_META[s.year]?.colour : undefined) ?? 'var(--text-muted)';
</script>

<section class="schedule">
  <div class="head">
    <h2>{isToday ? "Today's Schedule" : eventLabel ? `Sports Day — ${eventLabel}` : 'Sports Day Schedule'}</h2>
    {#if isToday && offset > 0}<span class="late">⏱ running ~{offset} min behind</span>{/if}
  </div>

  {#if !rows.length}
    <div class="empty">The timetable hasn't been published yet.</div>
  {:else}
    <div class="timeline">
      {#each rows as row (row.time)}
        <div class="trow" class:now={rowNow(row.time)} class:past={rowPast(row.time)}>
          <div class="ttime">{formatClock(row.time + offset)}{#if rowNow(row.time)}<span class="liveTag">now</span>{/if}</div>
          <div class="titems">
            {#each row.items as s (s.contestIds?.join(',') ?? s.kind + s.label)}
              <span class="sitem k-{s.kind}" class:done={isDone(s)} style="--c:{colour(s)}">
                {#if isDone(s)}<span class="check">✓</span>{/if}
                <span class="txt">{s.label}</span>
                {#if s.area}<span class="area">{s.area}</span>{/if}
              </span>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .schedule {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    padding: 0.8rem 1rem 1rem;
    max-height: 100%;
    overflow: auto;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 0.8rem;
    margin: 0 0 0.6rem;
  }
  .head h2 {
    margin: 0;
    font-size: 1.3rem;
  }
  .late {
    font-size: 0.8rem;
    font-weight: 800;
    color: #b45309;
    background: var(--gold-soft, #fef3c7);
    padding: 0.15rem 0.6rem;
    border-radius: var(--r-pill);
  }
  .empty {
    color: var(--text-muted);
    padding: 1.5rem;
    text-align: center;
  }
  .timeline {
    display: flex;
    flex-direction: column;
  }
  .trow {
    display: grid;
    grid-template-columns: 4.2rem 1fr;
    gap: 0.7rem;
    padding: 0.4rem 0.3rem;
    border-top: 1px solid var(--border);
  }
  .trow:first-child { border-top: 0; }
  .trow.past { opacity: 0.5; }
  .trow.now {
    background: color-mix(in srgb, var(--brand) 10%, transparent);
    border-radius: var(--r-md);
    border-top-color: transparent;
  }
  .ttime {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--text);
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .liveTag {
    font-size: 0.62rem;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #fff;
    background: #ef4444;
    padding: 0.05rem 0.35rem;
    border-radius: var(--r-pill);
    width: fit-content;
  }
  .titems {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    min-width: 0;
  }
  .sitem {
    display: inline-flex;
    align-items: baseline;
    gap: 0.35rem;
    font-weight: 700;
    font-size: 0.92rem;
    padding: 0.2rem 0.6rem;
    border-radius: var(--r-md);
    background: var(--surface-2);
    border-left: 3px solid var(--c);
    color: var(--text);
  }
  .sitem.k-field { font-weight: 600; opacity: 0.95; }
  .sitem.k-info {
    font-style: italic;
    color: var(--text-muted);
    border-left-color: var(--border);
  }
  .sitem.done .txt { color: var(--text-muted); }
  .check { color: #16a34a; font-weight: 900; }
  .area { font-size: 0.75rem; font-weight: 600; color: var(--text-muted); }
</style>
