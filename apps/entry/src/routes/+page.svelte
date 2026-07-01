<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { contrastText, ordinal, formatClock, parseMark, validateMarkInput, markPlaceholder, markFormatHint, markInputMode } from '@mgs/ui';
  import { isDryRun, getSeasonId } from '@mgs/firebase';
  import type { Placement } from '@mgs/config-types';
  import {
    sess,
    initSession,
    claim,
    setName,
    formsForYear,
    scopedEvents,
    pendingCount,
    submittedContestIds,
    submit,
    newAttemptId,
    stationCandidates,
    clarifications,
  } from '$lib/session.svelte';
  import { appUpdate, applyUpdate } from '$lib/updates.svelte';

  const YEAR_LABEL: Record<string, string> = { Y7: 'Year 7', Y8: 'Year 8', Y9: 'Year 9', Y10: 'Year 10' };
  const dryRun = isDryRun();
  const seasonName = getSeasonId();

  let codeInput = $state('');
  let nameInput = $state('');
  let justPlaced = $state('');
  let ariaMsg = $state('');
  let confirmClear = $state(false);
  let savedContest = $state('');
  let savedAttempt = $state('');
  let saveError = $state(false);
  let placeTimer: ReturnType<typeof setTimeout> | undefined;
  let clearTimer: ReturnType<typeof setTimeout> | undefined;
  let verifyTimer: ReturnType<typeof setTimeout> | undefined;

  type Screen = 'pick-year' | 'pick-event' | 'pick-string' | 'order' | 'confirm' | 'saved';
  let wiz = $state<{ screen: Screen; year: string; eventId: string; str: string; placements: Placement[]; attemptId: string; absent: string[]; winnerMark: string; winnerName: string }>({
    screen: 'pick-year',
    year: '',
    eventId: '',
    str: '',
    placements: [],
    attemptId: '',
    absent: [],
    winnerMark: '',
    winnerName: '',
  });

  onMount(() => {
    try {
      dismissedBroadcastAt = Number(localStorage.getItem('mgs_bcast_dismissed') ?? 0) || 0;
    } catch {
      /* ignore */
    }
    const code = new URLSearchParams(window.location.search).get('code');
    void initSession(code);
  });

  // Apply a pending app update the moment the prefect is idle on the home screen — the field app
  // silently moves to the new version between races. Mid-entry we never auto-reload (it would wipe
  // a half-entered order); the banner lets them update when ready.
  $effect(() => {
    if (appUpdate.ready && wiz.screen === 'pick-year') applyUpdate();
  });
  onDestroy(() => {
    clearTimeout(placeTimer);
    clearTimeout(clearTimer);
    clearTimeout(verifyTimer);
  });

  const years = $derived(
    [...new Set(sess.forms.map((f) => f.year))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))),
  );
  const evList = $derived(scopedEvents());
  const selectedEvent = $derived(evList.find((e) => e.id === wiz.eventId));
  // Live plausibility of the winning mark (parses mm:ss too) — flags a 2-second 800m before it's sent.
  const markCheck = $derived(selectedEvent ? validateMarkInput(selectedEvent.id, wiz.winnerMark, selectedEvent.recordUnits) : null);
  // Gentle "you left the winner's name / time blank" nudge — both are optional, so it only
  // asks for a deliberate second tap; it never blocks a submit.
  const nameMissing = $derived(wiz.placements.length > 0 && String(wiz.winnerName ?? '').trim() === '');
  const markMissing = $derived(!!selectedEvent && String(wiz.winnerMark ?? '').trim() === '');
  const missingLabel = $derived(
    nameMissing && markMissing
      ? `the winner's name and the winning ${selectedEvent?.recordUnits === 'metre' ? 'distance' : 'time'}`
      : nameMissing
        ? "the winner's name"
        : markMissing
          ? `the winning ${selectedEvent?.recordUnits === 'metre' ? 'distance' : 'time'}`
          : '',
  );
  let remindBlank = $state(false);
  const yearForms = $derived(wiz.year ? formsForYear(wiz.year) : []);
  const placedIds = $derived(new Set(wiz.placements.map((p) => p.formId)));
  const pool = $derived(yearForms.filter((f) => !placedIds.has(f.id)));
  const submitted = $derived(submittedContestIds());
  const cands = $derived(stationCandidates(submitted, 4));
  const clarifs = $derived(clarifications());
  let enteredViaTap = $state(false); // came in via the suggestions banner — Back returns to the home screen

  // Human label for a specific race (year__event__string) — the slot label covers a whole slot.
  function contestLabel(cid: string): string {
    const [year, eventId, str] = cid.split('__');
    const ev = sess.events.find((e) => e.id === eventId);
    const evl = ev?.label ?? eventId;
    const yl = YEAR_LABEL[year ?? ''] ?? year ?? '';
    return ev?.isRelay ? `${evl} · ${yl}` : `${evl} · ${yl} · ${str}`;
  }
  // Tap a suggested race to jump straight into recording it (skips year/event/string picking).
  function enterContest(cid: string) {
    const [year, eventId, str] = cid.split('__');
    if (!year || !eventId || !str) return;
    if (!evList.some((e) => e.id === eventId)) return; // not in this station's scope
    enteredViaTap = true;
    wiz.year = year;
    wiz.eventId = eventId;
    wiz.str = str;
    startOrder();
  }
  const contestId = $derived(wiz.year && wiz.eventId && wiz.str ? `${wiz.year}__${wiz.eventId}__${wiz.str}` : '');
  // Confirmed only when THIS write (contest + attempt) is in the local cache — so a
  // correction (same contest id, new attempt) isn't passed off as already-saved.
  const saveConfirmed = $derived(
    !!savedContest && sess.mySubmissions.some((s) => s.contestId === savedContest && s.clientSubmissionId === savedAttempt),
  );
  const lastPlaced = $derived(wiz.placements.at(-1)?.formId ?? '');

  // Each unplaced form on the review screen must be acknowledged as "didn't run" (or added back
  // via Edit) — this catches a forgotten tap WITHOUT altering the submission or scoring (unplaced
  // still = absent = 0). `wiz.absent` is purely a confirm-screen acknowledgement.
  const absentSet = $derived(new Set(wiz.absent));
  const acked = $derived(pool.filter((f) => absentSet.has(f.id)));
  const unacked = $derived(pool.filter((f) => !absentSet.has(f.id)));
  function toggleAbsent(id: string) {
    wiz.absent = absentSet.has(id) ? wiz.absent.filter((x) => x !== id) : [...wiz.absent, id];
  }

  // Venue map overlay — static reference image for finding your way round the field.
  let showMap = $state(false);
  // Results saved on this phone but not yet synced to the tent — surfaced via the sync pill/sheet.
  let showSync = $state(false);
  const pendingList = $derived(sess.mySubmissions.filter((s) => s.pending));

  // Results-tent broadcast: a prominent banner until dismissed. Dismissal is per-message (keyed
  // on its `at` id, remembered locally) so a NEWER message from the tent re-appears.
  let dismissedBroadcastAt = $state(0);
  const activeBroadcast = $derived(
    sess.broadcast?.active && sess.broadcast.message && (sess.broadcast.at ?? 0) > dismissedBroadcastAt ? sess.broadcast : null,
  );
  function dismissBroadcast() {
    const at = sess.broadcast?.at ?? 0;
    dismissedBroadcastAt = at;
    try {
      localStorage.setItem('mgs_bcast_dismissed', String(at));
    } catch {
      /* ignore */
    }
  }

  function pickYear(y: string) {
    enteredViaTap = false;
    wiz.year = y;
    if (evList.length === 1) {
      pickEvent(evList[0]!.id);
    } else {
      wiz.screen = 'pick-event';
    }
  }
  function pickEvent(id: string) {
    wiz.eventId = id;
    const ev = evList.find((e) => e.id === id);
    if (ev && ev.strings.length === 1) {
      wiz.str = ev.strings[0]!;
      startOrder();
    } else {
      wiz.screen = 'pick-string';
    }
  }
  function pickString(s: string) {
    wiz.str = s;
    startOrder();
  }
  function startOrder() {
    wiz.placements = [];
    wiz.absent = [];
    wiz.winnerMark = '';
    wiz.winnerName = '';
    remindBlank = false;
    wiz.attemptId = newAttemptId();
    wiz.screen = 'order';
  }
  function addForm(formId: string) {
    wiz.placements = [...wiz.placements, { formId, position: wiz.placements.length + 1 }];
    const pos = wiz.placements.length;
    navigator.vibrate?.(15); // a confident tick under glove/sun
    justPlaced = formId;
    clearTimeout(placeTimer);
    placeTimer = setTimeout(() => (justPlaced = ''), 650);
    ariaMsg = `${label(formId)} placed ${ordinal(pos)}. ${pos} of ${yearForms.length} placed.`;
    confirmClear = false;
  }
  function removeAt(i: number) {
    wiz.placements = wiz.placements.filter((_, idx) => idx !== i).map((p, idx) => ({ ...p, position: idx + 1 }));
  }
  function undo() {
    wiz.placements = wiz.placements.slice(0, -1);
  }
  function clearAll() {
    // Two-tap guard: one stray glove-tap shouldn't wipe a finishing order.
    if (!confirmClear) {
      confirmClear = true;
      clearTimeout(clearTimer);
      clearTimer = setTimeout(() => (confirmClear = false), 2500);
      return;
    }
    confirmClear = false;
    wiz.placements = [];
  }
  // Remind once if the winner's name or mark is blank — a second tap sends it anyway.
  function attemptSubmit() {
    if (!remindBlank && (nameMissing || markMissing)) {
      remindBlank = true;
      return;
    }
    doSubmit();
  }
  function doSubmit() {
    if (!contestId || !wiz.placements.length) return;
    saveError = false;
    savedContest = contestId;
    savedAttempt = wiz.attemptId;
    // Parse the winning mark to a stored number (seconds/metres). parseMark accepts mm:ss for
    // track times too, and returns null for blank/garbage, so the optional mark can't crash submit.
    const winnerMark = parseMark(wiz.winnerMark, selectedEvent?.recordUnits ?? 'second');
    // The winner's name rides along on the 1st-place placement (athleteName) — it persists
    // through the commit and is shown to the results tent. Capped to match validatePlacements.
    const winnerName = String(wiz.winnerName ?? '').trim().slice(0, 60);
    const placements = winnerName
      ? wiz.placements.map((p, i) => (i === 0 ? { ...p, athleteName: winnerName } : p))
      : wiz.placements;
    submit({ contestId, year: wiz.year, event: wiz.eventId, string: wiz.str }, placements, wiz.attemptId, winnerMark);
    wiz.screen = 'saved';
    clearTimeout(verifyTimer);
    const c = contestId;
    const a = wiz.attemptId;
    verifyTimer = setTimeout(() => {
      // This exact write (contest + attempt) should have surfaced in the local cache by now,
      // even offline. If not — or it hard-rejected — tell the prefect rather than fake success.
      const landed = sess.mySubmissions.some((s) => s.contestId === c && s.clientSubmissionId === a);
      if (sess.lastWriteError || !landed) saveError = true;
    }, 6000);
  }
  function resetSave() {
    clearTimeout(verifyTimer);
    savedContest = '';
    savedAttempt = '';
    saveError = false;
  }
  function another() {
    resetSave();
    enteredViaTap = false;
    remindBlank = false;
    wiz = { screen: 'pick-year', year: '', eventId: '', str: '', placements: [], attemptId: '', absent: [], winnerMark: '', winnerName: '' };
  }
  function correction() {
    resetSave();
    enteredViaTap = false;
    remindBlank = false;
    wiz.placements = [];
    wiz.absent = [];
    wiz.winnerMark = '';
    wiz.winnerName = '';
    wiz.attemptId = newAttemptId();
    wiz.screen = 'order';
  }
  function changeNameScreen() {
    nameInput = sess.prefectName;
    sess.phase = 'need-name';
  }
  function cancelName() {
    if (sess.prefectName) sess.phase = 'ready'; // only first-run has no existing name
  }
  function label(formId: string): string {
    return sess.forms.find((f) => f.id === formId)?.label ?? formId;
  }
  function colour(formId: string): string {
    return sess.forms.find((f) => f.id === formId)?.colour ?? '#64748b';
  }
  function back(to: Screen) {
    remindBlank = false;
    wiz.screen = to;
  }
