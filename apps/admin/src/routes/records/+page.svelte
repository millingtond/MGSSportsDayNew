<script lang="ts">
  import { data } from '$lib/data.svelte';
  import { recordEntry } from '$lib/api';
  import { toast, errMessage } from '$lib/toast.svelte';
  import { confirm } from '$lib/confirm.svelte';
  import { YEAR_ORDER, YEAR_META, yearLabel, formsForYear, recordUnitHint, evaluateRecord } from '$lib/helpers';
  import { parseMark, formatMark, markPlaceholder, markInputMode, validateMarkInput } from '@mgs/ui';
  import type { RecordDoc } from '@mgs/config-types';

  // Local editable buffers keyed by recordId.
  let edits = $state<Record<string, { score: string; form: string }>>({});
  let busyId = $state<string | null>(null);
  let initFor: string | null = null;

  // Seed buffers from the records snapshot once (re-seed if the set of ids changes).
  $effect(() => {
    const key = data.records.map((r) => `${r.id}:${r.currentScore ?? ''}:${r.currentForm ?? ''}`).join('|');
    if (key !== initFor) {
      initFor = key;
      const next: Record<string, { score: string; form: string }> = {};
      for (const r of data.records) {
        next[r.id] = {
          score: r.currentScore == null ? '' : String(r.currentScore),
          form: r.currentForm ?? '',
        };
      }
      edits = next;
    }
  });

  const eventLabel = (id: string) => data.events.find((e) => e.id === id)?.label ?? id;

  function recordsForYear(year: string): RecordDoc[] {
    return data.records
      .filter((r) => r.year === year)
      .sort((a, b) => {
        const oa = data.events.find((e) => e.id === a.event)?.order ?? 99;
        const ob = data.events.find((e) => e.id === b.event)?.order ?? 99;
        return oa - ob;
      });
  }

  /** Live what-if evaluation from the editable buffer (before saving). parseMark accepts mm:ss. */
  function liveKind(r: RecordDoc): 'none' | 'equal' | 'beat' {
    const cs = parseMark(edits[r.id]?.score ?? '', r.units);
    return evaluateRecord({ units: r.units, standingScore: r.standingScore, currentScore: cs });
  }

  async function save(r: RecordDoc) {
    const buf = edits[r.id] ?? { score: '', form: '' };
    const raw = buf.score.trim();
    const check = validateMarkInput(r.event, raw, r.units);
    if (check.level === 'invalid') {
      toast.error(r.units === 'metre' ? 'Enter a distance like 4.35 (or leave blank to clear).' : 'Enter a time like 2:05.4 or 12.19 (or leave blank to clear).');
      return;
    }
    // Catch an obvious typo (a 2-second 800m) before it becomes a record — but let an admin
    // override, since this page is the deliberate manual record-setting surface.
    if (check.level === 'impossible') {
      const ok = await confirm({
        title: 'That mark looks impossible',
        message: `${check.message} Save it as the ${yearLabel(r.year)} ${eventLabel(r.event)} record anyway?`,
        confirmLabel: 'Save anyway',
        danger: true,
      });
      if (!ok) return;
    }
    const score = check.value; // null when blank -> clears the record
    busyId = r.id;
    try {
      const res = await recordEntry(r.id, score, score === null ? null : buf.form || null);
      const msg = res.kind === 'beat' ? '🔥 Record broken!' : res.kind === 'equal' ? '🟰 Record equalled.' : 'Saved.';
      toast.success(`${yearLabel(r.year)} ${eventLabel(r.event)} — ${msg}`);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      busyId = null;
    }
  }
</script>

<div class="page-head">
  <div>
    <h2>Records</h2>
    <div class="lede">Enter this year's best mark per record. A bonus is awarded for equalling (+1) or beating (+2) the standing record.</div>
  </div>
</div>

