<script lang="ts">
  import { scheduleView, overdueSlots, formatClock, eventDayPhase, formatEventDate } from '@mgs/ui';
  import type { ScheduleSlot } from '@mgs/config-types';
  import { data } from '$lib/data.svelte';
  import { setScheduleOffset, setScheduleEventDate, publishSchedule, setControl } from '$lib/api';
  import { confirm } from '$lib/confirm.svelte';
  import { toast, errMessage } from '$lib/toast.svelte';

  const YEAR_LABEL: Record<string, string> = { Y7: 'Year 7', Y8: 'Year 8', Y9: 'Year 9', Y10: 'Year 10' };

  const sched = $derived(data.schedule);
  const offset = $derived(sched?.offsetMin ?? 0);
  const eventLabel = $derived(formatEventDate(sched?.eventDate));
  const view = $derived.by(() => {
    if (!sched?.slots?.length) return null;
    const phase = eventDayPhase(sched.eventDate, new Date());
    return scheduleView(sched.slots, offset, data.clockMin, phase);
  });
  const isToday = $derived(view?.phase === 'today');

  const statusOf = $derived.by(() => {
    const m = new Map<string, string>();
    for (const c of data.contests) m.set(c.id, c.status);
    return m;
  });
  const pendingSet = $derived(new Set(data.submissions.map((s) => s.contestId)));

  // Overdue only matters on the event day itself.
  const overdue = $derived.by(() =>
    isToday && sched?.slots?.length
      ? overdueSlots(sched.slots, offset, data.clockMin, (cid) => statusOf.get(cid) === 'outstanding')
      : [],
  );

  const committedCount = $derived(data.contests.filter((c) => c.status === 'committed').length);
  const outstandingContests = $derived(data.contests.filter((c) => c.status === 'outstanding'));
  const isRevealed = $derived(data.control?.mode === 'revealed');

  function contestLabel(cid: string): string {
    const [year, eventId, str] = cid.split('__');
    const ev = data.events.find((e) => e.id === eventId);
    const evl = ev?.label ?? eventId;
    const yl = YEAR_LABEL[year ?? ''] ?? year ?? '';
    return ev?.isRelay ? `${evl} · ${yl}` : `${evl} · ${yl} · ${str}`;
  }

  const KIND_ORDER: Record<string, number> = { track: 0, relay: 0, info: 0, field: 1 };
  const rows = $derived.by(() => {
    const byTime = new Map<number, ScheduleSlot[]>();
    for (const s of sched?.slots ?? []) {
      const arr = byTime.get(s.time);
      if (arr) arr.push(s);
      else byTime.set(s.time, [s]);
    }
    return [...byTime.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([time, items]) => ({ time, items: items.sort((a, b) => (KIND_ORDER[a.kind] ?? 0) - (KIND_ORDER[b.kind] ?? 0)) }));
  });

  function slotState(s: ScheduleSlot): 'done' | 'partial' | 'none' {
    // Count only contests that still exist and aren't voided — a deliberately-voided race must
    // not pin a multi-contest slot (e.g. 800m 7+8) at partial (◐) forever.
    const active = (s.contestIds ?? []).filter((c) => statusOf.get(c) && statusOf.get(c) !== 'void');
    if (!active.length) return 'none';
    const committed = active.filter((c) => statusOf.get(c) === 'committed').length;
    return committed === active.length ? 'done' : committed > 0 ? 'partial' : 'none';
  }
  const rowNow = (time: number) => isToday && !!view && (view.current?.time === time || view.fieldRunning.some((f) => f.time === time));
  const inQueue = (item: { outstanding: string[] }) => item.outstanding.some((c) => pendingSet.has(c));

  let saving = $state(false);
  let publishing = $state(false);
  async function publish() {
    if (publishing) return;
    publishing = true;
    try {
      const r = await publishSchedule();
      toast.success(`Timetable published — ${r.slots} entries.`);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      publishing = false;
    }
  }
  async function bump(delta: number) {
    if (!sched || saving) return;
    const next = Math.max(0, Math.min(180, offset + delta));
    if (next === offset) return; // at a clamp bound — skip the redundant write every viewer churns on
    saving = true;
    try {
      await setScheduleOffset(next);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      saving = false;
    }
  }

  let dateInput = $state('');
  let savingDate = $state(false);
  $effect(() => {
    // Seed the date field from the doc once it loads; don't clobber an in-progress edit.
    if (sched?.eventDate && dateInput === '') dateInput = sched.eventDate;
  });
  async function saveDate() {
    if (!dateInput || savingDate || dateInput === (sched?.eventDate ?? '')) return;
    savingDate = true;
    try {
      await setScheduleEventDate(dateInput);
      toast.success(`Event date set to ${formatEventDate(dateInput) || dateInput}.`);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      savingDate = false;
    }
  }

  let closing = $state(false);
  async function closeSportsDay() {
    if (closing) return;
    const out = outstandingContests;
    let message: string;
    if (out.length) {
      const names = out.slice(0, 8).map((c) => contestLabel(c.id)).join(', ');
      const more = out.length > 8 ? ` …and ${out.length - 8} more` : '';
      message = `${out.length} race${out.length === 1 ? '' : 's'} still have no result (${names}${more}). Commit them, or void any that didn't take place — or close anyway and reveal the final results now?`;
    } else {
      message = 'All results are in. Reveal the final results on the public scoreboard now?';
    }
    const ok = await confirm({
      title: 'Close Sports Day?',
      message,
      confirmLabel: out.length ? 'Close anyway' : 'Close & reveal',
      danger: out.length > 0,
    });
    if (!ok) return;
    closing = true;
    try {
      await setControl({ mode: 'revealed', revealScope: null });
      toast.success('Sports Day closed — final results revealed on the scoreboard.');
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      closing = false;
    }
  }
  async function reopen() {
    if (closing) return;
    closing = true;
    try {
      await setControl({ mode: 'live' });
      toast.success('Back to live — the board updates in real time again.');
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      closing = false;
    }
  }
