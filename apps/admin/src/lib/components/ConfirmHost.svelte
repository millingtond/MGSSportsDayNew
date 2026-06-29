<script lang="ts">
  import { confirmState, resolveConfirm } from '$lib/confirm.svelte';
  import Modal from './Modal.svelte';

  let reason = $state('');
  let typed = $state('');

  const active = $derived(confirmState.active);

  // Case-insensitive, whitespace-normalised match so "y9 100m a" confirms "Y9 100m A".
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const typeOk = $derived(!active?.requireType || norm(typed) === norm(active.requireType));

  // Reset the reason + type fields each time a new dialog opens.
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
    if (!typeOk) return; // type-to-confirm gate
    if (active.requireReason) {
      if (!reason.trim()) return;
      resolveConfirm(reason.trim());
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
  // the confirm button otherwise — but a type-to-confirm box grabs focus so the operator
  // can start typing the phrase straight away.
  function autofocus(node: HTMLElement, shouldFocus: boolean) {
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
    {#if active.requireType}
      <div class="field">
        <label for="confirm-type">{active.typeLabel ?? 'Type to confirm'} <code class="type-target">{active.requireType}</code></label>
        <input
          id="confirm-type"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          bind:value={typed}
          use:autofocus={true}
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmOk(); } }}
          placeholder={active.requireType}
          aria-label="Type {active.requireType} to confirm"
        />
      </div>
    {/if}
    {#snippet footer()}
      <button class="btn" use:autofocus={active?.danger === true && !active?.requireType} onclick={() => resolveConfirm(null)}>{active?.cancelLabel ?? 'Cancel'}</button>
      <button
        class="btn {active?.danger ? 'btn-danger' : 'btn-primary'}"
        disabled={(active?.requireReason && !reason.trim()) || !typeOk}
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
  .type-target {
    font-family: var(--font-mono); font-weight: 700; font-size: 0.92em;
    background: var(--surface-3); border: 1px solid var(--border-strong);
    border-radius: 5px; padding: 0.05rem 0.4rem; color: var(--text); user-select: all;
  }
  #confirm-type {
    width: 100%; padding: 0.6rem 0.7rem; font-size: 1rem;
    border: 1px solid var(--border-strong); border-radius: var(--r-md);
    background: var(--surface); color: var(--text); min-height: 44px;
  }
  #confirm-type:focus-visible { outline: none; box-shadow: var(--shadow-glow); }
</style>