{#if data.records.length === 0}
  <div class="card"><div class="loading-state">Loading records…</div></div>
{:else}
  {#each YEAR_ORDER as year (year)}
    <section class="card year-block">
      <header class="yb-head" style="--accent:{YEAR_META[year]?.colour ?? '#888'}">
        <span class="yr-badge">{yearLabel(year)}</span>
      </header>
      <div class="rec-list">
        {#each recordsForYear(year) as r (r.id)}
          {@const kind = liveKind(r)}
          {@const forms = formsForYear(data.forms, r.year)}
          <div class="rec" class:beat={kind === 'beat'} class:equal={kind === 'equal'}>
            <div class="rec-info">
              <div class="rec-name">{eventLabel(r.event)}</div>
              <div class="rec-standing">
                Record:
                {#if r.standingScore != null}
                  <b>{formatMark(r.standingScore, r.units)}</b>
                  {#if r.standingHolder}<span class="holder">· {r.standingHolder}</span>{/if}
                  {#if r.standingYear}<span class="holder">· {r.standingYear}</span>{/if}
                {:else}
                  <span class="muted">none set</span>
                {/if}
              </div>
              <div class="hint">{recordUnitHint(r.units)}</div>
            </div>

            <div class="rec-inputs">
              {#if edits[r.id]}
              <div class="field">
                <label for="sc-{r.id}">This year</label>
                <input
                  id="sc-{r.id}"
                  type="text"
                  inputmode={markInputMode(r.event, r.units)}
                  placeholder={markPlaceholder(r.event, r.units)}
                  bind:value={edits[r.id].score}
                />
              </div>
              <div class="field">
                <label for="fm-{r.id}">Form</label>
                <select id="fm-{r.id}" bind:value={edits[r.id].form} disabled={!edits[r.id]?.score}>
                  <option value="">—</option>
                  {#each forms as f (f.id)}
                    <option value={f.id}>{f.label}</option>
                  {/each}
                </select>
              </div>
              {/if}
              <div class="rec-result">
                {#if kind === 'beat'}<span class="badge beat">🔥 Beats</span>
                {:else if kind === 'equal'}<span class="badge equal">🟰 Equals</span>
                {:else if edits[r.id]?.score}<span class="badge none">No record</span>
                {/if}
              </div>
              <button class="btn btn-primary" disabled={busyId === r.id} onclick={() => save(r)}>
                {busyId === r.id ? '…' : 'Save'}
              </button>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/each}
{/if}

<style>
  .year-block { padding: 1rem 1.1rem; display: flex; flex-direction: column; gap: 0.8rem; }
  .yb-head { display: flex; align-items: center; gap: 0.8rem; }
  .yr-badge {
    font-weight: 800; font-size: 0.95rem; padding: 0.3rem 0.75rem; border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: color-mix(in srgb, var(--accent) 75%, black);
    border: 1px solid color-mix(in srgb, var(--accent) 36%, transparent);
  }
  .rec-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .rec {
    display: grid; grid-template-columns: 1fr auto; gap: 0.8rem; align-items: center;
    padding: 0.7rem 0.85rem; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface-2);
  }
  .rec.beat { border-color: color-mix(in srgb, var(--gold) 55%, transparent); background: color-mix(in srgb, var(--gold-soft) 50%, var(--surface)); }
  .rec.equal { border-color: color-mix(in srgb, var(--brand) 40%, transparent); }
  .rec-name { font-weight: 800; }
  .rec-standing { font-size: 0.85rem; color: var(--text-muted); margin-top: 0.1rem; }
  .rec-standing .holder { font-size: 0.78rem; }
  .hint { font-size: 0.72rem; color: var(--text-faint); margin-top: 0.15rem; }
  .rec-inputs { display: flex; align-items: flex-end; gap: 0.5rem; flex-wrap: wrap; }
  .rec-inputs .field { width: 6.5rem; }
  .rec-inputs input, .rec-inputs select { padding: 0.45rem 0.55rem; }
  .rec-result { min-width: 5.5rem; }
  .badge { font-size: 0.74rem; font-weight: 800; padding: 0.25rem 0.55rem; border-radius: var(--r-pill); white-space: nowrap; }
  .badge.beat { background: var(--gold); color: #3a2c00; }
  .badge.equal { background: var(--brand-soft); color: var(--brand-strong); }
  .badge.none { background: var(--surface-3); color: var(--text-muted); }
  @media (max-width: 620px) {
    .rec { grid-template-columns: 1fr; }
    .rec-inputs { justify-content: flex-start; }
    /* once the row stacks, make Save the unambiguous full-width primary action */
    .rec-result { flex: 1 1 100%; }
    .rec-inputs button { flex: 1 1 100%; }
  }
</style>