</script>

{#if dryRun}
  <div class="dryrun-banner">⚠ DRY RUN — “{seasonName}” · practice mode, results won't count</div>
{/if}
{#if sess.phase === 'loading'}
  <div class="center-screen"><p class="muted">Getting ready…</p></div>
{:else if sess.phase === 'need-code'}
  <div class="center-screen">
    <div class="card" style="padding:1.5rem; width:100%; max-width:420px; display:flex; flex-direction:column; gap:1rem;">
      <h1 style="font-size:1.4rem;">Results Entry</h1>
      {#if sess.sessionExpired}
        <p class="err" style="margin:0;">Your station sign-in expired on this device. Re-scan your QR code or re-enter your access code to carry on.</p>
      {/if}
      <p class="muted">Scan your station's QR code, or type the access code from your sheet.</p>
      <div class="field">
        <label for="code">Access code</label>
        <input id="code" bind:value={codeInput} autocapitalize="characters" autocomplete="off" placeholder="e.g. 7K2QPM" />
      </div>
      {#if sess.error}<p class="err">{sess.error}</p>{/if}
      <button class="btn btn-primary btn-lg btn-block" onclick={() => claim(codeInput)}>Continue</button>
    </div>
  </div>
{:else if sess.phase === 'claiming'}
  <div class="center-screen"><p class="muted">Checking access code…</p></div>
{:else if sess.phase === 'need-name'}
  <div class="center-screen">
    <div class="card" style="padding:1.5rem; width:100%; max-width:420px; display:flex; flex-direction:column; gap:1rem;">
      <h1 style="font-size:1.4rem;">What's your name?</h1>
      <p class="muted">Your <b>full name</b> is attached to every result you enter, so the results tent can contact you if there's a query about the data. This is required.</p>
      <div class="field">
        <label for="name">Your full name</label>
        <input
          id="name"
          bind:value={nameInput}
          autocomplete="name"
          autocapitalize="words"
          placeholder="e.g. Aisha Patel"
          onkeydown={(e) => { if (e.key === 'Enter' && nameInput.trim().length >= 2) setName(nameInput); }}
        />
      </div>
      <button class="btn btn-primary btn-lg btn-block" disabled={nameInput.trim().length < 2} onclick={() => setName(nameInput)}>
        Start
      </button>
      {#if sess.prefectName}
        <button class="btn btn-block" onclick={cancelName}>Cancel</button>
      {/if}
    </div>
  </div>
{:else}
  <!-- READY -->
  <div class="app">
    <div class="statusbar">
      <span class="station">📍 {sess.station?.areaCode ?? 'Station'}</span>
      <span class="spacer"></span>
      <button class="pill map pill-btn" onclick={() => (showMap = true)}>🗺 Map</button>
      {#if pendingCount() > 0}
        <button class="pill sync pill-btn" onclick={() => (showSync = true)}>↻ {pendingCount()} to sync</button>
      {/if}
      {#if sess.online}
        <span class="pill online">● Online</span>
      {:else}
        <span class="pill offline">● Offline</span>
      {/if}
    </div>
    <span class="sr-only" role="status" aria-live="polite">{ariaMsg}</span>

    {#if appUpdate.ready && wiz.screen !== 'pick-year'}
      <button class="update-banner" onclick={applyUpdate}>🔄 A new version is ready — tap to update</button>
    {/if}

    {#if activeBroadcast}
      <div class="broadcast" role="alert">
        <span class="bc-icon" aria-hidden="true">📢</span>
        <div class="bc-text">
          <div class="bc-msg">{activeBroadcast.message}</div>
          <div class="bc-from">— {activeBroadcast.byName || 'Results tent'}</div>
        </div>
        <button class="bc-dismiss" onclick={dismissBroadcast}>Got it ✕</button>
      </div>
    {/if}

    {#if wiz.screen === 'pick-year'}
      <div class="step">
        {#if pendingCount() > 0}
          <button class="unsynced-banner" class:off={!sess.online} onclick={() => (showSync = true)}>
            ↻ {pendingCount()} result{pendingCount() === 1 ? '' : 's'} not yet sent{sess.online ? ' — sending…' : ' — stay near signal'}
          </button>
        {/if}
        {#if clarifs.length}
          <div class="clarify-card">
            <div class="clarify-head">❓ The results tent has {clarifs.length === 1 ? 'a question' : 'questions'}</div>
            {#each clarifs as c (c.contestId)}
              <button class="clarify-row" onclick={() => enterContest(c.contestId)}>
                <span class="clarify-lab">{contestLabel(c.contestId)}</span>
                <span class="clarify-msg">“{c.message}”</span>
                <span class="clarify-foot"><span class="clarify-by">— {c.byName}</span><span class="clarify-go">Re-check &amp; resend →</span></span>
              </button>
            {/each}
          </div>
        {/if}
        {#if cands.items.length && evList.length}
          <div class="nn-card">
            <div class="nn-head">⏱ Your station — tap the race you're recording</div>
            {#each cands.items as c (c.contestId)}
              <button class="nn-row" class:near={c.near} onclick={() => enterContest(c.contestId)}>
                <span class="nn-tag" class:now={c.near}>
                  {#if c.near}<span class="nn-dot"></span>{/if}{formatClock(c.time + cands.offset)}
                </span>
                <span class="nn-lab">{contestLabel(c.contestId)}</span>
                <span class="nn-go">Enter →</span>
              </button>
            {/each}
            <div class="nn-foot">Running ahead or behind? These are just the nearest few — if yours isn't here, pick it from the menu below.</div>
          </div>
        {/if}
        <h2 class="step-title">Which year group?</h2>
        {#if !years.length}
          <p class="muted">Loading event data…</p>
        {/if}
        <div class="choice-grid">
          {#each years as y}
            <button class="choice" onclick={() => pickYear(y)}>{YEAR_LABEL[y] ?? y}</button>
          {/each}
        </div>
        <p class="muted" style="text-align:center;">Signed in as {sess.prefectName}</p>
        <div style="display:flex; gap:0.5rem; align-self:center;">
          <button class="btn btn-ghost" style="padding:0.5rem 0.9rem;" onclick={changeNameScreen}>change name</button>
        </div>
      </div>
    {:else if wiz.screen === 'pick-event'}
      <div class="step">
        <h2 class="step-title">Which event?</h2>
        <p class="step-sub">{YEAR_LABEL[wiz.year] ?? wiz.year}</p>
        <div class="choice-grid">
          {#each evList as e}
            <button class="choice" onclick={() => pickEvent(e.id)}>{e.label}</button>
          {/each}
        </div>
        <div class="actionbar"><button class="btn btn-block" onclick={() => back('pick-year')}>← Back</button></div>
      </div>
    {:else if wiz.screen === 'pick-string'}
      <div class="step">
        <h2 class="step-title">Which race?</h2>
        <p class="step-sub">{YEAR_LABEL[wiz.year] ?? wiz.year} · {selectedEvent?.label}</p>
        <div class="choice-grid cols-3">
          {#each selectedEvent?.strings ?? [] as s}
            {@const done = submitted.has(`${wiz.year}__${wiz.eventId}__${s}`)}
            <button class="choice" onclick={() => pickString(s)}>
              {s}
              <span class="sublabel">{s} race</span>
              {#if done}<span class="done-badge">✓ sent</span>{/if}
            </button>
          {/each}
        </div>
        <div class="actionbar"><button class="btn btn-block" onclick={() => back(evList.length === 1 ? 'pick-year' : 'pick-event')}>← Back</button></div>
      </div>
    {:else if wiz.screen === 'order'}
      <div class="step">
        <h2 class="step-title">Finishing order</h2>
        <p class="step-sub">{YEAR_LABEL[wiz.year] ?? wiz.year} · {selectedEvent?.label} · {wiz.str} race</p>
        {#if submitted.has(contestId)}
          <p class="pill sync" style="align-self:flex-start;">⚠ Already submitted — this will replace it</p>
        {/if}

        <p class="progress-pill">Placed {wiz.placements.length} of {yearForms.length}</p>

        {#if pool.length}
          <p class="muted" style="margin-bottom:-0.3rem;">Tap forms in the order they finished:</p>
        {:else}
          <p class="muted" style="text-align:center;">All forms placed 🎉</p>
        {/if}
        <!-- Stable board: every form keeps its slot; placed ones become a dimmed ghost
             showing where they finished. The pool sits ABOVE the running order so placing a
             form grows the list below it — the tap targets never shift under your thumb. -->
        <div class="pool">
          {#each yearForms as f (f.id)}
            {@const placedPos = wiz.placements.find((p) => p.formId === f.id)?.position}
            {#if placedPos}
              <div class="formbtn ghost" class:flash={justPlaced === f.id} aria-label="{f.label} placed {ordinal(placedPos)}">
                <span class="ghost-pos">{ordinal(placedPos)}</span>
                <span class="ghost-label">{f.label}</span>
              </div>
            {:else}
              <button
                class="formbtn"
                style="background:{f.colour}; color:{contrastText(f.colour)}"
                onclick={() => addForm(f.id)}
              >{f.label}</button>
            {/if}
          {/each}
        </div>

        {#if wiz.placements.length}
          <div class="placed compact">
            {#each wiz.placements as p, i (p.formId)}
              <div class="placed-row" class:flash={justPlaced === p.formId}>
                <span class="pos">{ordinal(p.position)}</span>
                <span class="pchip" style="background:{colour(p.formId)}; color:{contrastText(colour(p.formId))}">{label(p.formId)}</span>
                <button class="remove" aria-label="Remove {label(p.formId)}" onclick={() => removeAt(i)}>✕</button>
              </div>
            {/each}
          </div>
        {/if}

        <div class="actionbar">
          {#if wiz.placements.length}
            <button class="btn undo-btn" onclick={undo}>↩ Undo {label(lastPlaced)}</button>
            <button class="btn" class:armed={confirmClear} onclick={clearAll}>{confirmClear ? 'Tap again' : 'Clear'}</button>
          {:else}
            <button class="btn btn-block" onclick={() => back(enteredViaTap ? 'pick-year' : 'pick-string')}>← Back</button>
          {/if}
          <button class="btn btn-primary" style="flex:1;" disabled={!wiz.placements.length} onclick={() => back('confirm')}>Review →</button>
        </div>
      </div>
    {:else if wiz.screen === 'confirm'}
      <div class="step">
        <h2 class="step-title">Check &amp; submit</h2>
        <p class="step-sub">{YEAR_LABEL[wiz.year] ?? wiz.year} · {selectedEvent?.label} · {wiz.str} race</p>
        <div class="placed">
          {#each wiz.placements as p}
            <div class="placed-row" style="grid-template-columns: 3.4rem 1fr;">
              <span class="pos">{ordinal(p.position)}</span>
              <span><span class="pchip" style="background:{colour(p.formId)}; color:{contrastText(colour(p.formId))}">{label(p.formId)}</span></span>
            </div>
          {/each}
        </div>
        {#if pool.length}
          <div class="warn-card" class:resolved={unacked.length === 0}>
            {#if unacked.length}
              <b>{unacked.length} of {yearForms.length} forms not placed.</b><br />
              Tap any that <b>didn't run</b>, or Edit to add a forgotten one.
            {:else}
              <b>All forms accounted for.</b> {acked.length} marked as didn't run.
            {/if}
            <div class="leftovers">
              {#each pool as f (f.id)}
                <button type="button" class="leftover" class:acked={absentSet.has(f.id)} onclick={() => toggleAbsent(f.id)}>
                  <span class="lo-chip" style="background:{colour(f.id)}; color:{contrastText(colour(f.id))}">{f.label}</span>
                  <span class="lo-state">{absentSet.has(f.id) ? "✓ didn't run" : "didn't run?"}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
        {#if selectedEvent}
          <div class="mark-field">
            <label for="winmark">
              Winning {selectedEvent.recordUnits === 'metre' ? 'distance' : 'time'}
              <span class="opt">— optional, for record checking</span>
            </label>
            <p class="mark-format">{markFormatHint(selectedEvent.id, selectedEvent.recordUnits)}</p>
            <input
              id="winmark"
              type="text"
              inputmode={markInputMode(selectedEvent.id, selectedEvent.recordUnits)}
              placeholder={markPlaceholder(selectedEvent.id, selectedEvent.recordUnits)}
              bind:value={wiz.winnerMark}
            />
            {#if markCheck && !markCheck.empty && markCheck.level !== 'ok'}
              <p class="mark-warn {markCheck.level}">{markCheck.level === 'unusual' ? '⚠️' : '🚫'} {markCheck.message}</p>
            {:else if wiz.placements[0]}
              <p class="mark-hint">The winner's mark — {label(wiz.placements[0].formId)}.</p>
            {/if}
          </div>
        {/if}
        {#if wiz.placements[0]}
          <div class="mark-field">
            <label for="winname">
              Winner's name
              <span class="opt">— optional, shown to the results tent</span>
            </label>
            <input
              id="winname"
              type="text"
              autocapitalize="words"
              autocomplete="off"
              placeholder="e.g. Aisha Patel"
              bind:value={wiz.winnerName}
            />
            <p class="mark-hint">The student who came 1st — {label(wiz.placements[0].formId)}.</p>
          </div>
        {/if}
        {#if remindBlank && missingLabel}
          <div class="blank-remind">
            💡 You haven't added <b>{missingLabel}</b>. Add it above if you have it — or tap <b>Submit anyway</b> to send without it.
          </div>
        {/if}
        <div class="actionbar">
          <button class="btn" onclick={() => back('order')}>← Edit</button>
          <button class="btn btn-primary" style="flex:1;" onclick={attemptSubmit}>
            {remindBlank && missingLabel ? 'Submit anyway' : 'Submit result'}
          </button>
        </div>
      </div>
    {:else if wiz.screen === 'saved'}
      <div class="step">
        {#if saveError}
          <div class="saved-hero error">
            <div class="tick">⚠️</div>
            <h2 class="step-title">Couldn't confirm save</h2>
            <p class="muted">{sess.lastWriteError || 'This result may not have saved on your phone.'} Please try again.</p>
          </div>
          <button class="btn btn-primary btn-lg btn-block" onclick={() => back('confirm')}>← Back &amp; try again</button>
        {:else}
          <div class="saved-hero">
            <div class="tick">✅</div>
            <h2 class="step-title">Saved!</h2>
            {#if !saveConfirmed}
              <p class="muted">Saving on your phone…</p>
            {:else if sess.online}
              <p class="muted">Saved &amp; sent to the results tent.</p>
            {:else}
              <p class="muted">Saved on your phone — it'll sync automatically when you're back in signal.</p>
            {/if}
            <p class="step-sub">{YEAR_LABEL[wiz.year] ?? wiz.year} · {selectedEvent?.label} · {wiz.str} race</p>
          </div>
          <div class="placed receipt">
            {#each wiz.placements as p (p.formId)}
              <div class="placed-row" style="grid-template-columns: 3.4rem 1fr;">
                <span class="pos">{ordinal(p.position)}</span>
                <span><span class="pchip" style="background:{colour(p.formId)}; color:{contrastText(colour(p.formId))}">{label(p.formId)}</span></span>
              </div>
            {/each}
          </div>
          <button class="btn btn-primary btn-lg btn-block" onclick={another}>Enter another result</button>
          <button class="btn btn-block" onclick={correction}>Submit a correction to this race</button>
          {#if pendingCount() > 0 && !sess.online}
            <p class="muted" style="text-align:center;">↻ {pendingCount()} result{pendingCount() === 1 ? '' : 's'} waiting — find signal before you leave the field.</p>
          {/if}
        {/if}
      </div>
    {/if}

    {#if showSync}
      <button class="sheet-scrim" aria-label="Close" onclick={() => (showSync = false)}></button>
      <div class="sync-sheet" role="dialog" aria-label="Results waiting to sync">
        <h3>↻ {pendingList.length} result{pendingList.length === 1 ? '' : 's'} waiting to send</h3>
        {#if sess.online}
          <p class="muted">You're online — these should send any moment. Keep the app open until the count clears.</p>
        {:else}
          <p class="muted">You're offline. These are saved safely on your phone and will send the moment you're back in signal — please stay near the field until they do.</p>
        {/if}
        {#if pendingList.length}
          <ul class="sync-list">
            {#each pendingList as s (s.contestId + s.clientSubmissionId)}
              <li>{contestLabel(s.contestId)}</li>
            {/each}
          </ul>
        {:else}
          <p class="muted">✓ Everything's synced.</p>
        {/if}
        <button class="btn btn-primary btn-block" onclick={() => (showSync = false)}>Close</button>
      </div>
    {/if}

    {#if showMap}
      <div class="map-overlay" role="dialog" aria-label="Venue map">
        <div class="map-bar">
          <span class="map-title">📍 Venue map</span>
          <span class="spacer"></span>
          <a class="btn btn-ghost map-act" href="/venue-map.webp" target="_blank" rel="noopener">Full size ↗</a>
          <button class="btn map-act" onclick={() => (showMap = false)}>✕ Close</button>
        </div>
        <div class="map-scroll">
          <img src="/venue-map.webp" alt="Sports Day venue map showing the track, field events, the hub, refreshments, first aid and toilets." />
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Results-tent clarification request — bounce a sent-back race back into the wizard. */
  .clarify-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: #fffbeb;
    border: 1px solid #fbbf24;
    border-radius: 14px;
    padding: 0.8rem;
    margin-bottom: 1rem;
    box-shadow: 0 4px 14px rgba(180, 83, 9, 0.1);
  }
  .clarify-head {
    font-size: 0.82rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #b45309;
  }
  .clarify-row {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    width: 100%;
    text-align: left;
    appearance: none;
    cursor: pointer;
    border: 1px solid #fcd34d;
    border-radius: 11px;
    background: #fff;
    padding: 0.7rem 0.8rem;
  }
  .clarify-row:active { transform: scale(0.99); }
  .clarify-lab { font-weight: 800; font-size: 1rem; color: #0f172a; }
  .clarify-msg { font-size: 0.92rem; color: #78350f; font-style: italic; }
  .clarify-foot { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; flex-wrap: wrap; }
  .clarify-by { font-size: 0.78rem; color: #92400e; }
  .clarify-go { font-weight: 800; font-size: 0.85rem; color: #b45309; white-space: nowrap; }

  .nn-card {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    background: #fff;
    border: 1px solid #e3e8f0;
    border-radius: 14px;
    padding: 0.7rem;
    margin-bottom: 1rem;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
  }
  .nn-head {
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #64748b;
  }
  .nn-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    text-align: left;
    appearance: none;
    cursor: pointer;
    border: 1px solid #e3e8f0;
    border-radius: 11px;
    background: #f8fafc;
    padding: 0.6rem 0.7rem;
    min-height: 3rem;
  }
  .nn-row:active { transform: scale(0.99); }
  .nn-row.near { border-color: #16a34a; background: #f0fdf4; }
  .nn-foot { font-size: 0.78rem; color: #64748b; text-align: center; padding: 0.1rem 0.2rem 0; line-height: 1.35; }
  .nn-tag {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #64748b;
    min-width: 4.4rem;
  }
  .nn-tag.now { color: #16a34a; }
  .nn-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: #ef4444;
    animation: nnpulse 1.6s infinite;
  }
  .nn-lab {
    flex: 1;
    font-weight: 800;
    font-size: 1rem;
    color: #0f172a;
    min-width: 0;
  }
  .nn-go {
    flex: none;
    font-weight: 800;
    font-size: 0.85rem;
    color: #2563eb;
    white-space: nowrap;
  }
  @keyframes nnpulse {
    0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
    70% { box-shadow: 0 0 0 0.4rem rgba(239, 68, 68, 0); }
    100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .nn-dot { animation: none; }
  }

  /* Tappable sync pill + unsynced banner + waiting-to-sync sheet */
  .pill-btn { appearance: none; cursor: pointer; font: inherit; }
  .unsynced-banner {
    appearance: none; cursor: pointer; width: 100%; text-align: center;
    border: 1px solid #fbbf24; background: #fffbeb; color: #92400e;
    font-weight: 800; font-size: 0.9rem; border-radius: 12px; padding: 0.6rem 0.8rem; margin-bottom: 0.8rem;
  }
  .unsynced-banner.off { border-color: #f59e0b; background: #fef3c7; }
  .sheet-scrim { position: fixed; inset: 0; border: 0; background: rgba(8, 15, 30, 0.5); z-index: 199; }
  .sync-sheet {
    position: fixed; z-index: 200; left: 50%; bottom: 0; transform: translateX(-50%);
    width: min(460px, 100vw); background: #fff; color: #0f172a;
    border-radius: 16px 16px 0 0; padding: 1.1rem 1.2rem calc(1.1rem + env(safe-area-inset-bottom));
    display: flex; flex-direction: column; gap: 0.7rem; box-shadow: 0 -8px 30px rgba(15, 23, 42, 0.25);
  }
  .sync-sheet h3 { font-size: 1.1rem; }
  .sync-list { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.3rem; font-weight: 600; }

  /* "Didn't run" acknowledgement on the review screen */
  .warn-card.resolved { border-color: #86efac; background: #f0fdf4; color: #14532d; }
  .leftovers { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.6rem; }
  .leftover {
    appearance: none; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem;
    border: 1px dashed #cbd5e1; background: #fff; border-radius: 999px; padding: 0.25rem 0.55rem 0.25rem 0.3rem;
  }
  .leftover.acked { border-style: solid; border-color: #86efac; background: #f0fdf4; }
  .lo-chip { font-weight: 800; font-size: 0.82rem; padding: 0.1rem 0.45rem; border-radius: 7px; }
  .lo-state { font-size: 0.78rem; font-weight: 700; color: #64748b; }
  .leftover.acked .lo-state { color: #16a34a; }

  /* Winning time/distance input on the review screen */
  .mark-field { display: flex; flex-direction: column; gap: 0.35rem; }
  .mark-field label { font-weight: 700; font-size: 0.92rem; }
  .mark-field .opt { font-weight: 500; color: #64748b; font-size: 0.8rem; }
  .mark-field input {
    padding: 0.65rem 0.7rem; font-size: 1.1rem; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; color: #0f172a;
  }
  .mark-hint { font-size: 0.78rem; color: #64748b; margin: 0; }
  .mark-format { font-size: 0.82rem; color: #475569; margin: 0; font-weight: 600; }
  .mark-warn { font-size: 0.82rem; font-weight: 700; margin: 0; padding: 0.4rem 0.6rem; border-radius: 8px; }
  .mark-warn.unusual { background: #fef3c7; color: #92400e; }
  .mark-warn.impossible, .mark-warn.invalid { background: #fee2e2; color: #b91c1c; }
  .blank-remind {
    background: #fffbeb; border: 1px solid #fcd34d; color: #92400e;
    font-size: 0.88rem; border-radius: 12px; padding: 0.7rem 0.85rem; line-height: 1.4;
  }

  /* Results-tent broadcast banner — deliberately loud so an urgent field message can't be missed. */
  .broadcast {
    display: flex; align-items: flex-start; gap: 0.6rem;
    background: #fef3c7; border: 2px solid #f59e0b; color: #7c2d12;
    border-radius: 14px; padding: 0.8rem 0.9rem; margin-bottom: 0.9rem;
    box-shadow: 0 6px 18px rgba(180, 83, 9, 0.15);
  }
  .bc-icon { font-size: 1.3rem; line-height: 1.2; flex: none; }
  .bc-text { flex: 1; min-width: 0; }
  .bc-msg { font-weight: 800; font-size: 1.02rem; line-height: 1.35; overflow-wrap: anywhere; }
  .bc-from { font-size: 0.78rem; color: #92400e; margin-top: 0.2rem; }
  .bc-dismiss {
    appearance: none; cursor: pointer; flex: none; align-self: center;
    border: 1px solid #f59e0b; background: #fff; color: #92400e;
    font-weight: 800; font-size: 0.8rem; border-radius: 999px; padding: 0.45rem 0.7rem; white-space: nowrap;
  }

  /* "New version ready" pill — shown mid-entry (idle at home it auto-applies instead). */
  .update-banner {
    appearance: none; cursor: pointer; width: 100%; text-align: center;
    border: 1px solid #93c5fd; background: #eff6ff; color: #1e40af;
    font-weight: 800; font-size: 0.88rem; border-radius: 12px; padding: 0.6rem 0.8rem; margin-bottom: 0.9rem;
  }

  /* Venue map: a tappable pill in the status bar opens a full-screen overlay. */
  .pill.map { background: var(--surface-2); color: var(--text-muted); }
  .map-overlay {
    position: fixed;
    inset: 0;
    z-index: 210;
    background: #fff;
    display: flex;
    flex-direction: column;
  }
  .map-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: calc(0.6rem + env(safe-area-inset-top)) max(0.8rem, env(safe-area-inset-right)) 0.6rem
      max(0.8rem, env(safe-area-inset-left));
    border-bottom: 1px solid var(--border);
    background: #fff;
  }
  .map-bar .map-title { font-weight: 800; }
  .map-bar .spacer { flex: 1; }
  .map-bar .map-act { min-height: 40px; padding: 0.4rem 0.7rem; font-size: 0.9rem; }
  .map-scroll {
    flex: 1;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    background: #eef2f9;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .map-scroll img { display: block; width: 100%; height: auto; }
</style>
