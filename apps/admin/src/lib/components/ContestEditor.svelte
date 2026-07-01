<script lang="ts">
  import Modal from './Modal.svelte';
  import FinishingOrderEditor from './FinishingOrderEditor.svelte';
  import FormChip from './FormChip.svelte';
  import StatusBadge from './StatusBadge.svelte';
  import { data } from '$lib/data.svelte';
  import { commitContest, voidContest, unvoidContest, recordEntry } from '$lib/api';
  import { toast, errMessage } from '$lib/toast.svelte';
  import { confirm, confirmWithReason } from '$lib/confirm.svelte';
  import { contestLabel, formsForYear, formatDateTime, formLabel, evaluateRecord } from '$lib/helpers';
  import { parseMark, formatMark, validateMarkInput, markPlaceholder, markFormatHint, markInputMode } from '@mgs/ui';
  import type { Contest, Placement } from '@mgs/config-types';

  let { contestId = null, onclose }: { contestId: string | null; onclose: () => void } = $props();

  const contest = $derived<Contest | null>(data.contests.find((c) => c.id === contestId) ?? null);
  const yearForms = $derived(contest ? formsForYear(data.forms, contest.year) : []);

  let placements = $state<Placement[]>([]);
  let markInput = $state('');
  let busy = $state(false);
  let loadedFor: string | null = null;

  // Record-mark support: the event's record + the current 1st-place form.
  const ev = $derived(contest ? (data.events.find((e) => e.id === contest.event) ?? null) : null);
  const record = $derived(contest ? (data.records.find((r) => r.id === `${contest.year}__${contest.event}`) ?? null) : null);
  const winnerId = $derived([...placements].sort((a, b) => a.position - b.position)[0]?.formId ?? null);
  // The winner's name is stored as the 1st-place athleteName, so it persists onto the committed
  // contest (validatePlacements keeps it) and is visible wherever placements are shown.
  const winnerName = $derived(placements.find((p) => p.formId === winnerId)?.athleteName ?? '');
  function setWinnerName(name: string) {
    if (!winnerId) return;
    // Don't trim while typing — that would swallow the space between first and last name. Only cap
    // the length; the server (validatePlacements) trims and drops a blank name on commit.
    const value = name.slice(0, 60);
    placements = placements.map((p) => (p.formId === winnerId ? { ...p, athleteName: value || undefined } : p));
  }
  // Parsed mark (accepts mm:ss for track times); null while blank or unparseable.
  const markValue = $derived(ev ? parseMark(markInput, ev.recordUnits) : null);
  const liveMarkKind = $derived.by((): 'none' | 'equal' | 'beat' => {
    if (markValue === null || !record) return 'none';
    return evaluateRecord({ units: record.units, standingScore: record.standingScore, currentScore: markValue });
  });
  // Plausibility of the typed mark (catches a 2-second 800m, a 500m javelin, an unparseable value).
  const markCheck = $derived(ev ? validateMarkInput(ev.id, markInput, ev.recordUnits) : { level: 'ok' as const, message: '', value: null, empty: true });

  // Load committed placements into the editor when the contest changes.
  $effect(() => {
    if (contest && contest.id !== loadedFor) {
      loadedFor = contest.id;
      placements = contest.placements.map((p) => ({ ...p }));
      markInput = '';
    }
  });

  async function doCommit() {
    const c = contest; // capture: stays valid even if the editor closes mid-await
    if (!c) return;
    if (placements.length === 0) {
      toast.error('Add at least one form to the finishing order.');
      return;
    }
    const wasCommitted = c.status === 'committed';
    let reason: string | undefined;
    if (wasCommitted) {
      const r = await confirmWithReason({
        title: 'Correct committed result',
        message: `${contestLabel(c, data.events)} is already committed (v${c.version}). A correction needs a reason for the audit log.`,
        confirmLabel: 'Save correction',
        reasonLabel: 'Reason for correction',
      });
      if (r === null) return;
      reason = r;
    } else {
      const ok = await confirm({
        title: 'Commit result?',
        message: `Commit the finishing order for ${contestLabel(c, data.events)}.`,
        confirmLabel: 'Commit',
      });
      if (!ok) return;
    }
    busy = true;
    try {
      const res = await commitContest({
        contestId: c.id,
        placements,
        reason,
        expectedVersion: c.version,
      });
      toast.success(`${res.action === 'correct' ? 'Corrected' : 'Committed'} — now v${res.version}.`);
      // Optional 1st-place record mark — keeps this year's BEST across the event's strings.
      const rec = data.records.find((r) => r.id === `${c.year}__${c.event}`);
      const mark = rec ? parseMark(markInput, rec.units) : null;
      const wId = [...placements].sort((a, b) => a.position - b.position)[0]?.formId;
      if (mark !== null && rec && wId) {
        if (markCheck.level === 'impossible') {
          // Don't let an obvious typo become a record — the result still commits.
          toast.error(`Committed, but ${formatMark(mark, rec.units)} wasn't recorded as a record — it looks impossible. Re-open the contest to enter a corrected mark.`);
        } else {
          const evLabel = data.events.find((e) => e.id === c.event)?.label ?? c.event;
          try {
            const rr = await recordEntry(rec.id, mark, wId, true);
            if (rr.kind === 'beat') toast.success(`🔥 New ${evLabel} record — ${formLabel(wId, data.forms)} ${formatMark(mark, rec.units)}!`);
            else if (rr.kind === 'equal') toast.success(`🟰 ${evLabel} record equalled by ${formLabel(wId, data.forms)}.`);
          } catch (recErr) {
            toast.error(`Result saved, but the record mark didn't: ${errMessage(recErr)}`);
          }
        }
      }
      onclose();
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      busy = false;
    }
  }

  async function doVoid() {
    const c = contest;
    if (!c) return;
    const reason = await confirmWithReason({
      title: 'Void contest',
      message: `Voiding removes ${contestLabel(c, data.events)} from scoring. It is never deleted and can be restored.`,
      confirmLabel: 'Void contest',
      danger: true,
      reasonLabel: 'Reason for voiding',
    });
    if (reason === null) return;
    busy = true;
    try {
      await voidContest(c.id, reason);
      toast.success('Contest voided.');
      onclose();
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      busy = false;
    }
  }

  async function doUnvoid() {
    const c = contest;
    if (!c) return;
    busy = true;
    try {
      await unvoidContest(c.id);
      toast.success('Contest restored.');
      onclose();
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      busy = false;
    }
  }
