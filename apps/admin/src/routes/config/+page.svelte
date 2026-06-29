<script lang="ts">
  import { data } from '$lib/data.svelte';
  import { saveConfig, saveForm, recomputeStandings, seedSeason } from '$lib/api';
  import { toast, errMessage } from '$lib/toast.svelte';
  import { confirm } from '$lib/confirm.svelte';
  import { isDryRun, getSeasonId } from '@mgs/firebase';
  import { YEAR_ORDER, YEAR_META, yearLabel, formsForYear, DEFAULT_LADDER, LINEAR_LADDER, DEFAULT_STRING_OFFSETS } from '$lib/helpers';
  import type { SeasonConfig, Form } from '@mgs/config-types';

  let busy = $state(false);

  // ---- Scoring ladder editor (local buffer) ----
  let ladderText = $state('');
  let ladderInit: string | null = null;
  $effect(() => {
    const cfg = data.config;
    if (cfg) {
      const sig = cfg.scoring.ladder.join(',');
      if (sig !== ladderInit) {
        ladderInit = sig;
        ladderText = cfg.scoring.ladder.join(', ');
      }
    }
  });

  const parsedLadder = $derived(
    ladderText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number),
  );
  const ladderValid = $derived(parsedLadder.length > 0 && parsedLadder.every((n) => Number.isFinite(n)));

  function applyPreset(which: 'mgs' | 'linear') {
    ladderText = (which === 'mgs' ? [...DEFAULT_LADDER] : [...LINEAR_LADDER]).join(', ');
  }

  async function saveScoring() {
    if (!data.config) return;
    if (!ladderValid) {
      toast.error('The ladder must be a list of numbers.');
      return;
    }
    busy = true;
    try {
      const next: SeasonConfig = {
        ...data.config,
        scoring: { ...data.config.scoring, ladder: parsedLadder },
      };
      await saveConfig(next);
      toast.success('Scoring ladder saved and standings recomputed.');
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      busy = false;
    }
  }

  async function toggleStatus() {
    if (!data.config) return;
    const next = data.config.status === 'active' ? 'locked' : 'active';
    const ok = await confirm({
      title: next === 'locked' ? 'Lock the season?' : 'Unlock the season?',
      message: next === 'locked' ? 'Locking marks the season as finished.' : 'Unlocking re-opens the season as active.',
    });
    if (!ok) return;
    busy = true;
    try {
      await saveConfig({ ...data.config, status: next });
      toast.success(`Season ${next}.`);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      busy = false;
    }
  }

  async function toggleTurnout() {
    if (!data.config) return;
    busy = true;
    try {
      await saveConfig({
        ...data.config,
        turnout: { ...data.config.turnout, awardsPoints: !data.config.turnout.awardsPoints },
      });
      toast.success('Turnout setting saved.');
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      busy = false;
    }
  }

  async function recompute() {
    busy = true;
    try {
      await recomputeStandings();
      toast.success('Standings recomputed.');
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      busy = false;
    }
  }

  async function resetSeason() {
    const dry = isDryRun();
    const ok = await confirm({
      title: dry ? `Reset the “${getSeasonId()}” rehearsal season?` : 'Reset the whole season?',
      message: dry
        ? `Wipes the “${getSeasonId()}” rehearsal season's results, submissions, records and standings and reloads the default data. The LIVE season is untouched. Cannot be undone.`
        : 'A FULL clean slate: wipes all committed results, submissions, record marks, standings, AND the access codes and audit log, then reloads the default 2026 data. Cannot be undone.',
      confirmLabel: dry ? 'Reset rehearsal' : 'Yes, reset everything',
      danger: true,
    });
    if (!ok) return;
    busy = true;
    try {
      const r = await seedSeason(true);
      toast.success(`Season reset: ${r.forms} forms, ${r.contests} contests, ${r.records} records reloaded.`);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      busy = false;
    }
  }

  // ---- Forms roster editor ----
  let formEdits = $state<Record<string, { code: string; label: string; colour: string }>>({});
  let savingForm = $state<string | null>(null);
  let formInit: string | null = null;
  $effect(() => {
    const sig = data.forms.map((f) => `${f.id}:${f.code}:${f.label}:${f.colour}`).join('|');
    if (sig !== formInit) {
      formInit = sig;
      const next: Record<string, { code: string; label: string; colour: string }> = {};
      for (const f of data.forms) next[f.id] = { code: f.code, label: f.label, colour: f.colour };
      formEdits = next;
    }
  });

  function formDirty(f: Form): boolean {
    const e = formEdits[f.id];
    return !!e && (e.code !== f.code || e.label !== f.label || e.colour !== f.colour);
  }

  async function saveFormRow(f: Form) {
    const e = formEdits[f.id];
    if (!e) return;
    savingForm = f.id;
    try {
      await saveForm(f.id, { code: e.code, label: e.label, colour: e.colour });
      await recomputeStandings();
      toast.success(`${f.label} updated.`);
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      savingForm = null;
    }
  }

  const cfg = $derived(data.config);
