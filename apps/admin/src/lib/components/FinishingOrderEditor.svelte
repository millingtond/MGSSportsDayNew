<script lang="ts">
  import { contrastText } from '@mgs/ui';
  import type { Form, Placement } from '@mgs/config-types';

  let {
    forms = [],
    placements = $bindable([]),
  }: {
    forms: Form[]; // forms eligible for this contest (one year)
    placements: Placement[]; // bound, ordered finishing order
  } = $props();

  // Ordered list of formIds currently placed (index 0 = 1st).
  const ordered = $derived(
    [...placements].sort((a, b) => a.position - b.position).map((p) => p.formId),
  );

  const placedSet = $derived(new Set(ordered));
  const remaining = $derived(forms.filter((f) => !placedSet.has(f.id)));

  let showNames = $state(false);
  // Auto-reveal the name fields ONCE when opening a contest that already has names. A plain
  // (non-reactive) guard so clicking "Hide names" isn't instantly re-forced open.
  let autoRevealed = false;
  $effect(() => {
    if (!autoRevealed && placements.some((p) => p.athleteName)) {
      autoRevealed = true;
      showNames = true;
    }
  });

  function rebuild(ids: string[]) {
    const nameOf = new Map(placements.map((p) => [p.formId, p.athleteName]));
    placements = ids.map((formId, i) => ({ formId, position: i + 1, athleteName: nameOf.get(formId) }));
  }
  function setName(formId: string, name: string) {
    placements = placements.map((p) => (p.formId === formId ? { ...p, athleteName: name === '' ? undefined : name } : p));
  }
  function nameOf(formId: string): string {
    return placements.find((p) => p.formId === formId)?.athleteName ?? '';
  }

  function add(formId: string) {
    rebuild([...ordered, formId]);
  }
  function removeAt(i: number) {
    const next = [...ordered];
    next.splice(i, 1);
    rebuild(next);
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= ordered.length) return;
    const next = [...ordered];
    [next[i], next[j]] = [next[j]!, next[i]!];
    rebuild(next);
  }
  function clearAll() {
    placements = [];
  }
</script>

<div class="foe">
  <div class="placed">
    <div class="lbl-row">
      <div class="lbl">Finishing order ({ordered.length})</div>
      <button class="names-toggle" class:on={showNames} onclick={() => (showNames = !showNames)} title="For individual champions (optional)">
        🏅 {showNames ? 'Hide names' : 'Add names'}
      </button>
    </div>
    {#if ordered.length === 0}
      <p class="empty">Tap a form below to add it as 1st, then 2nd, and so on.</p>
    {:else}
      <ol>
        {#each ordered as formId, i (formId)}
          {@const f = forms.find((x) => x.id === formId)}
          <li class:with-name={showNames}>
            <div class="row1">
              <span class="pos num">{i + 1}</span>
              <span class="chip" style={f ? `background:${f.colour}; color:${contrastText(f.colour)}` : ''}>
                {f?.label ?? formId}
              </span>
              <span class="grow"></span>
              <button class="mini" aria-label="Move up" disabled={i === 0} onclick={() => move(i, -1)}>↑</button>
              <button class="mini" aria-label="Move down" disabled={i === ordered.length - 1} onclick={() => move(i, 1)}>↓</button>
              <button class="mini danger" aria-label="Remove" onclick={() => removeAt(i)}>×</button>
            </div>
            {#if showNames}
              <input
                class="name-in"
                type="text"
                placeholder="Athlete name (optional)"
                value={nameOf(formId)}
                oninput={(e) => setName(formId, e.currentTarget.value)}
              />
            {/if}
          </li>
        {/each}
      </ol>
      <button class="btn btn-ghost clear" onclick={clearAll}>Clear all</button>
    {/if}
  </div>

  <div class="pool">
    <div class="lbl">Remaining forms</div>
    {#if remaining.length === 0}
      <p class="empty">All forms placed.</p>
    {:else}
      <div class="pool-chips">
        {#each remaining as f (f.id)}
          <button
            class="chip pick"
            style="background:{f.colour}; color:{contrastText(f.colour)}"
            onclick={() => add(f.id)}
          >
            + {f.label}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .foe { display: grid; gap: 1rem; }
  @media (min-width: 620px) { .foe { grid-template-columns: 1fr 1fr; align-items: start; } }
  .lbl { font-size: 0.74rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 0.5rem; }
  .empty { color: var(--text-faint); font-size: 0.85rem; }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  li {
    display: flex; flex-direction: column; gap: 0.4rem;
    padding: 0.35rem 0.5rem; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface-2);
  }
  .row1 { display: flex; align-items: center; gap: 0.5rem; }
  .lbl-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.5rem; }
  .lbl-row .lbl { margin-bottom: 0; }
  .names-toggle {
    appearance: none; border: 1px solid var(--border-strong); background: var(--surface); color: var(--text-muted);
    font-size: 0.78rem; font-weight: 700; padding: 0.3rem 0.6rem; border-radius: var(--r-pill); cursor: pointer; white-space: nowrap;
  }
  .names-toggle.on { background: var(--gold-soft); color: #7a5c00; border-color: color-mix(in srgb, var(--gold) 45%, transparent); }
  .name-in {
    width: 100%; font: inherit; padding: 0.4rem 0.55rem; border: 1px solid var(--border-strong);
    border-radius: var(--r-sm); background: var(--surface); color: var(--text); min-height: 38px;
  }
  .name-in:focus-visible { outline: none; border-color: var(--brand); box-shadow: var(--shadow-glow); }
  .pos { width: 1.5rem; text-align: center; font-weight: 800; color: var(--text-muted); }
  .grow { flex: 1; }
  .chip { font-size: 0.85rem; padding: 0.25em 0.65em; box-shadow: var(--shadow-sm); }
  .mini {
    appearance: none; border: 1px solid var(--border-strong); background: var(--surface); color: var(--text);
    width: 44px; height: 44px; flex: none; border-radius: var(--r-sm); cursor: pointer; font-weight: 800; line-height: 1;
    display: inline-flex; align-items: center; justify-content: center; font-size: 1.05rem;
    touch-action: manipulation;
  }
  .mini:disabled { opacity: 0.4; cursor: not-allowed; }
  .mini.danger { color: var(--danger); }
  .clear { margin-top: 0.6rem; color: var(--text-muted); font-size: 0.82rem; padding: 0.3rem 0.5rem; }
  .pool-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .pick { appearance: none; border: 0; cursor: pointer; font-weight: 700; min-height: 44px; touch-action: manipulation; }
</style>