</script>

<Modal open={!!contest} title={contest ? contestLabel(contest, data.events) : ''} onclose={onclose} wide>
  {#if contest}
    <div class="meta-row">
      <StatusBadge status={contest.status} />
      <span class="tag">Version {contest.version}</span>
      {#if contest.committedAt}<span class="tag">Committed {formatDateTime(contest.committedAt)}</span>{/if}
      {#if contest.isRelay}<span class="tag">Relay</span>{/if}
    </div>

    {#if contest.status === 'void'}
      <div class="void-banner">
        🚫 This contest is void{contest.voidReason ? ` — “${contest.voidReason}”` : ''}.
      </div>
    {/if}

    {#if contest.status === 'committed' && contest.placements.length}
      <div class="committed-now">
        <div class="lbl">Currently committed</div>
        <ol>
          {#each [...contest.placements].sort((a, b) => a.position - b.position) as p (p.formId)}
            <li><span class="pos num">{p.position}</span><FormChip formId={p.formId} forms={data.forms} /></li>
          {/each}
        </ol>
      </div>
    {/if}

    <FinishingOrderEditor forms={yearForms} bind:placements />

    {#if winnerId}
      <div class="record-mark winner-name">
        <div class="rm-head">🏅 Winner's name <span class="muted">— the student who came 1st, shown to the results tent</span></div>
        <div class="rm-row">
          <input
            type="text"
            autocomplete="off"
            autocapitalize="words"
            placeholder="e.g. Aisha Patel"
            value={winnerName}
            oninput={(e) => setWinnerName(e.currentTarget.value)}
            aria-label="Winner's name"
          />
          <span class="rm-for">→ <FormChip formId={winnerId} forms={data.forms} /></span>
        </div>
        <p class="rm-note muted">If you reorder the finish, the name stays with this form — re-check it before saving.</p>
      </div>
    {/if}

    {#if record}
      <div class="record-mark">
        <div class="rm-head">🏅 1st-place mark <span class="muted">— optional, for record-checking</span></div>
        <p class="rm-format">{markFormatHint(ev?.id ?? '', record.units)}</p>
        <p class="rm-standing">
          {ev?.label} record:
          {#if record.standingScore != null}<b>{formatMark(record.standingScore, record.units)}</b>{#if record.standingHolder}<span class="muted"> · {record.standingHolder}</span>{/if}{:else}<span class="muted">none set</span>{/if}
          <span class="muted"> · {record.units === 'second' ? 'lower is faster' : 'higher is further'}</span>
        </p>
        <div class="rm-row">
          <input
            type="text"
            inputmode={markInputMode(ev?.id ?? '', record.units)}
            bind:value={markInput}
            placeholder={markPlaceholder(ev?.id ?? '', record.units)}
            aria-label="1st-place mark"
          />
          {#if winnerId}<span class="rm-for">→ <FormChip formId={winnerId} forms={data.forms} /></span>{/if}
          {#if liveMarkKind === 'beat'}<span class="rm-badge beat">🔥 New record!</span>{:else if liveMarkKind === 'equal'}<span class="rm-badge equal">🟰 Equals record</span>{/if}
        </div>
        {#if markCheck.level !== 'ok'}
          <p class="rm-check {markCheck.level}">{markCheck.level === 'unusual' ? '⚠️' : '🚫'} {markCheck.message}</p>
        {/if}
        <p class="rm-note muted">Saved when you commit. We keep this year's best across the A/B/C strings automatically.</p>
      </div>
    {/if}
  {/if}

  {#snippet footer()}
    {#if contest}
      {#if contest.status === 'void'}
        <button class="btn" disabled={busy} onclick={doUnvoid}>Unvoid</button>
      {:else}
        <button class="btn btn-danger" disabled={busy} onclick={doVoid}>Void…</button>
      {/if}
      <span style="flex:1"></span>
      <button class="btn" disabled={busy} onclick={onclose}>Cancel</button>
      <button class="btn btn-primary" disabled={busy || placements.length === 0} onclick={doCommit}>
        {busy ? 'Saving…' : contest.status === 'committed' ? 'Save correction' : 'Commit'}
      </button>
    {/if}
  {/snippet}
</Modal>

<style>
  .meta-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .void-banner { background: var(--down-soft); color: var(--down); padding: 0.6rem 0.8rem; border-radius: var(--r-md); font-weight: 600; font-size: 0.9rem; }
  .committed-now { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-md); padding: 0.7rem 0.85rem; }
  .committed-now .lbl { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 0.45rem; }
  .committed-now ol { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .committed-now li { display: flex; align-items: center; gap: 0.4rem; }
  .committed-now .pos { font-weight: 800; color: var(--text-muted); }
  .record-mark { border: 1px solid color-mix(in srgb, var(--gold) 35%, var(--border)); border-radius: var(--r-md); padding: 0.7rem 0.85rem; background: color-mix(in srgb, var(--gold-soft) 35%, var(--surface)); display: flex; flex-direction: column; gap: 0.45rem; }
  .rm-head { font-weight: 700; font-size: 0.92rem; }
  .rm-format { font-size: 0.8rem; color: var(--text-muted); font-weight: 600; margin: 0; }
  .rm-standing { font-size: 0.86rem; margin: 0; }
  .rm-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .rm-row input { width: 9rem; padding: 0.5rem 0.6rem; }
  .winner-name .rm-row input { width: min(16rem, 100%); }
  .rm-for { display: inline-flex; align-items: center; gap: 0.3rem; }
  .rm-badge { font-size: 0.74rem; font-weight: 800; padding: 0.25rem 0.6rem; border-radius: var(--r-pill); }
  .rm-badge.beat { background: var(--gold); color: #3a2c00; }
  .rm-badge.equal { background: var(--brand-soft); color: var(--brand-strong); }
  .rm-note { font-size: 0.75rem; margin: 0; }
  .rm-check { font-size: 0.82rem; font-weight: 700; margin: 0; padding: 0.35rem 0.6rem; border-radius: var(--r-sm); }
  .rm-check.unusual { background: var(--warn-soft); color: var(--warn); }
  .rm-check.impossible, .rm-check.invalid { background: var(--down-soft); color: var(--down); }
</style>