</script>

<div class="page">
  <header class="page-head">
    <h1>🗓️ Schedule</h1>
    <p class="muted">The day's running order — now/next and the overdue chase list update live.</p>
  </header>

  {#if !sched?.slots?.length}
    <div class="card empty">
      <p>No timetable published yet.</p>
      <button class="btn btn-primary" disabled={publishing} onclick={publish}>{publishing ? 'Publishing…' : '🗓️ Publish timetable'}</button>
      <p class="hint">Loads the day's running order. This doesn't touch results, access codes or the audit log.</p>
    </div>
  {:else}
    <section class="card nn">
      <div class="nn-state">
        {#if view?.phase === 'before'}
          <span class="big">🗓 Sports Day is {eventLabel || 'not set'}</span>
          {#if view.next}<div class="nn-line"><span class="lab">First up</span><b>{formatClock(view.next.time + offset)} · {view.next.label}</b></div>{/if}
          <span class="muted small">Now / next and the overdue list go live on the day itself.</span>
        {:else if view?.phase === 'after'}
          <span class="big">🏁 Sports Day has finished{#if eventLabel} — was {eventLabel}{/if}</span>
        {:else if view?.finished}
          <span class="big">🏁 Final events — awaiting results</span>
          <span class="muted small">The day ends when you close it below, not by the clock.</span>
        {:else if view && !view.started}
          <span class="big">Starts {formatClock((view.next?.time ?? 0) + offset)} — {view.next?.label ?? ''}</span>
        {:else if view}
          <div class="nn-line"><span class="lab now">● On now</span><b>{view.current?.label ?? '—'}</b></div>
          {#if view.next}
            <div class="nn-line"><span class="lab">Next · {formatClock(view.next.time + offset)}</span><b>{view.next.label}</b></div>
          {/if}
          {#if view.fieldRunning.length}
            <div class="nn-line">
              <span class="lab">Field</span>
              <span class="fields">{#each view.fieldRunning as f (f.contestIds?.join(',') ?? f.label)}<span class="fchip">{f.label}</span>{/each}</span>
            </div>
          {/if}
        {/if}
      </div>
      <div class="ctl-col">
        <div class="daterow">
          <span class="off-lab">Event date</span>
          <input type="date" class="dateinput" bind:value={dateInput} />
          <button class="btn tiny" disabled={savingDate || !dateInput || dateInput === (sched?.eventDate ?? '')} onclick={saveDate}>Set</button>
        </div>
        {#if isToday}
          <div class="offset">
            <span class="off-lab">Running behind</span>
            <div class="off-ctl">
              <button class="btn" disabled={saving || offset <= 0} onclick={() => bump(-5)}>−5</button>
              <button class="btn" disabled={saving || offset <= 0} onclick={() => bump(-1)}>−1</button>
              <span class="off-val">{offset}<small>min</small></span>
              <button class="btn" disabled={saving || offset >= 180} onclick={() => bump(1)}>+1</button>
              <button class="btn" disabled={saving || offset >= 180} onclick={() => bump(5)}>+5</button>
            </div>
            {#if offset > 0}
              <button class="btn btn-ghost off-reset" disabled={saving} onclick={() => bump(-offset)}>Back on time</button>
            {/if}
          </div>
        {/if}
      </div>
    </section>

    {#if isToday}
    <section class="card overdue-card" class:has={overdue.length > 0}>
      <h2>⏰ Overdue <span class="count">{overdue.length}</span></h2>
      {#if !overdue.length}
        <p class="muted ok">Nothing overdue — every race past its time is committed. 🎉</p>
      {:else}
        <p class="muted">Past their time but not yet committed. Commit from the queue, or chase the prefect.</p>
        <div class="od-list">
          {#each overdue as item (item.slot.time + item.slot.label)}
            {@const inQ = inQueue(item)}
            <a class="od-row" href={inQ ? '/queue' : '/contests'}>
              <span class="od-time">{formatClock(item.slot.time + offset)}</span>
              <span class="od-lab">{item.slot.label}{#if item.slot.area}<span class="od-area"> · {item.slot.area}</span>{/if}</span>
              <span class="od-late">{item.minsLate}m late</span>
              <span class="od-act" class:inq={inQ}>{inQ ? 'in queue → commit' : 'no result yet'}</span>
            </a>
          {/each}
        </div>
      {/if}
    </section>
    {/if}

    {#if view && view.phase !== 'before'}
      <section class="card finalise" class:closed={isRevealed}>
        <h2>🏁 Finish line</h2>
        <p class="fl-stat">
          {committedCount} of {data.contests.length} results committed{#if outstandingContests.length} · <b class="warn">{outstandingContests.length} still outstanding</b>{:else} · all in ✅{/if}
        </p>
        {#if isRevealed}
          <p class="ok">✅ Sports Day is closed — the final results are showing on the public scoreboard.</p>
          <button class="btn" disabled={closing} onclick={reopen}>Re-open (back to the live board)</button>
        {:else}
          <button class="btn btn-primary" disabled={closing} onclick={closeSportsDay}>{closing ? 'Closing…' : 'Close Sports Day & reveal final results'}</button>
          <p class="hint">Checks for races with no result first (void any that were cancelled), then reveals the final standings on the public board.</p>
        {/if}
        <p class="hint">🎤 <b>Announcer view</b> — auto-filled 1st/2nd/3rd per year + overall, to read out (or print): <a href="https://mgssportsday-55624.web.app/final" target="_blank" rel="noopener">mgssportsday-55624.web.app/final</a></p>
      </section>
    {/if}

    <section class="card">
      <h2>Full timetable <button class="btn btn-ghost tiny" disabled={publishing} onclick={publish}>{publishing ? 'Publishing…' : '↻ Re-publish'}</button></h2>
      <div class="timeline">
        {#each rows as row (row.time)}
          <div class="trow" class:now={rowNow(row.time)}>
            <div class="ttime">{formatClock(row.time + offset)}</div>
            <div class="titems">
              {#each row.items as s (s.contestIds?.join(',') ?? s.kind + s.label)}
                {@const st = slotState(s)}
                <span class="sitem k-{s.kind} st-{st}">
                  {#if st === 'done'}<span class="ck done">✓</span>{:else if st === 'partial'}<span class="ck pt">◐</span>{/if}
                  {s.label}{#if s.area}<span class="area"> · {s.area}</span>{/if}
                </span>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 1rem; max-width: 920px; }
  .page-head h1 { margin: 0 0 0.2rem; }
  .page-head .muted { margin: 0; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 1rem 1.2rem; }
  .empty { display: flex; flex-direction: column; align-items: flex-start; gap: 0.6rem; }
  .empty p { margin: 0; }
  .empty .hint { font-size: 0.85rem; color: var(--text-muted); }
  h2 { margin: 0 0 0.6rem; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; }
  h2 .tiny { margin-left: auto; font-size: 0.75rem; padding: 0.2rem 0.55rem; font-weight: 700; }

  /* Now / next + offset */
  .nn { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; justify-content: space-between; }
  .nn-state { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
  .nn-line { display: flex; align-items: baseline; gap: 0.6rem; }
  .nn-line b { font-size: 1.1rem; }
  .lab { font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); min-width: 5.5rem; }
  .lab.now { color: #16a34a; }
  .big { font-weight: 800; font-size: 1.05rem; }
  .big.done { color: #16a34a; }
  .fields { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .fchip { font-size: 0.8rem; font-weight: 700; padding: 0.1rem 0.5rem; border-radius: var(--r-pill); background: var(--surface-2); border: 1px solid var(--border); }

  .offset { display: flex; flex-direction: column; align-items: flex-end; gap: 0.35rem; }
  .off-lab { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); }
  .off-ctl { display: flex; align-items: center; gap: 0.3rem; }
  .off-ctl .btn { padding: 0.35rem 0.6rem; min-width: 2.6rem; }
  .off-val { font-weight: 900; font-size: 1.3rem; min-width: 3.6rem; text-align: center; font-variant-numeric: tabular-nums; }
  .off-val small { font-size: 0.7rem; font-weight: 700; color: var(--text-muted); margin-left: 0.15rem; }
  .off-reset { padding: 0.25rem 0.6rem; font-size: 0.8rem; }
  .small { font-size: 0.8rem; }

  .ctl-col { display: flex; flex-direction: column; align-items: flex-end; gap: 0.6rem; }
  .daterow { display: flex; align-items: center; gap: 0.4rem; }
  .dateinput {
    padding: 0.32rem 0.5rem; border: 1px solid var(--border); border-radius: var(--r-md);
    background: var(--surface); color: var(--text); font: inherit; font-size: 0.9rem;
  }
  .btn.tiny { padding: 0.28rem 0.55rem; font-size: 0.8rem; font-weight: 700; min-width: 0; }

  /* Finish line */
  .finalise { display: flex; flex-direction: column; align-items: flex-start; gap: 0.55rem; }
  .finalise.closed { border-color: color-mix(in srgb, #16a34a 45%, var(--border)); }
  .fl-stat { margin: 0; font-weight: 600; }
  .warn { color: #b45309; }
  .hint { margin: 0; font-size: 0.82rem; color: var(--text-muted); max-width: 60ch; }

  /* Overdue */
  .overdue-card.has { border-color: color-mix(in srgb, #ef4444 45%, var(--border)); }
  .count { font-size: 0.85rem; font-weight: 900; background: var(--surface-2); color: var(--text-muted); border-radius: var(--r-pill); padding: 0.05rem 0.55rem; }
  .overdue-card.has .count { background: #ef4444; color: #fff; }
  .ok { color: #16a34a; }
  .od-list { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.5rem; }
  .od-row {
    display: grid; grid-template-columns: 3.6rem 1fr auto auto; align-items: center; gap: 0.7rem;
    padding: 0.5rem 0.7rem; border-radius: var(--r-md); text-decoration: none; color: var(--text);
    background: color-mix(in srgb, #ef4444 7%, var(--surface-2)); border: 1px solid color-mix(in srgb, #ef4444 22%, var(--border));
  }
  .od-row:hover { background: color-mix(in srgb, #ef4444 13%, var(--surface-2)); }
  .od-time { font-weight: 800; font-variant-numeric: tabular-nums; color: var(--text-muted); }
  .od-lab { font-weight: 700; min-width: 0; }
  .od-area { color: var(--text-muted); font-weight: 600; }
  .od-late { font-weight: 800; color: #b91c1c; font-size: 0.85rem; white-space: nowrap; }
  .od-act { font-size: 0.78rem; font-weight: 800; color: var(--text-muted); white-space: nowrap; }
  .od-act.inq { color: #2563eb; }

  /* Timeline */
  .timeline { display: flex; flex-direction: column; }
  .trow { display: grid; grid-template-columns: 4rem 1fr; gap: 0.7rem; padding: 0.35rem 0.2rem; border-top: 1px solid var(--border); }
  .trow:first-child { border-top: 0; }
  .trow.now { background: color-mix(in srgb, var(--brand) 9%, transparent); border-radius: var(--r-md); border-top-color: transparent; }
  .ttime { font-weight: 800; font-variant-numeric: tabular-nums; color: var(--text); }
  .titems { display: flex; flex-wrap: wrap; gap: 0.3rem; min-width: 0; }
  .sitem {
    display: inline-flex; align-items: baseline; gap: 0.3rem; font-weight: 700; font-size: 0.88rem;
    padding: 0.15rem 0.55rem; border-radius: var(--r-sm, 6px); background: var(--surface-2); border: 1px solid var(--border);
  }
  .sitem.k-field { font-weight: 600; }
  .sitem.k-info { font-style: italic; color: var(--text-muted); }
  .sitem.st-done { opacity: 0.65; }
  .ck { font-weight: 900; }
  .ck.done { color: #16a34a; }
  .ck.pt { color: #d97706; }
  .area { font-size: 0.74rem; font-weight: 600; color: var(--text-muted); }

  @media (max-width: 640px) {
    .nn { flex-direction: column; align-items: stretch; }
    .ctl-col, .offset { align-items: stretch; }
    .daterow { justify-content: space-between; }
    .off-ctl { justify-content: space-between; }
    .od-row { grid-template-columns: 3.2rem 1fr; }
    .od-late, .od-act { grid-column: 2; }
  }
</style>
