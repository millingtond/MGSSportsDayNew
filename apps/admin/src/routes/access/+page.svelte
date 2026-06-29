<script lang="ts">
  import { tick } from 'svelte';
  import QRCode from 'qrcode';
  import { data } from '$lib/data.svelte';
  import { createAccessCode, setAccessCodeActive, deleteAccessCode } from '$lib/api';
  import { toast, errMessage } from '$lib/toast.svelte';
  import { confirm } from '$lib/confirm.svelte';
  import { entryUrl, ENTRY_BASE } from '$lib/constants';
  import { formatDateTime } from '$lib/helpers';
  import { isDryRun } from '@mgs/firebase';
  import Modal from '$lib/components/Modal.svelte';

  // Access codes are GLOBAL (not season-scoped) — claimAccessCode looks them up globally.
  // So on a dry-run/rehearsal URL, enabling/deleting here would hit the LIVE codes. Lock the
  // destructive actions in that case so a rehearsal can't sign real marshals out mid-event.
  const dryRun = isDryRun();
  let pendingId = $state<string | null>(null);

  // ---- New-code form state ----
  let areaCode = $state('');
  let allEvents = $state(true);
  let scope = $state<string[]>([]);
  let expiresAt = $state(defaultExpiry());
  let maxMints = $state(30);
  let creating = $state(false);

  // ---- Result modal (shown once) ----
  let result = $state<{ code: string; url: string; qr: string } | null>(null);
  // Codes created THIS session, kept so they can be printed as cards (only the plaintext we
  // hold in memory can render a QR — older codes store only a hash).
  let created = $state<Array<{ areaCode: string; code: string; url: string; qr: string; scope: string[]; allEvents: boolean }>>([]);
  // When set, the print sheet renders just this one card (for "Print this card").
  let printOne = $state<{ areaCode: string; code: string; url: string; qr: string; scope: string[]; allEvents: boolean } | null>(null);

  // How many copies of EACH card to print. 4 fills an A4 sheet (2×2) — handy when one "All events"
  // code is shared, so you can cut the page into four. Distinct codes already pack 4-up at 1 each.
  let copies = $state(4);
  const copiesN = $derived(Math.max(1, Math.min(40, Math.floor(Number(copies)) || 1)));
  // The cards actually sent to the printer: each base card repeated `copiesN` times, laid out 4-up.
  const printList = $derived(
    (printOne ? [printOne] : created).flatMap((c) => Array.from({ length: copiesN }, () => c)),
  );

  function defaultExpiry(): string {
    // datetime-local string for ~12h ahead
    const d = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function toggleScope(eventId: string) {
    scope = scope.includes(eventId) ? scope.filter((e) => e !== eventId) : [...scope, eventId];
  }

  async function create() {
    if (!areaCode.trim()) {
      toast.error('Enter an area/station name.');
      return;
    }
    const area = areaCode.trim();
    const eventScope = allEvents ? data.events.map((e) => e.id) : scope;
    if (eventScope.length === 0) {
      toast.error('Pick at least one event, or tick "All events".');
      return;
    }
    const expiresMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiresMs)) {
      toast.error('Invalid expiry date.');
      return;
    }
    creating = true;
    try {
      const { code } = await createAccessCode({
        areaCode: area,
        eventScope,
        expiresAt: expiresMs,
        maxMints: Number(maxMints) || 0,
      });
      const url = entryUrl(code);
      const qr = await QRCode.toDataURL(url, { width: 320, margin: 1 });
      result = { code, url, qr };
      created = [...created, { areaCode: area, code, url, qr, scope: eventScope, allEvents }];
      toast.success('Access code created.');
      // reset form (keep scope for convenience)
      areaCode = '';
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      creating = false;
    }
  }

  // Re-show an existing code's QR + link (works only for codes whose plaintext we stored).
  async function showCode(ac: { areaCode: string; code?: string; eventScope?: string[] }) {
    if (!ac.code) return;
    const url = entryUrl(ac.code);
    const qr = await QRCode.toDataURL(url, { width: 320, margin: 1 });
    if (!created.some((c) => c.code === ac.code)) {
      const allEv = (ac.eventScope?.length ?? 0) >= data.events.length;
      created = [...created, { areaCode: ac.areaCode, code: ac.code, url, qr, scope: ac.eventScope ?? [], allEvents: allEv }];
    }
    result = { code: ac.code, url, qr };
  }

  // Print only the card currently shown in the modal (the print sheet renders [printOne] while set).
  async function printThisCard() {
    if (!result) return;
    const r = result;
    printOne = created.find((c) => c.code === r.code) ?? { areaCode: '—', code: r.code, url: r.url, qr: r.qr, scope: [], allEvents: false };
    await tick();
    window.print();
    printOne = null;
  }

  async function toggleActive(id: string, current: boolean) {
    const ok = await confirm({
      title: current ? 'Disable this code?' : 'Enable this code?',
      message: current ? 'Disabling stops new devices from joining with it.' : 'Re-enables this station code.',
      danger: current,
    });
    if (!ok) return;
    pendingId = id;
    try {
      await setAccessCodeActive(id, !current);
      toast.success(current ? 'Code disabled.' : 'Code enabled.');
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      pendingId = null;
    }
  }

  async function removeCode(id: string, area: string) {
    const ok = await confirm({
      title: `Delete the “${area}” code?`,
      message: 'Permanently removes this station code and signs out any prefects using it. Best for clearing test codes. This cannot be undone.',
      confirmLabel: 'Delete code',
      danger: true,
    });
    if (!ok) return;
    pendingId = id;
    try {
      await deleteAccessCode(id);
      toast.success('Code deleted.');
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      pendingId = null;
    }
  }

  const eventLabel = (id: string) => data.events.find((e) => e.id === id)?.label ?? id;

  function isExpired(ms: number): boolean {
    return !!ms && ms < Date.now();
  }
