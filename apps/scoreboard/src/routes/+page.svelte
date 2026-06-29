<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { flip } from 'svelte/animate';
  import { sortByPos, rankDelta, timeAgo, contrastText } from '@mgs/ui';
  import { isDryRun, getSeasonId } from '@mgs/firebase';
  import type { FormStanding } from '@mgs/config-types';
  import { season, startSeason, allForms, formsForYear, contestWinner, YEAR_ORDER, YEAR_META } from '$lib/season.svelte';
  import LeaderRow from '$lib/components/LeaderRow.svelte';
  import YearPanel from '$lib/components/YearPanel.svelte';
  import Podium from '$lib/components/Podium.svelte';
  import Ticker from '$lib/components/Ticker.svelte';
  import EventResults from '$lib/components/EventResults.svelte';
  import Individuals from '$lib/components/Individuals.svelte';
  import Confetti from '$lib/components/Confetti.svelte';
  import Crest from '$lib/components/Crest.svelte';
  import SuspenseScreen from '$lib/components/SuspenseScreen.svelte';
  import RevealScreen from '$lib/components/RevealScreen.svelte';
  import NowNext from '$lib/components/NowNext.svelte';
  import Schedule from '$lib/components/Schedule.svelte';
  import PhoneQr from '$lib/components/PhoneQr.svelte';

  let now = $state(Date.now());
  let selectedEvent = $state('');
  // Resolve view + kiosk at init (before first paint) so a projector doesn't paint at 1.0
  // and jump to the kiosk zoom, and phones don't flash the wide 'all' view first.
  let view = $state<string>(browser && window.innerWidth < 1100 ? 'school' : 'all');
  let kiosk = $state(
    browser &&
      (new URLSearchParams(location.search).has('kiosk') ||
        (window.innerWidth >= 1920 && window.matchMedia('(pointer: fine)').matches && !('ontouchstart' in window))),
  );

  // Attract mode (kiosk only): cycle the views unattended, pause when someone touches the
  // screen, and cut to a year the instant its result lands.
  const DWELL = 14; // seconds per view
  let rotateIdx = $state(0);
  let pauseUntil = $state(0);
  let userHoldUntil = 0; // a viewer is actively holding a view — don't auto-cut away from it
  let manualPause = $state(false); // explicit pause via the auto/pause toggle (sticky, not the 30s touch-hold)

  onMount(() => {
    startSeason();
    const clock = setInterval(() => (now = Date.now()), 1000);
    const watchdog = setTimeout(() => {
      if (!season.ready) location.reload();
    }, 25000);

    // Kiosk self-heal: a board left up unattended all day can wedge its realtime listener
    // (a dropped socket the SDK never recovered, a throttled tab) and silently stop updating
    // hours after a clean boot. The board is read-only, so a reload re-establishes the
    // connection and loses nothing. Guarded hard against reload loops: kiosk-only, only when
    // the browser reports it's online, only after a stale gap longer than any real lull, and
    // debounced across reloads via sessionStorage.
    let healthCheck: ReturnType<typeof setInterval> | undefined;
    if (kiosk) {
      const STALE_MS = 10 * 60 * 1000;
      healthCheck = setInterval(() => {
        if (!season.ready || !navigator.onLine) return;
        if (Date.now() - season.lastUpdate < STALE_MS) return;
        let last = 0;
        try {
          last = Number(sessionStorage.getItem('mgs.lastSelfHeal') || 0);
        } catch {
          /* storage blocked — fall through and reload */
        }
        if (Date.now() - last < STALE_MS) return; // already self-healed recently
        try {
          sessionStorage.setItem('mgs.lastSelfHeal', String(Date.now()));
        } catch {
          /* ignore */
        }
        location.reload();
      }, 30000);
    }

    let rotate: ReturnType<typeof setInterval> | undefined;
    let bump: (() => void) | undefined;
    if (kiosk) {
      let elapsed = 0;
      rotate = setInterval(() => {
        if (manualPause || Date.now() < pauseUntil) {
          elapsed = 0; // explicitly paused, or someone's looking / a result is showing — hold
          return;
        }
        if (++elapsed >= DWELL) {
          elapsed = 0;
          rotateIdx = (rotateIdx + 1) % rotation.length;
          view = rotation[rotateIdx]!;
        }
      }, 1000);
      // Any interaction pauses the carousel for 30s so a viewer can hold a view (and a
      // result landing won't yank it away while they're looking).
      bump = () => {
        const t = Date.now() + 30000;
        pauseUntil = t;
        userHoldUntil = t;
      };
      window.addEventListener('pointerdown', bump);
      window.addEventListener('keydown', bump);
    }

    return () => {
      clearInterval(clock);
      clearTimeout(watchdog);
      if (healthCheck) clearInterval(healthCheck);
      if (rotate) clearInterval(rotate);
      if (bump) {
        window.removeEventListener('pointerdown', bump);
        window.removeEventListener('keydown', bump);
      }
    };
  });

  const dryRun = isDryRun();
  const seasonName = getSeasonId();
  const std = $derived(season.standings);
  const mode = $derived(season.control?.mode ?? 'live');
  const schoolSorted = $derived(sortByPos(allForms(std), 'schoolPos'));
  const heroForms = $derived(view === 'all' ? schoolSorted.slice(0, 12) : schoolSorted);
  const schoolLead = $derived(Math.max(0, (schoolSorted[0]?.total ?? 0) - (schoolSorted[1]?.total ?? 0)));
  const progress = $derived(std?.progress ?? { committed: 0, total: 100, void: 0 });
  const remaining = $derived(Math.max(0, progress.total - progress.committed - progress.void));
  const pct = $derived(progress.total ? Math.round((progress.committed / progress.total) * 100) : 0);
  const recordsBroken = $derived(std?.records?.broken?.length ?? 0);
  const hasAthletes = $derived(YEAR_ORDER.some((y) => (std?.athletes?.byYear?.[y]?.length ?? 0) > 0));
  const hasSchedule = $derived((season.schedule?.slots?.length ?? 0) > 0);
  const tabs = $derived([
    'all',
    'school',
    ...YEAR_ORDER,
    'events',
    ...(hasSchedule ? ['schedule'] : []),
    ...(hasAthletes ? ['individuals'] : []),
  ]);
  // Attract carousel — mirrors the tab gating so the kiosk never dwells on an unpublished
  // (empty) Schedule view. Year codes always present so jumpToYear keeps working.
  const rotation = $derived(['all', 'school', ...YEAR_ORDER, 'events', ...(hasSchedule ? ['schedule'] : [])]);
  const currentEvent = $derived(season.events.find((e) => e.id === selectedEvent) ?? season.events[0] ?? null);
  const tickerItems = $derived(
    (std?.recentResults ?? []).map((r) => {
      const w = contestWinner(std, r.contestId);
      return { ...r, winnerLabel: w?.code, winnerColour: w?.colour };
    }),
  );

  // The tightest year race — ambient interest for the big screen during quiet spells.
  const closestYear = $derived.by(() => {
    if (!std) return null;
    let best: { year: string; margin: number } | null = null;
    for (const y of YEAR_ORDER) {
      const fs = sortByPos(formsForYear(std, y), 'yearPos');
      if (fs.length >= 2 && (fs[0]?.total ?? 0) > 0) {
        const margin = fs[0]!.total - fs[1]!.total;
        if (!best || margin < best.margin) best = { year: y, margin };
      }
    }
    return best;
  });

  // If the schedule disappears (a dry-run with none, or it's cleared) while it's the active
  // view, fall back to 'all' so the public board never dwells on a dead 'not published' panel.
  $effect(() => {
    if (view === 'schedule' && !hasSchedule) view = 'all';
  });

  // Attract mode: cut to the year a result just landed in, hold briefly, then resume.
  function jumpToYear(year: string) {
    if (!kiosk || !rotation.includes(year)) return;
    if (manualPause || Date.now() < userHoldUntil) return; // paused / holding a view — leave it be
    view = year;
    rotateIdx = rotation.indexOf(year);
    pauseUntil = Math.max(pauseUntil, Date.now() + 9000); // only ever extend the hold
  }

  // The auto/pause pill toggles a sticky pause. Whatever the pill currently shows, a tap flips it:
  // paused (sticky OR the transient touch-hold) → resume auto immediately; auto → sticky pause.
  function toggleAuto() {
    const isPaused = manualPause || Date.now() < pauseUntil;
    if (isPaused) {
      manualPause = false;
      pauseUntil = 0;
      userHoldUntil = 0;
    } else {
      manualPause = true;
    }
  }

  function fmtMark(score: number, units?: string, eventId?: string): string {
    // Prefer the units carried on the record break; fall back to the event lookup for
    // standings docs written before units were stored.
    const unit = units ?? (eventId ? season.events.find((e) => e.id === eventId)?.recordUnits : undefined);
    return unit === 'second' ? `${score}s` : unit === 'metre' ? `${score}m` : `${score}`;
  }

  function tabLabel(t: string): string {
    if (t === 'all') return 'All';
    if (t === 'school') return 'Whole School';
    if (t === 'events') return 'Events';
    if (t === 'schedule') return 'Schedule';
    if (t === 'individuals') return 'Individuals';
    return YEAR_META[t]?.short ?? t;
  }

  // Celebratory callouts, in priority order: record broken > new whole-school leader > result in.
  interface Flash {
    kind: 'result' | 'record' | 'lead';
    main: string;
    sub: string;
    id: number;
    accent: string;
    chip?: { label: string; colour: string };
  }
  let flash = $state<Flash | null>(null);
  let flashSeq = 0;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let confettiOn = $state(false);
  let confettiKey = $state(0);
  let confettiTimer: ReturnType<typeof setTimeout> | undefined;
  let lastResultId: string | null = null;
  let seenBreaks = new Set<string>();
  let lastLeaderId: string | null = null;
  let primed = false;

  // Identify a record break by what it IS, not where it sits — `broken` is rebuilt in
  // Firestore doc order every recompute and carries no timestamp, so position is meaningless.
  const breakKey = (b: { recordId: string; score: number; kind: string }) => `${b.recordId}:${b.score}:${b.kind}`;

  function showFlash(f: Omit<Flash, 'id'>) {
    flash = { ...f, id: ++flashSeq };
    clearTimeout(flashTimer);
    const id = flash.id;
    flashTimer = setTimeout(() => {
      if (flash?.id === id) flash = null;
    }, 6500);
  }

  function fireConfetti() {
    confettiKey++;
    confettiOn = true;
    clearTimeout(confettiTimer);
    confettiTimer = setTimeout(() => (confettiOn = false), 6000);
  }

  $effect(() => {
    const s = season.standings;
    if (!s) return;
    // Guard every field the same way the template deriveds do — a partial early doc
    // missing records/recentResults must not throw and kill the whole flash subsystem.
    const broken = s.records?.broken ?? [];
    const recents = s.recentResults ?? [];
    const forms = s.forms ?? {};
    const leaderId = sortByPos(Object.values(forms), 'schoolPos')[0]?.formId ?? null;

    if (!primed) {
      // Prime on first load: capture state, replay nothing.
      primed = true;
      lastResultId = recents[0]?.contestId ?? null;
      seenBreaks = new Set(broken.map(breakKey));
      lastLeaderId = leaderId;
      return;
    }

    // When the board isn't live (suspense / reveal), advance the trackers silently so
    // nothing the audience shouldn't see pops up the instant we return to live.
    const m = season.control?.mode;
    if (m && m !== 'live') {
      lastResultId = recents[0]?.contestId ?? lastResultId;
      seenBreaks = new Set(broken.map(breakKey));
      lastLeaderId = leaderId;
      return;
    }

    // 1) A record fell — identify the genuinely-new break(s) by identity, then re-sync
    //    the baseline every pass so a void/correction that drops the count can't swallow
    //    a later legitimate break.
    const fresh = broken.filter((b) => !seenBreaks.has(breakKey(b)));
    seenBreaks = new Set(broken.map(breakKey));
    if (fresh.length) {
      const b = fresh[fresh.length - 1]!;
      const f = forms[b.formId];
      showFlash({
        kind: 'record',
        main: '🔥 NEW RECORD!',
        sub: `${f?.label ?? ''} · ${b.event} · ${fmtMark(b.score, b.units, b.event)}`,
        accent: 'var(--gold)',
        chip: f ? { label: f.code, colour: f.colour } : undefined,
      });
      fireConfetti();
      jumpToYear(b.year);
      lastResultId = recents[0]?.contestId ?? lastResultId;
      lastLeaderId = leaderId;
      return;
    }

    // 2) New whole-school leader — a lead-change takeover in their colour.
    if (leaderId && lastLeaderId && leaderId !== lastLeaderId && (forms[leaderId]?.total ?? 0) > 0) {
      const f = forms[leaderId];
      lastLeaderId = leaderId;
      lastResultId = recents[0]?.contestId ?? lastResultId;
      showFlash({
        kind: 'lead',
        main: '🚀 NEW LEADERS',
        sub: `${f?.label ?? ''} take the lead`,
        accent: f?.colour ?? 'var(--brand)',
        chip: f ? { label: f.code, colour: f.colour } : undefined,
      });
      jumpToYear(f?.year ?? '');
      return;
    }
    lastLeaderId = leaderId;

    // 3) A result came in.
    const top = recents[0];
    if (top && top.contestId !== lastResultId) {
      lastResultId = top.contestId;
      const w = contestWinner(s, top.contestId);
      showFlash({
        kind: 'result',
        main: '📣 Result in',
        sub: w ? `${w.label} win ${top.label}` : top.label,
        accent: w?.colour ?? 'var(--brand)',
        chip: w ? { label: w.code, colour: w.colour } : undefined,
      });
      jumpToYear(top.contestId.split('__')[0] ?? '');
    }
  });
