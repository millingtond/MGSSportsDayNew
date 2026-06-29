<script lang="ts">
  import { onMount } from 'svelte';
  import { data } from '$lib/data.svelte';
  import { setControl, seedSeason, recomputeStandings } from '$lib/api';
  import { toast, errMessage } from '$lib/toast.svelte';
  import { confirm } from '$lib/confirm.svelte';
  import { YEAR_ORDER, YEAR_META } from '$lib/helpers';
  import { exportStandingsCsv, exportArchiveJson } from '$lib/export';
  import { backup, backupNow, setAutoBackup } from '$lib/backup.svelte';
  import { getSeasonId } from '@mgs/firebase';
  import type { DisplayMode } from '@mgs/config-types';

  const seasonName = getSeasonId();

  const std = $derived(data.standings);
  const progress = $derived(std?.progress ?? { committed: 0, total: 0, void: 0 });
  const pct = $derived(progress.total ? Math.round((progress.committed / progress.total) * 100) : 0);
  const outstanding = $derived(data.contests.filter((c) => c.status === 'outstanding').length);
  const pending = $derived(data.submissions.length);
  const recordsBroken = $derived(std?.records?.broken?.length ?? 0);
  const mode = $derived(data.control?.mode ?? 'live');

  // Standings freshness: the board recomputes after every commit, but surface the rare case
  // where a commit landed yet the recompute didn't — with a visible signal + a manual lever.
  const computedAt = $derived(std?.computedAt ?? 0);
  const newestCommit = $derived(
    Math.max(0, ...data.contests.filter((c) => c.status === 'committed' && c.committedAt != null).map((c) => c.committedAt as number)),
  );
  const standingsStale = $derived(!!std && newestCommit > computedAt + 1500);
  let nowMs = $state(Date.now());
  let recomputing = $state(false);
  onMount(() => {
    const t = setInterval(() => (nowMs = Date.now()), 5000);
    return () => clearInterval(t);
  });
  function ago(ms: number): string {
    const s = Math.max(0, Math.round((nowMs - ms) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
  }
  async function doRecompute() {
    recomputing = true;
    try {
      await recomputeStandings();
      toast.success('Standings recomputed.');
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      recomputing = false;
    }
  }

  let message = $state('');
  let busy = $state(false);
  let seeding = $state(false);

  async function doBackup() {
    try {
      const n = await backupNow();
      toast.success(`Backed up ${n} submission${n === 1 ? '' : 's'} to this device.`);
    } catch (e) {
      toast.error(errMessage(e));
    }
  }

  function backupClock(ms: number): string {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  async function initSeason() {
    seeding = true;
    try {
      const r = await seedSeason(false);
      toast.success(`Season ready: ${r.forms} forms, ${r.contests} contests, ${r.records} records loaded.`);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      seeding = false;
    }
  }

  // Seed the editable suspense message from control when it loads / changes.
  let lastSeen: string | null = null;
  $effect(() => {
    const m = data.control?.message ?? '';
    if (m !== lastSeen) {
      lastSeen = m;
      if (!message) message = m;
    }
  });

  const modeMeta: Record<DisplayMode, { label: string; desc: string; cls: string }> = {
    live: { label: 'Live', desc: 'The public scoreboard updates in real time.', cls: 'live' },
    suspense: { label: 'Suspense', desc: 'Results are hidden behind a holding screen.', cls: 'suspense' },
    revealed: { label: 'Revealed', desc: 'The champion reveal animation is playing.', cls: 'revealed' },
  };

  async function setMode(next: DisplayMode) {
    const labels: Record<DisplayMode, string> = {
      live: 'Go Live',
      suspense: 'switch to Suspense (hide results from the audience)',
      revealed: 'Reveal Champions to the whole audience',
    };
    const ok = await confirm({
      title: `${next === 'revealed' ? 'Reveal Champions' : next === 'suspense' ? 'Hide results' : 'Go Live'}?`,
      message: `This changes the PUBLIC scoreboard for everyone watching — it will ${labels[next]}.`,
      confirmLabel: 'Yes, do it',
      danger: next === 'revealed',
    });
    if (!ok) return;
    busy = true;
    try {
      await setControl({ mode: next, message: message.trim() || null });
      toast.success(`Public display set to ${modeMeta[next].label}.`);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      busy = false;
    }
  }

  const revealScope = $derived(data.control?.revealScope ?? null);
  const stagedYear = $derived(mode === 'revealed' && revealScope ? (YEAR_META[revealScope]?.label ?? revealScope) : null);

  // Staged finale: each year-click reveals one more year (no confirm — it's a live ceremony).
  // The final "Champions" step reveals the OVERALL winner, so it gets a confirm of its own.
  async function setReveal(scope: string | null) {
    if (scope === null) {
      const ok = await confirm({
        title: 'Reveal the OVERALL champion?',
        message: 'This shows the Whole-School champion on the public board — the grand finale. Make sure the year winners have been announced first.',
        confirmLabel: 'Reveal champions',
        danger: true,
      });
      if (!ok) return;
    }
    busy = true;
    try {
      await setControl({ mode: 'revealed', message: message.trim() || null, revealScope: scope });
      toast.success(scope ? `Revealed ${YEAR_META[scope]?.label ?? scope}.` : '🏆 Champions revealed!');
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      busy = false;
    }
  }

  async function saveMessage() {
    busy = true;
    try {
      // Preserve the live reveal stage — never collapse a staged finale to a full reveal.
      await setControl({ mode, message: message.trim() || null, revealScope: data.control?.revealScope ?? null });
      toast.success('Suspense message saved.');
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      busy = false;
    }
  }
</script>

<div class="page-head">
  <div>
    <h2>Dashboard</h2>
    <div class="lede">Live overview of the {data.config?.label ?? 'season'}.</div>
  </div>
</div>

{#if data.ready && !data.config}
  <section class="card setup-card">
    <div class="section-title">🌱 Set up the “{seasonName}” season</div>
    <p class="muted">
      This season hasn't been initialised yet. This loads the 32 forms, 11 events, 100 contests and 44 records
      (the 2025 structure as a starting point — you can edit the Year&nbsp;9/10 roster afterwards on the Config page).
    </p>
    <button class="btn btn-primary btn-lg" disabled={seeding} onclick={initSeason}>
      {seeding ? 'Setting up…' : `Initialise “${seasonName}” season`}
    </button>
  </section>
{/if}

<!-- Display control: the prominent kill switch -->
<section class="card control-card {modeMeta[mode].cls}">
  <div class="control-head">
    <div>
      <div class="section-title">📺 Public display control</div>
      <p class="now">
        Currently <b>{modeMeta[mode].label}</b> —
        {#if stagedYear}<span class="muted">revealing up to <b>{stagedYear}</b>; the overall champion is still sealed.</span>
        {:else}<span class="muted">{modeMeta[mode].desc}</span>{/if}
      </p>
    </div>
    <span class="mode-pill {modeMeta[mode].cls}">{modeMeta[mode].label}</span>
  </div>

  <div class="control-btns">
    <button class="btn btn-lg mode-btn live" class:is-current={mode === 'live'} disabled={busy || mode === 'live'} onclick={() => setMode('live')}>
      {mode === 'live' ? '✓ Live now' : '▶ Back to Live'}
    </button>
    <button class="btn btn-lg mode-btn suspense" class:is-current={mode === 'suspense'} disabled={busy || mode === 'suspense'} onclick={() => setMode('suspense')}>
      {mode === 'suspense' ? '🔒 Results hidden' : '🔒 Suspense (hide results)'}
    </button>
    <button class="btn btn-lg mode-btn reveal" class:is-current={mode === 'revealed'} disabled={busy || mode === 'revealed'} onclick={() => setMode('revealed')}>
      {mode === 'revealed' ? (revealScope ? '🎭 Reveal in progress…' : '🏆 Champions revealed') : '🏆 Reveal Champions'}
    </button>
  </div>
  <p class="control-hint muted">
    {#if mode === 'live'}The board is updating live. Hit <b>Suspense</b> to hide the scores from the audience for a moment (e.g. before announcing a result), then <b>Back to Live</b> to resume — or <b>Reveal Champions</b> for the grand finale.
    {:else if mode === 'suspense'}Scores are hidden from the audience. <b>Back to Live</b> to resume, or <b>Reveal Champions</b> for the finale.
    {:else}The champion reveal is showing. <b>Back to Live</b> returns to the normal board.{/if}
  </p>

  <div class="reveal-stages">
    <span class="rs-label">🎭 Grand finale — reveal year by year, then the champions:</span>
    <div class="rs-btns">
      {#each YEAR_ORDER as y}
        <button class="btn rs-btn" class:is-stage={mode === 'revealed' && revealScope === y} disabled={busy} onclick={() => setReveal(y)}>
          {YEAR_META[y]?.short ?? y}
        </button>
      {/each}
      <button class="btn rs-btn champions" class:is-stage={mode === 'revealed' && !revealScope} disabled={busy} onclick={() => setReveal(null)}>
        🏆 Champions
      </button>
    </div>
  </div>

  <div class="msg-row">
    <div class="field" style="flex:1">
      <label for="suspense-msg">Suspense holding-screen message</label>
      <input id="suspense-msg" type="text" bind:value={message} placeholder="Scores hidden — back shortly" maxlength="120" />
    </div>
    <button class="btn" disabled={busy} onclick={saveMessage}>Save message</button>
  </div>
</section>

<!-- Progress + counts -->
<div class="grid">
  <div class="card stat-card">
    <div class="k">Results committed</div>
    <div class="v">{progress.committed}<span class="of">/ {progress.total}</span></div>
    <div class="progress-track"><div class="progress-fill" style="width:{pct}%"></div></div>
    <div class="sub">{pct}% complete{progress.void ? ` · ${progress.void} void` : ''}</div>
  </div>
  <a class="card stat-card link" href="/queue">
    <div class="k">Pending submissions</div>
    <div class="v" class:warn-v={pending > 0}>{pending}</div>
    <div class="sub">{pending ? 'Awaiting review →' : 'Queue clear'}</div>
  </a>
  <a class="card stat-card link" href="/contests">
    <div class="k">Outstanding contests</div>
    <div class="v">{outstanding}</div>
    <div class="sub">Not yet committed →</div>
  </a>
  <a class="card stat-card link" href="/records">
    <div class="k">Records broken</div>
    <div class="v" class:gold-v={recordsBroken > 0}>{recordsBroken}</div>
    <div class="sub">{recordsBroken ? 'This year 🔥' : 'None yet'}</div>
  </a>
</div>

<!-- Standings freshness + manual recompute -->
<section class="card fresh-card" class:stale={standingsStale}>
  <div class="section-title">♻️ Standings freshness</div>
  {#if std}
    <p class="muted" style="margin:0;">
      Public standings recomputed <b>{ago(computedAt)}</b>{standingsStale ? ' — a newer result has committed since, so the board may be behind.' : ' — up to date with committed results.'}
    </p>
  {:else}
    <p class="muted" style="margin:0;">No standings computed yet.</p>
  {/if}
  <div class="row-actions">
    <button class="btn" class:btn-primary={standingsStale} disabled={recomputing} onclick={doRecompute}>
      {recomputing ? 'Recomputing…' : '♻️ Recompute now'}
    </button>
  </div>
  <p class="muted" style="margin:0; font-size:0.82rem;">Standings recompute automatically after every commit — use this only if the board looks behind the committed results.</p>
</section>

<!-- Export / archive -->
<section class="card export-card">
  <div class="section-title">📤 Export &amp; archive</div>
  <p class="muted" style="margin:0;">Download the results for the school's records or to check against the paper sheets — safe to run any time.</p>
  <div class="row-actions">
    <button class="btn" disabled={!std} onclick={() => std && exportStandingsCsv(std)}>⬇ Standings (CSV)</button>
    <button class="btn" disabled={!std} onclick={() => exportArchiveJson({ standings: data.standings, contests: data.contests, records: data.records, config: data.config })}>⬇ Full archive (JSON)</button>
  </div>
</section>

<!-- Raw-submissions safety net -->
<section class="card export-card">
  <div class="section-title">🛟 Submissions backup (safety net)</div>
  <p class="muted" style="margin:0;">
    A copy of <b>every raw prefect submission</b> (the whole queue — committed and pending) saved to this
    laptop, so you can fall back to the old method from a file if anything ever goes wrong with the system.
    Drop the files into OneDrive/Drive to keep them off the device.
  </p>
  <div class="row-actions">
    <button class="btn" disabled={backup.busy} onclick={doBackup}>⬇ Back up submissions (CSV + JSON)</button>
    <label class="auto-toggle">
      <input type="checkbox" checked={backup.enabled} onchange={(e) => setAutoBackup(e.currentTarget.checked, true)} />
      Auto-save a CSV every 5 min
    </label>
  </div>
  <p class="muted" style="margin:0; font-size:0.82rem;">
    {#if backup.lastAt}
      ✓ Last backup {backupClock(backup.lastAt)} · {backup.lastCount} submission{backup.lastCount === 1 ? '' : 's'}{backup.enabled ? ' · auto-save ON' : ''}
    {:else if backup.enabled}
      Auto-save ON — the first file saves within 5 minutes (or click the button for one now).
    {:else}
      No backup saved yet this session.
    {/if}
    {#if backup.lastError}<span style="color:var(--warn);"> · last attempt failed: {backup.lastError}</span>{/if}
  </p>
</section>

<style>
  .setup-card { padding: 1.3rem 1.4rem; display: flex; flex-direction: column; gap: 0.8rem; align-items: flex-start; border: 2px solid color-mix(in srgb, var(--brand) 35%, transparent); }
  .setup-card p { margin: 0; max-width: 60ch; }
  .control-card { padding: 1.3rem 1.4rem; display: flex; flex-direction: column; gap: 1.1rem; border-width: 2px; border-style: solid; }
  .control-card.live { border-color: color-mix(in srgb, var(--up) 30%, transparent); }
  .control-card.suspense { border-color: color-mix(in srgb, var(--warn) 45%, transparent); background: color-mix(in srgb, var(--warn-soft) 50%, var(--surface)); }
  .control-card.revealed { border-color: color-mix(in srgb, var(--gold) 55%, transparent); background: color-mix(in srgb, var(--gold-soft) 55%, var(--surface)); }
  .control-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .now { margin-top: 0.4rem; font-size: 0.95rem; }
  .mode-pill { font-weight: 800; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.35rem 0.8rem; border-radius: var(--r-pill); }
  .mode-pill.live { background: var(--up-soft); color: var(--up); }
  .mode-pill.suspense { background: var(--warn-soft); color: var(--warn); }
  .mode-pill.revealed { background: var(--gold); color: #3a2c00; }
  .control-btns { display: grid; gap: 0.7rem; grid-template-columns: 1fr; }
  @media (min-width: 720px) { .control-btns { grid-template-columns: repeat(3, 1fr); } }
  .mode-btn { border: 2px solid var(--border-strong); }
  /* Actionable (NOT the current mode) */
  .mode-btn.live:not(.is-current) { background: var(--brand); color: #fff; border-color: transparent; }
  .mode-btn.suspense:not(.is-current) { background: var(--surface); color: var(--warn); border-color: color-mix(in srgb, var(--warn) 55%, transparent); }
  .mode-btn.reveal:not(.is-current) { background: var(--gold); color: #3a2c00; border-color: transparent; }
  /* The CURRENT mode: "you are here" — solid + a check, not a faded disabled button */
  .mode-btn.is-current { opacity: 1 !important; cursor: default; box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.55), var(--shadow); }
  .mode-btn.live.is-current { background: var(--up); color: #fff; border-color: transparent; }
  .mode-btn.suspense.is-current { background: var(--warn); color: #fff; border-color: transparent; }
  .mode-btn.reveal.is-current { background: var(--gold); color: #3a2c00; border-color: transparent; }
  .control-hint { font-size: 0.85rem; margin: 0.1rem 0.1rem 0; }
  .reveal-stages { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.7rem 0.85rem; border-radius: var(--r-md); background: color-mix(in srgb, var(--gold-soft) 45%, var(--surface)); border: 1px dashed color-mix(in srgb, var(--gold) 45%, transparent); }
  .rs-label { font-size: 0.82rem; font-weight: 800; color: #7a5c00; }
  .rs-btns { display: flex; gap: 0.45rem; flex-wrap: wrap; }
  .rs-btn { min-height: 40px; padding: 0.45rem 0.9rem; font-size: 0.9rem; border: 1px solid var(--border-strong); background: var(--surface); }
  .rs-btn.champions { background: var(--gold); color: #3a2c00; border-color: transparent; font-weight: 800; }
  .rs-btn.is-stage { box-shadow: inset 0 0 0 2px var(--brand); }
  .msg-row { display: flex; gap: 0.7rem; align-items: flex-end; flex-wrap: wrap; }
  .stat-card .of { font-size: 1rem; color: var(--text-faint); font-weight: 700; margin-left: 0.3rem; }
  .stat-card.link { text-decoration: none; color: inherit; transition: box-shadow var(--dur-fast), transform var(--dur-fast); }
  .stat-card.link:hover { box-shadow: var(--shadow); transform: translateY(-1px); }
  .warn-v { color: var(--warn); }
  .gold-v { color: var(--gold); }
  .export-card { padding: 1.1rem 1.2rem; display: flex; flex-direction: column; gap: 0.7rem; }
  .fresh-card { padding: 1.1rem 1.2rem; display: flex; flex-direction: column; gap: 0.6rem; }
  .fresh-card.stale { border: 2px solid color-mix(in srgb, var(--warn) 50%, transparent); background: color-mix(in srgb, var(--warn-soft) 40%, var(--surface)); }
  .auto-toggle { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); cursor: pointer; }
  .auto-toggle input { width: 1.05rem; height: 1.05rem; cursor: pointer; }
</style>