</script>

<div class="page-head">
  <div>
    <h2>Access codes</h2>
    <div class="lede">Station codes let prefects sign in on the entry app at <code>{ENTRY_BASE}</code>. Only a hash is stored — the plaintext is shown once.</div>
  </div>
</div>

{#if dryRun}
  <div class="global-note">⚠ Access codes are <b>global</b> — shared with the live event, <b>not</b> part of this rehearsal season. Enabling/deleting is locked here so a rehearsal can't lock out real marshals. Manage codes from the live admin (no <code>?season</code>).</div>
{/if}

<section class="card section-card">
  <div class="section-title">🔑 Create a station code</div>
  <div class="new-grid">
    <div class="field">
      <label for="area">Area / station</label>
      <input id="area" type="text" bind:value={areaCode} placeholder="e.g. 100m-Finish" />
    </div>
    <div class="field">
      <label for="expiry">Expires</label>
      <input id="expiry" type="datetime-local" bind:value={expiresAt} />
    </div>
    <div class="field">
      <label for="mints">Max devices</label>
      <input id="mints" type="number" min="1" bind:value={maxMints} />
      <div class="hint">How many separate phones can use this code.</div>
    </div>
  </div>
  <div class="field">
    <span class="lbl">Which events can this code submit?</span>
    <label class="all-events">
      <input type="checkbox" bind:checked={allEvents} />
      <span><b>All events</b> — any prefect can use it and choose the event on their phone. Best if you're not pre-assigning who marshals what.</span>
    </label>
    {#if !allEvents}
      <p class="hint">Restrict to specific events (e.g. a dedicated 100m marshal):</p>
      <div class="scope">
        {#if data.events.length === 0}
          <span class="muted">Loading events…</span>
        {:else}
          {#each data.events as ev (ev.id)}
            <button type="button" class="scope-chip" class:on={scope.includes(ev.id)} onclick={() => toggleScope(ev.id)}>
              {scope.includes(ev.id) ? '✓ ' : ''}{ev.label}
            </button>
          {/each}
        {/if}
      </div>
      <div class="hint">{scope.length} event{scope.length === 1 ? '' : 's'} selected</div>
    {/if}
  </div>
  <div class="row-actions">
    <button class="btn btn-primary" disabled={creating} onclick={create}>
      {creating ? 'Creating…' : 'Create code'}
    </button>
  </div>
</section>

<section class="card section-card">
  <div class="section-title">
    📋 Existing codes ({data.accessCodes.length})
    {#if created.length}
      <span class="print-controls">
        <label class="copies-lbl">Copies each
          <input class="copies-input" type="number" min="1" max="40" bind:value={copies} aria-label="Copies of each card" />
        </label>
        <button class="btn print-btn" onclick={() => window.print()}>🖨 Print {created.length} code{created.length === 1 ? '' : 's'} ×{copiesN}</button>
      </span>
    {/if}
  </div>
  {#if created.length}
    <p class="hint" style="margin-top:-0.3rem;">Prints the {created.length} code{created.length === 1 ? '' : 's'} created or opened this session, {copiesN} card{copiesN === 1 ? '' : 's'} each — <b>4 per A4 page</b>. Cut along the dashed lines.</p>
  {/if}
  {#if data.accessCodes.length === 0}
    <div class="empty-state">No access codes yet.</div>
  {:else}
    <div class="table-scroll">
      <table class="data">
        <thead>
          <tr>
            <th>Area</th>
            <th>Scope</th>
            <th>Mints</th>
            <th>Expires</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each data.accessCodes as ac (ac.id)}
            <tr>
              <td><b>{ac.areaCode}</b></td>
              <td class="scope-cell">
                {#each ac.eventScope ?? [] as e}<span class="tag">{eventLabel(e)}</span>{/each}
              </td>
              <td class="num">{ac.mints ?? 0}{ac.maxMints ? ` / ${ac.maxMints}` : ''}</td>
              <td class="faint">{formatDateTime(ac.expiresAt)}</td>
              <td>
                {#if ac.active === false}
                  <span class="tag off">Disabled</span>
                {:else if isExpired(ac.expiresAt)}
                  <span class="tag off">Expired</span>
                {:else}
                  <span class="tag on">Active</span>
                {/if}
              </td>
              <td class="row-actions">
                {#if ac.code}
                  <button class="btn" style="padding:0.35rem 0.7rem" onclick={() => showCode(ac)}>Show QR</button>
                {/if}
                <button class="btn" style="padding:0.35rem 0.7rem" disabled={dryRun || pendingId === ac.id} onclick={() => toggleActive(ac.id, ac.active !== false)}>
                  {ac.active === false ? 'Enable' : 'Disable'}
                </button>
                <button class="btn btn-danger" style="padding:0.35rem 0.7rem" disabled={dryRun || pendingId === ac.id} onclick={() => removeCode(ac.id, ac.areaCode)}>Delete</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<!-- Print-only: QR cards for the codes created this session (each repeated `copiesN` times). -->
<div class="print-sheet" aria-hidden="true">
  {#each printList as c, i (i)}
    <div class="qr-card">
      <div class="qc-station">{c.areaCode}</div>
      <img class="qc-qr" src={c.qr} alt="" />
      <div class="qc-code">{c.code}</div>
      <div class="qc-scope">{c.allEvents ? 'All events' : c.scope.map(eventLabel).join(', ')}</div>
      <div class="qc-url">{c.url}</div>
      <div class="qc-hint">Scan to open the results entry app</div>
    </div>
  {/each}
</div>

<Modal open={!!result} title="Station code" onclose={() => (result = null)}>
  {#if result}
    <p class="muted">Print or photograph this now — the plaintext code is <b>not stored</b> and can't be shown again.</p>
    <div class="code-show">
      <div class="big-code num">{result.code}</div>
      <img class="qr" src={result.qr} alt="QR code for {result.url}" />
      <a class="link-url" href={result.url} target="_blank" rel="noopener">{result.url}</a>
    </div>
    <label class="copies-row">
      Copies on the page
      <input type="number" min="1" max="40" bind:value={copies} aria-label="Copies to print" />
      <span class="muted">{copiesN} card{copiesN === 1 ? '' : 's'} — 4 fill an A4 sheet</span>
    </label>
  {/if}
  {#snippet footer()}
    <button class="btn btn-primary" onclick={() => result && navigator.clipboard?.writeText(result.code)}>Copy code</button>
    <button class="btn" onclick={printThisCard}>Print ×{copiesN}</button>
    <button class="btn" onclick={() => window.print()}>Print all created</button>
    <button class="btn btn-ghost" onclick={() => (result = null)}>Done</button>
  {/snippet}
</Modal>

<style>
  code { font-family: var(--font-mono); font-size: 0.85em; }
  .new-grid { display: grid; gap: 0.8rem; grid-template-columns: 1fr; }
  @media (min-width: 640px) { .new-grid { grid-template-columns: 2fr 1.4fr 1fr; } }
  .lbl { display: block; font-weight: 700; margin-bottom: 0.4rem; }
  .all-events { display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.7rem 0.85rem; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface-2); cursor: pointer; font-size: 0.9rem; line-height: 1.4; }
  .all-events input { width: 20px; height: 20px; margin-top: 0.1rem; flex: none; cursor: pointer; }
  .scope { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.4rem; }
  .scope-chip {
    appearance: none; cursor: pointer; font-weight: 650; font-size: 0.85rem;
    min-height: 44px; padding: 0.4rem 0.85rem; border-radius: var(--r-pill);
    border: 1px solid var(--border-strong); background: var(--surface); color: var(--text);
    display: inline-flex; align-items: center; touch-action: manipulation;
  }
  .scope-chip.on { background: var(--brand-soft); color: var(--brand-strong); border-color: color-mix(in srgb, var(--brand) 40%, transparent); }
  .global-note { background: var(--warn-soft); color: #7a4d05; border: 1px solid color-mix(in srgb, var(--warn) 35%, transparent); border-radius: var(--r-md); padding: 0.6rem 0.85rem; font-size: 0.88rem; line-height: 1.4; }
  .table-scroll { overflow-x: auto; }
  .scope-cell { display: flex; flex-wrap: wrap; gap: 0.25rem; max-width: 18rem; }
  .tag.on { background: var(--up-soft); color: var(--up); }
  .tag.off { background: var(--down-soft); color: var(--down); }
  .code-show { display: flex; flex-direction: column; align-items: center; gap: 0.8rem; }
  .big-code { font-size: 2.6rem; font-weight: 850; letter-spacing: 0.2em; }
  .qr { width: 240px; height: 240px; border-radius: var(--r-md); border: 1px solid var(--border); }
  .link-url { font-size: 0.82rem; word-break: break-all; text-align: center; }
  .print-btn { padding: 0.35rem 0.7rem; }
  .print-controls { margin-left: auto; display: inline-flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .copies-lbl { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; font-weight: 650; color: var(--text-muted); }
  .copies-input { width: 3.6rem; padding: 0.3rem 0.45rem; text-align: center; font-weight: 700; border: 1px solid var(--border-strong); border-radius: var(--r-sm); background: var(--surface); color: var(--text); }
  .copies-row { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.9rem; font-weight: 650; font-size: 0.9rem; flex-wrap: wrap; justify-content: center; }
  .copies-row input { width: 4rem; padding: 0.4rem 0.5rem; text-align: center; font-weight: 700; border: 1px solid var(--border-strong); border-radius: var(--r-sm); background: var(--surface); color: var(--text); }
  .copies-row .muted { font-weight: 500; }

  /* Printable QR cards (A4). On screen the sheet is hidden; in print we strip the console
     chrome and lay the cards out, two per row. */
  .print-sheet { display: none; }
  @media print {
    :global(.sidebar), :global(.topbar-mobile), :global(.mobile-drawer), :global(.status-strip),
    :global(.dryrun-banner), :global(.overlay) { display: none !important; }
    :global(.main) { padding: 0 !important; max-width: none !important; }
    .page-head, .section-card { display: none !important; }
    .print-sheet { display: grid !important; grid-template-columns: 1fr 1fr; gap: 8mm; padding: 0; }
    /* Fixed-height cards so exactly 4 (2×2) fill an A4 page and the rest paginate. */
    .qr-card {
      break-inside: avoid; page-break-inside: avoid; height: 128mm; box-sizing: border-box;
      border: 2px dashed #999; border-radius: 8px; padding: 6mm;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3mm; text-align: center; color: #000;
    }
    .qc-station { font-size: 18pt; font-weight: 800; }
    .qc-qr { width: 62mm; height: 62mm; }
    .qc-code { font-family: var(--font-mono); font-size: 13pt; font-weight: 700; letter-spacing: 0.15em; }
    .qc-scope { font-size: 9pt; color: #333; }
    .qc-url { font-size: 7pt; color: #666; word-break: break-all; }
    .qc-hint { font-size: 8pt; color: #444; }
  }
  @page { size: A4; margin: 8mm; }
</style>