</script>

{#if dryRun}
  <div class="dryrun-banner">⚠ DRY RUN — “{seasonName}” · a rehearsal, not the live board</div>
{/if}
{#if mode === 'suspense'}
  <SuspenseScreen message={season.control?.message} />
{:else if mode === 'revealed' && std}
  <RevealScreen standings={std} scope={season.control?.revealScope} />
{:else}
  <div class="shell" class:kiosk>
    {#if confettiOn}
      {#key confettiKey}<Confetti duration={6000} count={150} />{/key}
    {/if}
    {#if flash}
      {#key flash.id}
        <div
          class="flash {flash.kind}"
          role="status"
          aria-live={flash.kind === 'record' ? 'assertive' : 'polite'}
          style="--flash-accent:{flash.accent}"
        >
          <div class="flash-body">
            {#if flash.chip}
              <span class="flash-chip" style="background:{flash.chip.colour}; color:{contrastText(flash.chip.colour)}">{flash.chip.label}</span>
            {/if}
            <div class="flash-text">
              <div class="flash-main">{flash.main}</div>
              <div class="flash-sub">{flash.sub}</div>
            </div>
          </div>
        </div>
      {/key}
    {/if}
    <header class="topbar">
      <div class="brand">
        <div class="mark"><Crest /></div>
        <div>
          <h1>MGS Sports Day</h1>
          <div class="sub">2026 · Live Scoreboard</div>
        </div>
      </div>

      <div class="status-cluster">
        {#if recordsBroken > 0}
          <span class="tag" style="background:var(--gold-soft); color:#7a5c00;">🔥 {recordsBroken} record{recordsBroken === 1 ? '' : 's'} broken</span>
        {/if}
        <div class="progress-wrap">
          <div class="progress-line">
            <span>{progress.committed} of {progress.total} · <b>{remaining}</b> to go</span>
            <span>{pct}%</span>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:{pct}%"></div></div>
        </div>
        {#if season.connected}
          <span class="live-badge"><span class="dot"></span> Live</span>
        {:else}
          <span class="live-badge offline"><span class="dot"></span> {season.ready ? 'Reconnecting' : 'Connecting'}</span>
        {/if}
      </div>
    </header>

    <nav class="tabs">
      {#each tabs as t}
        <button
          class="tab"
          class:active={view === t}
          onclick={() => {
            view = t;
            if (rotation.includes(t)) rotateIdx = rotation.indexOf(t);
          }}>{tabLabel(t)}</button>
      {/each}
      {#if kiosk}
        {@const isPaused = manualPause || now < pauseUntil}
        <button
          class="auto-pill"
          class:paused={isPaused}
          onpointerdown={(e) => e.stopPropagation()}
          onclick={toggleAuto}
          title={isPaused ? 'Paused — tap to resume auto-rotation' : 'Auto-rotating — tap to pause'}
        >
          {isPaused ? '⏸ paused' : '▶ auto'}
        </button>
      {/if}
    </nav>

    {#if season.ready && hasSchedule && view !== 'schedule'}
      <NowNext />
    {/if}

    {#if !season.ready}
      <div class="empty-state">Loading the scoreboard…</div>
    {:else if view === 'all'}
      <div class="board-grid all">
        {@render schoolCard(heroForms, true)}
        <div class="years-grid">
          {#each YEAR_ORDER as y}
            <YearPanel label={YEAR_META[y]?.label ?? y} colour={YEAR_META[y]?.colour ?? '#888'} forms={formsForYear(std, y)} />
          {/each}
        </div>
      </div>
    {:else if view === 'school'}
      {@render schoolCard(schoolSorted, false)}
    {:else if view === 'events'}
      <div class="events-view">
        <div class="event-chips">
          {#each season.events as e (e.id)}
            <button class="ev-chip" class:active={currentEvent?.id === e.id} onclick={() => (selectedEvent = e.id)}>{e.label}</button>
          {/each}
        </div>
        {#if currentEvent && std}
          <EventResults standings={std} event={currentEvent} />
        {:else}
          <div class="empty-state">Loading events…</div>
        {/if}
      </div>
    {:else if view === 'individuals' && std}
      <Individuals standings={std} />
    {:else if view === 'schedule'}
      <Schedule />
    {:else}
      <YearPanel label={YEAR_META[view]?.label ?? view} colour={YEAR_META[view]?.colour ?? '#888'} forms={formsForYear(std, view)} />
    {/if}

    <div class="bottom-strip" class:kiosk>
      <div class="ticker-slot"><Ticker items={tickerItems} /></div>
      {#if kiosk}
        <div class="qr-slot"><PhoneQr /></div>
      {/if}
    </div>

    <div class="footer-note">
      {#if kiosk && closestYear}
        <span class="insight">⚡ Tightest race: {YEAR_META[closestYear.year]?.label} — top two split by {closestYear.margin} pt{closestYear.margin === 1 ? '' : 's'}</span> ·
      {/if}
      Updated {timeAgo(season.lastUpdate, now)} · mgssportsday-55624.web.app
    </div>
  </div>
{/if}

{#snippet schoolCard(forms: FormStanding[], capped: boolean)}
  {@const showPodium = (forms[0]?.total ?? 0) > 0}
  <section class="card school-card">
    <div class="section-title">
      <span class="st-emblem"><Crest /></span> Whole School
      {#if capped}<span class="muted">· Top {forms.length}</span>{/if}
    </div>
    {#if showPodium}
      <Podium forms={forms.slice(0, 3)} lead={schoolLead} />
      <div class="rows rows-rest">
        {#each forms.slice(3) as f (f.formId)}
          <div animate:flip={{ duration: 600 }}>
            <LeaderRow place={f.schoolPos} form={f} delta={rankDelta(f.schoolPos, f.prevSchoolPos)} variant="school" />
          </div>
        {/each}
      </div>
    {:else}
      <div class="rows">
        {#each forms as f (f.formId)}
          <div animate:flip={{ duration: 600 }}>
            <LeaderRow place={f.schoolPos} form={f} delta={rankDelta(f.schoolPos, f.prevSchoolPos)} variant="school" />
          </div>
        {/each}
      </div>
    {/if}
  </section>
{/snippet}

<style>
  .dryrun-banner {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    background: repeating-linear-gradient(45deg, #f5b301, #f5b301 14px, #b8860b 14px, #b8860b 28px);
    color: #1a1200; font-weight: 900; text-align: center;
    padding: 0.35rem 1rem; font-size: 0.85rem; letter-spacing: 0.04em;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  }

  /* Kiosk: a big projector at the back of a hall. One wholesale scale-up. */
  .shell.kiosk { zoom: 1.18; }

  .school-card { padding: 0.6rem 0.6rem 0.8rem; }
  .school-card .rows { display: flex; flex-direction: column; gap: 0.1rem; }
  .school-card .rows-rest { margin-top: 0.4rem; }
  .st-emblem { width: 1.4rem; height: 1.4rem; display: inline-grid; place-items: center; }

  /* Result / new-leader / new-record flash, tinted to the form that earned it. */
  .flash {
    position: fixed; top: 0; left: 0; right: 0; z-index: 50;
    padding: calc(0.7rem + env(safe-area-inset-top)) 1rem 0.7rem;
    color: #fff;
    box-shadow: var(--shadow-lg);
    animation: flash-in 0.45s var(--ease-spring) both, flash-out 0.5s ease 6s forwards;
    background: linear-gradient(90deg,
      color-mix(in srgb, var(--flash-accent) 72%, #06101f),
      color-mix(in srgb, var(--flash-accent) 38%, #06101f));
  }
  .flash.record { color: #2a1c00; background: linear-gradient(90deg, #f5b301, #f97316); }
  .flash-body { display: flex; align-items: center; justify-content: center; gap: 0.85rem; max-width: 1100px; margin: 0 auto; }
  .flash-chip {
    flex: none; font-weight: 900; font-size: clamp(1.05rem, 2.6vw, 1.7rem);
    padding: 0.18em 0.5em; border-radius: var(--r-md);
    box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.18);
  }
  .flash-text { text-align: left; min-width: 0; }
  .flash-main { font-weight: 900; font-size: clamp(1rem, 2.6vw, 1.55rem); letter-spacing: 0.02em; line-height: 1.05; }
  .flash-sub { font-weight: 700; font-size: clamp(0.85rem, 2vw, 1.2rem); opacity: 0.96; }
  @keyframes flash-in { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @keyframes flash-out { to { transform: translateY(-100%); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) {
    .flash { animation: none; } /* appear/persist without the slide; JS still clears it */
  }

  .events-view { display: flex; flex-direction: column; gap: 1rem; }
  .event-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .ev-chip {
    appearance: none; border: 1px solid var(--border); background: var(--surface-2); color: var(--text);
    font-weight: 700; font-size: 0.9rem; padding: 0.5rem 0.9rem; border-radius: var(--r-pill); cursor: pointer;
    transition: background var(--dur-fast), color var(--dur-fast), box-shadow var(--dur-fast);
  }
  .ev-chip.active { background: var(--brand); color: #fff; border-color: transparent; box-shadow: var(--shadow); }

  /* Attract-mode indicator + ambient insight (kiosk) */
  .auto-pill {
    appearance: none; cursor: pointer;
    margin-left: auto; align-self: center; flex: none;
    font-size: 0.72rem; font-weight: 800; letter-spacing: 0.04em;
    padding: 0.3rem 0.7rem; border-radius: var(--r-pill);
    background: var(--up-soft); color: var(--up);
    border: 1px solid color-mix(in srgb, var(--up) 30%, transparent);
    white-space: nowrap;
  }
  .auto-pill.paused { background: var(--surface-2); color: var(--text-muted); border-color: var(--border); }
  .insight { color: color-mix(in srgb, var(--gold) 82%, white); font-weight: 700; }

  /* Spectator QR (kiosk only) — sits inline at the bottom-right, beside the ticker, so it
     reserves its own space and never overlaps the standings. The ticker flexes to fill the rest. */
  .bottom-strip.kiosk { display: flex; align-items: center; gap: 0.9rem; }
  .bottom-strip .ticker-slot { flex: 1; min-width: 0; }
  .bottom-strip .qr-slot { flex: none; }
</style>