</script>

<div class="page-head">
  <div>
    <h2>Config</h2>
    <div class="lede">Scoring, season status and the form roster. Saving any of these recomputes the standings.</div>
  </div>
  <div class="actions">
    <a class="btn" href="/access">Generate QR sheet →</a>
    <button class="btn" disabled={busy} onclick={recompute}>Recompute standings</button>
  </div>
</div>

{#if !cfg}
  <div class="card"><div class="loading-state">Loading config…</div></div>
{:else}
  <!-- Season status + turnout -->
  <section class="card section-card">
    <div class="section-title">⚙️ Season</div>
    <div class="toggles">
      <div class="toggle">
        <div>
          <div class="t-name">Season status</div>
          <div class="t-sub">Currently <b>{cfg.status}</b> · config version {cfg.configVersion}</div>
        </div>
        <button class="btn" class:btn-danger={cfg.status === 'active'} disabled={busy} onclick={toggleStatus}>
          {cfg.status === 'active' ? 'Lock season' : 'Unlock season'}
        </button>
      </div>
      <div class="toggle">
        <div>
          <div class="t-name">Turnout bonus (not yet active)</div>
          <div class="t-sub">{cfg.turnout.awardsPoints ? 'Flagged ON' : 'Flagged OFF'} — turnout is recorded for reference only and isn't wired into scoring yet, so this doesn't change any points.</div>
        </div>
        <button class="btn" disabled={busy} onclick={toggleTurnout}>
          {cfg.turnout.awardsPoints ? 'Turn off' : 'Turn on'}
        </button>
      </div>
    </div>
  </section>

  <!-- Scoring ladder -->
  <section class="card section-card">
    <div class="section-title">🪜 Scoring ladder</div>
    <p class="muted small">
      Rank-to-points (1st = first number). Strings tier into this single ladder via offsets
      A:{DEFAULT_STRING_OFFSETS.A}, B:{DEFAULT_STRING_OFFSETS.B}, C:{DEFAULT_STRING_OFFSETS.C} (read-only).
    </p>
    <div class="presets">
      <button class="btn" onclick={() => applyPreset('mgs')}>MGS default (30)</button>
      <button class="btn" onclick={() => applyPreset('linear')}>Linear 8</button>
    </div>
    <div class="field">
      <label for="ladder">Ladder values</label>
      <textarea id="ladder" rows="3" bind:value={ladderText} class:invalid={!ladderValid}></textarea>
      <div class="hint">{parsedLadder.length} value{parsedLadder.length === 1 ? '' : 's'}{ladderValid ? '' : ' · must all be numbers'}</div>
    </div>
    <div class="offsets">
      {#each Object.entries(cfg.scoring.stringOffsets) as [s, off]}
        <span class="tag">String {s}: +{off}</span>
      {/each}
      <span class="tag">Tie policy: {cfg.scoring.tiePolicy}</span>
      <span class="tag">Record bonus: equal +{cfg.scoring.recordBonus.equal}, beat +{cfg.scoring.recordBonus.beat}</span>
    </div>
    <div class="row-actions">
      <button class="btn btn-primary" disabled={busy || !ladderValid} onclick={saveScoring}>Save ladder</button>
    </div>
  </section>

  <!-- Forms roster -->
  <section class="card section-card">
    <div class="section-title">👕 Forms roster</div>
    <p class="muted small">Rename codes/labels (e.g. updating Year 9 / Year 10 tutor-pair codes) and adjust chip colours. Each save recomputes standings.</p>
    {#each YEAR_ORDER as year (year)}
      <div class="roster-year">
        <div class="ry-head" style="--accent:{YEAR_META[year]?.colour ?? '#888'}">
          <span class="yr-badge">{yearLabel(year)}</span>
        </div>
        <div class="form-rows">
          {#each formsForYear(data.forms, year) as f (f.id)}
            {#if formEdits[f.id]}
            <div class="form-row">
              <input
                class="colour"
                type="color"
                aria-label="Colour for {f.label}"
                bind:value={formEdits[f.id].colour}
              />
              <input class="code" type="text" aria-label="Code" bind:value={formEdits[f.id].code} />
              <input class="label" type="text" aria-label="Label" bind:value={formEdits[f.id].label} />
              <button
                class="btn btn-primary"
                disabled={savingForm === f.id || !formDirty(f)}
                onclick={() => saveFormRow(f)}
              >
                {savingForm === f.id ? '…' : 'Save'}
              </button>
            </div>
            {/if}
          {/each}
        </div>
      </div>
    {/each}
  </section>

  <!-- Danger zone -->
  <section class="card section-card danger-zone">
    <div class="section-title">🧨 Danger zone</div>
    <div class="toggle">
      <div>
        <div class="t-name">Reset &amp; re-seed season</div>
        <div class="t-sub">A full clean slate — wipes all results, submissions, records, standings, <b>access codes and the audit log</b>, then reloads the default 2026 data. (A dry-run reset only wipes that rehearsal season.)</div>
      </div>
      <button class="btn btn-danger" disabled={busy} onclick={resetSeason}>Reset season</button>
    </div>
  </section>
{/if}

<style>
  .danger-zone { border-color: color-mix(in srgb, var(--danger) 35%, var(--border)); }
  .small { font-size: 0.85rem; line-height: 1.5; }
  .toggles { display: flex; flex-direction: column; gap: 0.6rem; }
  .toggle { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.7rem 0.85rem; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface-2); flex-wrap: wrap; }
  .t-name { font-weight: 700; }
  .t-sub { font-size: 0.82rem; color: var(--text-muted); margin-top: 0.1rem; }
  .presets { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  textarea.invalid { border-color: var(--danger); }
  .offsets { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .roster-year { display: flex; flex-direction: column; gap: 0.4rem; }
  .ry-head { margin-top: 0.4rem; }
  .yr-badge {
    font-weight: 800; font-size: 0.85rem; padding: 0.25rem 0.65rem; border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: color-mix(in srgb, var(--accent) 75%, black);
    border: 1px solid color-mix(in srgb, var(--accent) 36%, transparent);
  }
  .form-rows { display: flex; flex-direction: column; gap: 0.4rem; }
  .form-row { display: grid; grid-template-columns: 3rem 1fr 1fr auto; gap: 0.5rem; align-items: center; }
  /* color inputs aren't covered by the global 44px control rule (its selector lists text/number/etc.) */
  .form-row .colour { width: 3rem; height: 44px; padding: 0.1rem; border-radius: var(--r-sm); cursor: pointer; }
  @media (max-width: 560px) {
    .form-row { grid-template-columns: 3rem 1fr auto; }
    .form-row .label { grid-column: 2 / 4; }
    .form-rows { gap: 0.6rem; }
  }
</style>
