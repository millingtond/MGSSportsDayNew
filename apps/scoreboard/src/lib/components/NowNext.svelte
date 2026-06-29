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

  const colour = (s?: ScheduleSlot | null) => (s?.year ? YEAR_META[s.year]?.colour : undefined) ?? 'var(--brand)';
  const at = (s?: ScheduleSlot | null) => (s ? formatClock(s.time + offset) : '');
</script>

{#if view}
  <div class="nownext" aria-label="Now and next">
    {#if view.phase === 'before'}
      <div class="nn up" style="--c:var(--brand)">
        <span class="tag">🗓 Sports Day</span>
        <span class="lab">{eventLabel || 'coming soon'}{#if view.next} · first up {at(view.next)}, {view.next.label}{/if}</span>
      </div>
    {:else if view.phase === 'after'}
      <div class="nn done"><span class="lab">🏁 Sports Day has finished</span></div>
    {:else if view.finished}
      <div class="nn done"><span class="lab">🏁 Final events — results coming in</span></div>
    {:else if !view.started}
      <div class="nn up" style="--c:{colour(view.next)}">
        <span class="tag">First up · {at(view.next)}</span>
        <span class="lab">{view.next?.label ?? 'Schedule loading…'}</span>
      </div>
    {:else}
      {#if view.current}
        <div class="nn now" style="--c:{colour(view.current)}">
          <span class="tag"><span class="pulse"></span> On now</span>
          <span class="lab">{view.current.label}</span>
        </div>
      {/if}
      {#if view.next}
        <div class="nn next" style="--c:{colour(view.next)}">
          <span class="tag">Next · {at(view.next)}</span>
          <span class="lab">{view.next.label}</span>
        </div>
      {/if}
      {#if view.fieldRunning.length}
        <div class="nn field">
          <span class="tag">Field</span>
          <span class="chips">
            {#each view.fieldRunning as f (f.contestIds?.join(',') ?? f.label)}
              <span class="chip" style="--c:{colour(f)}">{f.label}</span>
            {/each}
          </span>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .nownext {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: 0.5rem;
    margin: 0.1rem 0 0.2rem;
  }
  .nn {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
    padding: 0.45rem 0.85rem;
    border-radius: var(--r-md);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-left: 4px solid var(--c, var(--brand));
  }
  .nn.now {
    background: color-mix(in srgb, var(--c) 16%, var(--surface-2));
    border-color: color-mix(in srgb, var(--c) 40%, var(--border));
  }
  .nn.field {
    flex: 1 1 auto;
    border-left-color: var(--border);
  }
  .tag {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .nn.now .tag {
    color: color-mix(in srgb, var(--c) 75%, var(--text));
  }
  .lab {
    font-weight: 800;
    font-size: clamp(0.95rem, 1.6vw, 1.25rem);
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .done .lab {
    color: var(--text-muted);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    min-width: 0;
  }
  .chip {
    font-size: 0.78rem;
    font-weight: 700;
    padding: 0.15rem 0.5rem;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--c) 18%, var(--surface));
    color: var(--text);
    border: 1px solid color-mix(in srgb, var(--c) 35%, transparent);
    white-space: nowrap;
  }
  .pulse {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: #ef4444;
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6);
    animation: pulse 1.6s infinite;
  }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6); }
    70% { box-shadow: 0 0 0 0.5rem rgba(239, 68, 68, 0); }
    100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .pulse { animation: none; }
  }
</style>
