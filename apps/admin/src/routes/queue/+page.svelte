<script lang="ts">
  import { onMount } from 'svelte';
  import { data } from '$lib/data.svelte';
  import { commitContest } from '$lib/api';
  import { toast, errMessage } from '$lib/toast.svelte';
  import { confirm, confirmState } from '$lib/confirm.svelte';
  import { contestLabel, parseContestId, placementsEqual, formsForYear, formatDateTime, evaluateRecord } from '$lib/helpers';
  import FormChip from '$lib/components/FormChip.svelte';
  import type { Submission, Placement } from '@mgs/config-types';

  type Flag = 'clean' | 'duplicate' | 'conflict' | 'partial';

  interface Group {
    contestId: string;
    year: string;
    label: string;
    subs: Submission[];
    flag: Flag;
    expectedForms: number;
  }

  const flagMeta: Record<Flag, { dot: string; label: string; cls: string }> = {
    clean: { dot: '🟢', label: 'Clean', cls: 'clean' },
    duplicate: { dot: '🟡', label: 'Agree', cls: 'duplicate' },
    conflict: { dot: '🔴', label: 'Conflict', cls: 'conflict' },
    partial: { dot: '🟠', label: 'Partial', cls: 'partial' },
  };

  const groups = $derived.by<Group[]>(() => {
    const byContest = new Map<string, Submission[]>();
    for (const s of data.submissions) {
      if (!byContest.has(s.contestId)) byContest.set(s.contestId, []);
      byContest.get(s.contestId)!.push(s);
    }
    const out: Group[] = [];
    for (const [contestId, subs] of byContest) {
      subs.sort((a, b) => a.clientCreatedAt - b.clientCreatedAt);
      const { year } = parseContestId(contestId);
      const contest = data.contests.find((c) => c.id === contestId);
      const expectedForms = formsForYear(data.forms, year).length || 8;
      const maxFilled = Math.max(...subs.map((s) => s.placements.length), 0);

      let flag: Flag;
      if (subs.length >= 2) {
        const first = subs[0]!.placements;
        const allAgree = subs.every((s) => placementsEqual(s.placements, first));
        flag = allAgree ? 'duplicate' : 'conflict';
      } else {
        flag = maxFilled > 0 && maxFilled < expectedForms ? 'partial' : 'clean';
      }
      out.push({
        contestId,
        year,
        label: contestLabel(contest ?? parseContestId(contestId), data.events),
        subs,
        flag,
        expectedForms,
      });
    }
    // Order: conflicts first (need attention), then partial, duplicate, clean; then by label.
    const rank: Record<Flag, number> = { conflict: 0, partial: 1, duplicate: 2, clean: 3 };
    return out.sort((a, b) => rank[a.flag] - rank[b.flag] || a.label.localeCompare(b.label));
  });

  // Groups that are safe to bulk-commit: a single clean submission, or several that agree.
  const agreedGroups = $derived(groups.filter((g) => g.flag === 'clean' || g.flag === 'duplicate'));

  let busyId = $state<string | null>(null);
  let bulkBusy = $state(false);
  let acting = $state(false);
  let showHelp = $state(false);

  // Focus is anchored to a contest ID (stable), never a positional index — so a reorder
  // or a removed group can never silently retarget a keyboard commit at the wrong contest.
  let focusedContestId = $state<string | null>(null);
  const focused = $derived(groups.find((g) => g.contestId === focusedContestId) ?? groups[0] ?? null);
  const focusIndex = $derived(focused ? groups.indexOf(focused) : 0);

  // Keep focus pointing at a real group as the list changes.
  $effect(() => {
    if (groups.length && (!focusedContestId || !groups.some((g) => g.contestId === focusedContestId))) {
      focusedContestId = groups[0]!.contestId;
    }
  });
  $effect(() => {
    focusIndex;
    document.getElementById(`grp-${focusIndex}`)?.scrollIntoView({ block: 'nearest' });
  });

  /** Per-position diff for a conflict group: which forms each submission put where. */
  function conflictDiff(subs: Submission[]) {
    const maxPos = Math.max(0, ...subs.flatMap((s) => s.placements.map((p) => p.position)));
    const rows: { position: number; cells: { subId: string; formId: string | null }[]; differs: boolean }[] = [];
    for (let pos = 1; pos <= maxPos; pos++) {
      const cells = subs.map((s) => ({ subId: s.id, formId: s.placements.find((p) => p.position === pos)?.formId ?? null }));
      const differs = new Set(cells.map((c) => c.formId ?? '∅')).size > 1;
      rows.push({ position: pos, cells, differs });
    }
    return rows;
  }

  async function commitSubmission(g: Group, sub: Submission, silent = false): Promise<boolean> {
    if (!silent) {
      const ok = await confirm({
        title: 'Commit result?',
        message: `Commit the finishing order for ${g.label}. This scores the contest and updates the public standings.`,
        confirmLabel: 'Commit',
      });
      if (!ok) return false;
    }
    busyId = g.contestId;
    try {
      // Send the version the operator is looking at, so the Cloud Function's optimistic-
      // concurrency guard rejects a commit if another tent laptop changed this contest first.
      // An outstanding contest has no version yet (undefined) — leave it unset so the first
      // commit still passes; once committed the version is real and guards every correction.
      const expectedVersion = data.contests.find((c) => c.id === g.contestId)?.version;
      await commitContest({ contestId: g.contestId, placements: sub.placements, expectedVersion });
      if (!silent) toast.success(`Committed ${g.label}.`);
      return true;
    } catch (e) {
      toast.error(`${g.label}: ${errMessage(e)}`);
      return false;
    } finally {
      busyId = null;
    }
  }

  async function commitAllClean() {
    if (agreedGroups.length === 0) return;
    const ok = await confirm({
      title: `Commit ${agreedGroups.length} agreed result${agreedGroups.length === 1 ? '' : 's'}?`,
      message: 'Commits every group where the only submission, or all submissions, agree. Conflicts and partials are left for you to review.',
      confirmLabel: `Commit ${agreedGroups.length}`,
    });
    if (!ok) return;
    bulkBusy = true;
    let done = 0;
    let failed = 0;
    const targets = [...agreedGroups];
    for (const g of targets) {
      const success = await commitSubmission(g, g.subs[0]!, true);
      success ? done++ : failed++;
    }
    bulkBusy = false;
    if (failed === 0) toast.success(`Committed all ${done} agreed result${done === 1 ? '' : 's'}.`);
    else toast.error(`Committed ${done} of ${targets.length}; ${failed} failed (see messages above).`);
  }

  // --- keyboard-driven triage ---------------------------------------------------
  async function kbCommit(g: Group, sub: Submission) {
    if (acting || busyId || bulkBusy) return;
    // Pre-pick the next contest so focus lands on the following race once this one drops out.
    const i = groups.findIndex((x) => x.contestId === g.contestId);
    const nextId = groups[i + 1]?.contestId ?? groups[i - 1]?.contestId ?? null;
    acting = true;
    try {
      const ok = await commitSubmission(g, sub);
      if (ok && nextId) focusedContestId = nextId;
    } finally {
      acting = false;
    }
  }
  async function kbAll() {
    if (acting || bulkBusy) return;
    acting = true;
    try {
      await commitAllClean();
    } finally {
      acting = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (confirmState.active) return; // a dialog owns the keyboard while it is open
    if (e.key === 'Escape') {
      showHelp = false;
      return;
    }
    if (e.key === '?') {
      showHelp = !showHelp;
      return;
    }
    if (showHelp || !groups.length) return; // help overlay open → only ?/Esc act
    const g = focused;
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusedContestId = groups[Math.min(groups.length - 1, focusIndex + 1)]!.contestId;
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusedContestId = groups[Math.max(0, focusIndex - 1)]!.contestId;
    } else if (e.key === 'Enter') {
      if (g && g.flag !== 'conflict') {
        e.preventDefault();
        void kbCommit(g, g.subs[0]!);
      }
    } else if (/^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      if (g && g.flag === 'conflict' && g.subs[idx]) {
        e.preventDefault();
        void kbCommit(g, g.subs[idx]!);
      }
    } else if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      void kbAll();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function placementRows(p: Placement[]) {
    return [...p].sort((a, b) => a.position - b.position);
  }
</script>

<div class="page-head">
  <div>
    <h2>Review Queue</h2>
    <div class="lede">{data.submissions.length} pending submission{data.submissions.length === 1 ? '' : 's'} across {groups.length} contest{groups.length === 1 ? '' : 's'}.</div>
  </div>
  <div class="actions">
    <button class="btn btn-primary" disabled={bulkBusy || agreedGroups.length === 0} onclick={commitAllClean}>
      {bulkBusy ? 'Committing…' : `Commit all agreed (${agreedGroups.length})`}
    </button>
  </div>
</div>

{#if groups.length}
  <div class="kbd-hint">
    <kbd>J</kbd><kbd>K</kbd> move · <kbd>Enter</kbd> commit · <kbd>1</kbd>/<kbd>2</kbd> pick side · <kbd>C</kbd> commit all · <kbd>?</kbd> help
  </div>
{/if}

{#if groups.length === 0}
  <div class="card"><div class="empty-state">🎉 The review queue is clear. New submissions appear here automatically.</div></div>
{:else}
  <div class="groups">
    {#each groups as g, i (g.contestId)}
      <section id="grp-{i}" class="card group {flagMeta[g.flag].cls}" class:focused={i === focusIndex}>
        <header class="g-head">
          <div>
            <div class="g-title">{g.label}</div>
            <div class="g-meta">
              {g.subs.length} submission{g.subs.length === 1 ? '' : 's'}
            </div>
          </div>
          <span class="flag {flagMeta[g.flag].cls}">{flagMeta[g.flag].dot} {flagMeta[g.flag].label}</span>
        </header>

        {#if g.flag === 'conflict'}
          <p class="conflict-note">⚠ Submissions disagree. Differing positions are highlighted below — pick the correct submission to commit.</p>
          <div class="diff" style="--cols:{g.subs.length}">
            <div class="diff-row diff-head">
              <span class="dp">#</span>
              {#each g.subs as sub, si (sub.id)}
                <span class="dc">{sub.attribution?.prefectName || `Sub ${si + 1}`}</span>
              {/each}
            </div>
            {#each conflictDiff(g.subs) as row (row.position)}
              <div class="diff-row" class:differs={row.differs}>
                <span class="dp num">{row.position}</span>
                {#each row.cells as cell (cell.subId)}
                  <span class="dc">
                    {#if cell.formId}<FormChip formId={cell.formId} forms={data.forms} />{:else}<span class="dash">—</span>{/if}
                  </span>
                {/each}
              </div>
            {/each}
          </div>
        {/if}

        <div class="subs" class:side-by-side={g.subs.length > 1}>
          {#each g.subs as sub, si (sub.id)}
            <div class="sub-card">
              <div class="sub-head">
                <span class="who">
                  {#if g.subs.length > 1}<span class="side-n">{si + 1}</span>{/if}
                  {sub.attribution?.prefectName || 'Unknown'} <span class="muted">· {sub.attribution?.areaCode || '—'}</span>
                </span>
                <span class="ts faint">{formatDateTime(sub.clientCreatedAt)}</span>
              </div>
              {#if sub.placements.length < g.expectedForms}
                <div class="partial-tag">🟠 {sub.placements.length} of {g.expectedForms} forms</div>
              {/if}
              {#if sub.note}
                <div class="note-tag">📝 {sub.note}</div>
              {/if}
              <ol class="order">
                {#each placementRows(sub.placements) as p (p.formId)}
                  <li>
                    <span class="pos num">{p.position}</span>
                    <FormChip formId={p.formId} forms={data.forms} />
                  </li>
                {/each}
              </ol>
              {#if sub.winnerMark != null}
                {@const rec = data.records.find((r) => r.id === `${sub.year}__${sub.event}`)}
                {@const units = rec?.units ?? data.events.find((e) => e.id === sub.event)?.recordUnits ?? 'second'}
                {@const unit = units === 'second' ? 's' : 'm'}
                {@const kind = rec && rec.standingScore != null ? evaluateRecord({ units: rec.units, standingScore: rec.standingScore, currentScore: sub.winnerMark }) : 'none'}
                <div class="mark-tag">
                  🏅 Winning mark: <b>{sub.winnerMark}{unit}</b>
                  {#if kind === 'beat'}<span class="rec-badge beat">🔥 Beats {rec?.standingScore}{unit}</span>
                  {:else if kind === 'equal'}<span class="rec-badge equal">🟰 Equals {rec?.standingScore}{unit}</span>{/if}
                </div>
              {/if}
              <button
                class="btn btn-primary btn-block"
                disabled={bulkBusy || busyId === g.contestId}
                onclick={() => commitSubmission(g, sub)}
              >
                {busyId === g.contestId ? 'Committing…' : g.subs.length > 1 ? `Commit #${si + 1}` : 'Commit'}
              </button>
            </div>
          {/each}
        </div>
      </section>
    {/each}
  </div>
{/if}

{#if showHelp}
  <button class="help-scrim" aria-label="Close help" onclick={() => (showHelp = false)}></button>
  <div class="help-card card" role="dialog" aria-label="Keyboard shortcuts">
    <h3>Keyboard shortcuts</h3>
    <dl>
      <dt><kbd>J</kbd> / <kbd>K</kbd></dt><dd>Move focus down / up</dd>
      <dt><kbd>Enter</kbd></dt><dd>Commit the focused clean / agreed / partial result</dd>
      <dt><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></dt><dd>On a conflict, commit that submission</dd>
      <dt><kbd>C</kbd></dt><dd>Commit all agreed results</dd>
      <dt><kbd>?</kbd></dt><dd>Toggle this help · <kbd>Esc</kbd> to close</dd>
    </dl>
  </div>
{/if}

<style>
  .kbd-hint { font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
  kbd {
    font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700;
    background: var(--surface-3); border: 1px solid var(--border-strong); border-bottom-width: 2px;
    border-radius: 5px; padding: 0.05rem 0.35rem; color: var(--text);
  }
  .groups { display: flex; flex-direction: column; gap: 1rem; }
  .group { padding: 1rem 1.1rem; display: flex; flex-direction: column; gap: 0.8rem; border-left: 4px solid var(--border); scroll-margin-top: 5rem; }
  .group.clean { border-left-color: var(--up); }
  .group.duplicate { border-left-color: var(--gold); }
  .group.conflict { border-left-color: var(--down); }
  .group.partial { border-left-color: var(--warn); }
  .group.focused { box-shadow: 0 0 0 2px var(--brand), var(--shadow); }
  .g-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
  .g-title { font-weight: 800; font-size: 1.02rem; }
  .g-meta { font-size: 0.82rem; color: var(--text-muted); margin-top: 0.15rem; }
  .flag { font-size: 0.78rem; font-weight: 800; padding: 0.25rem 0.6rem; border-radius: var(--r-pill); white-space: nowrap; }
  .flag.clean { background: var(--up-soft); color: var(--up); }
  .flag.duplicate { background: var(--gold-soft); color: #7a5c00; }
  .flag.conflict { background: var(--down-soft); color: var(--down); }
  .flag.partial { background: var(--warn-soft); color: var(--warn); }
  .conflict-note { font-size: 0.85rem; color: var(--down); background: var(--down-soft); padding: 0.5rem 0.7rem; border-radius: var(--r-md); }

  /* conflict diff table */
  .diff { display: flex; flex-direction: column; gap: 0.15rem; border: 1px solid var(--border); border-radius: var(--r-md); overflow: hidden; }
  .diff-row { display: grid; grid-template-columns: 2rem repeat(var(--cols), 1fr); align-items: center; gap: 0.5rem; padding: 0.3rem 0.6rem; }
  .diff-head { background: var(--surface-3); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
  .diff-row.differs { background: var(--down-soft); }
  .diff .dp { text-align: center; font-weight: 800; color: var(--text-muted); }
  .diff .dc { min-width: 0; }
  .diff .dash { color: var(--text-faint); }

  .subs { display: grid; gap: 0.8rem; }
  .subs.side-by-side { grid-template-columns: 1fr; }
  @media (min-width: 720px) { .subs.side-by-side { grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); } }
  .sub-card { border: 1px solid var(--border); border-radius: var(--r-md); padding: 0.7rem 0.8rem; display: flex; flex-direction: column; gap: 0.55rem; background: var(--surface-2); }
  .sub-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; font-size: 0.82rem; }
  .who { font-weight: 700; display: inline-flex; align-items: center; gap: 0.35rem; }
  .side-n { display: inline-grid; place-items: center; width: 1.4rem; height: 1.4rem; border-radius: 50%; background: var(--brand-soft); color: var(--brand-strong); font-weight: 800; font-size: 0.78rem; }
  .ts { font-size: 0.74rem; }
  .partial-tag { font-size: 0.76rem; font-weight: 700; color: var(--warn); }
  .note-tag { font-size: 0.78rem; color: var(--text-muted); }
  .order { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
  .order li { display: flex; align-items: center; gap: 0.55rem; }
  .order .pos { width: 1.4rem; text-align: center; font-weight: 800; color: var(--text-muted); }
  .mark-tag { font-size: 0.82rem; font-weight: 600; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .rec-badge { font-size: 0.72rem; font-weight: 800; padding: 0.15rem 0.5rem; border-radius: var(--r-pill); white-space: nowrap; }
  .rec-badge.beat { background: var(--gold); color: #3a2c00; }
  .rec-badge.equal { background: var(--brand-soft); color: var(--brand-strong); }

  .help-scrim { position: fixed; inset: 0; border: 0; background: rgba(8, 15, 30, 0.45); z-index: 199; }
  .help-card {
    position: fixed; z-index: 200; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: min(440px, calc(100vw - 2rem)); padding: 1.2rem 1.4rem;
  }
  .help-card h3 { margin-bottom: 0.7rem; }
  .help-card dl { display: grid; grid-template-columns: auto 1fr; gap: 0.5rem 0.9rem; margin: 0; font-size: 0.88rem; }
  .help-card dt { white-space: nowrap; }
  .help-card dd { margin: 0; color: var(--text-muted); }
</style>
