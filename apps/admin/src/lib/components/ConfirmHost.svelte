<script lang="ts">
  import { confirmState, resolveConfirm } from '$lib/confirm.svelte';
  import Modal from './Modal.svelte';

  let reason = $state('');
  let typed = $state('');

  const active = $derived(confirmState.active);
  // A type-to-confirm gate is satisfied only when the typed phrase matches exactly.
  const textOk = $derived(!active?.requireText || typed.trim() === active.requireText);

  // Reset the input fields each time a new dialog opens.
  let lastId = -1;
  $effect(() => {
    if (active && active.id !== lastId) {
      lastId = active.id;
      reason = '';
      typed = '';
    }
  });

  function confirmOk() {
    if (!active) return;
    if (active.requireReason) {
      if (!reason.trim()) return;
      resolveConfirm(reason.trim());
    } else if (active.requireText) {
      if (!textOk) return;
      resolveConfirm(true);
    } else {
      resolveConfirm(true);
    }
  }

  // Enter confirms a plain (no-reason) dialog so the keyboard-driven queue is truly
  // keyboard-completable. In a reason dialog, Enter belongs to the textarea.
  function onWinKey(e: KeyboardEvent) {
    if (!active || active.requireReason || active.danger) return; // danger dialogs need an explicit click
    if (e.key === 'Enter') {
      const t = e.target as HTMLElement | null;
      if (t && /^(TEXTAREA|INPUT|SELECT)$/.test(t.tagName)) return;
      e.preventDefault();
      confirmOk();
    }
  }
  // Focus Cancel on danger dialogs (a stray Enter/Space can't fire a destructive action),
  // the confirm button otherwise.
  function autofocus(node: HTMLButtonElement, shouldFocus: boolean) {
    if (shouldFocus) node.focus();
  }
</script>

<svelte:window onkeydown={active ? onWinKey : undefined} />

{#if active}
  <Modal open layer={200} title={active.title} onclose={() => resolveConfirm(null)}>
    {#if active.message}
      <p class="msg">{active.message}</p>
    {/if}
    {#if active.requireReason}
      <div class="field">
        <label for="confirm-reason">{active.reasonLabel ?? 'Reason'}</label>
        <textarea
          id="confirm-reason"
          rows="3"
          bind:value={reason}
          placeholder="This is recorded in the audit log"
        ></textarea>
      </div>
    {/if}
    {#if active.requireText}
      <div class="field">
        <label for="confirm-text">{active.textLabel ?? `Type ${active.requireText} to confirm`}</label>
        <input
          id="confirm-text"
          class="text-gate"
          type="text"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          bind:value={typed}
          placeholder={active.requireText}
        />
      </div>
    {/if}
    {#snippet footer()}
      <button class="btn" use:autofocus={active?.danger === true} onclick={() => resolveConfirm(null)}>{active?.cancelLabel ?? 'Cancel'}</button>
      <button
        class="btn {active?.danger ? 'btn-danger' : 'btn-primary'}"
        disabled={(active?.requireReason && !reason.trim()) || !textOk}
        use:autofocus={active?.danger !== true}
        onclick={confirmOk}
      >
        {active?.confirmLabel ?? 'Confirm'}
      </button>
    {/snippet}
  </Modal>
{/if}

<style>
  .msg { color: var(--text-muted); line-height: 1.5; }
  .text-gate {
    width: 100%; font: inherit; padding: 0.55rem 0.65rem; border: 1px solid var(--border-strong);
    border-radius: var(--r-sm); background: var(--surface); color: var(--text); min-height: 40px;
  }
  .text-gate:focus-visible { outline: none; border-color: var(--brand); box-shadow: var(--shadow-glow); }
</style>
