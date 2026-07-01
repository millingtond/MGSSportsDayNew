<script lang="ts">
  import Modal from './Modal.svelte';
  import { data } from '$lib/data.svelte';
  import { sendBroadcast, clearBroadcast } from '$lib/api';
  import { toast, errMessage } from '$lib/toast.svelte';
  import { confirm } from '$lib/confirm.svelte';
  import { formatDateTime } from '$lib/helpers';

  let open = $state(false);
  let text = $state('');
  let busy = $state(false);

  // The live message, if any (active flag + a non-empty body).
  const active = $derived(data.broadcast?.active && data.broadcast.message ? data.broadcast : null);

  function openComposer() {
    text = active?.message ?? '';
    open = true;
  }
  async function send() {
    const msg = text.trim();
    if (!msg) {
      toast.error('Type a message first.');
      return;
    }
    busy = true;
    try {
      await sendBroadcast(msg);
      toast.success('Message sent to all prefects.');
      open = false;
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      busy = false;
    }
  }
  async function clear() {
    const ok = await confirm({
      title: 'Clear the message?',
      message: "Remove the broadcast from every prefect's app.",
      confirmLabel: 'Clear message',
    });
    if (!ok) return;
    busy = true;
    try {
      await clearBroadcast();
      toast.success('Message cleared.');
      open = false;
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      busy = false;
    }
  }
</script>

<div class="bcast-bar">
  {#if active}
    <div class="bcast-live">
      <span class="bcast-dot" aria-hidden="true"></span>
      <div class="bcast-live-text">
        <span class="bcast-label">📢 Live to prefects</span>
        <span class="bcast-msg">“{active.message}”</span>
        <span class="bcast-meta">{active.byName || 'Results tent'} · {formatDateTime(active.at)}</span>
      </div>
      <div class="bcast-actions">
        <button class="btn" disabled={busy} onclick={openComposer}>Edit</button>
        <button class="btn btn-ghost" disabled={busy} onclick={clear}>Clear</button>
      </div>
    </div>
  {:else}
    <button class="btn bcast-open" onclick={openComposer}>📢 Message all prefects</button>
  {/if}
</div>

{#if open}
  <Modal open title="Message all prefects" onclose={() => (open = false)}>
    <p class="bcast-note">
      This appears at the top of every prefect's entry app until you clear it. Use it for urgent field
      messages — a rain delay, an event moved, or “come and check in with the tent”.
    </p>
    <textarea
      class="bcast-input"
      rows="3"
      maxlength="280"
      bind:value={text}
      placeholder="e.g. Rain delay — pause all field events until further notice."
    ></textarea>
    <div class="bcast-count">{text.length}/280</div>
    {#snippet footer()}
      {#if active}<button class="btn btn-ghost" disabled={busy} onclick={clear}>Clear current</button>{/if}
      <span style="flex:1"></span>
      <button class="btn" disabled={busy} onclick={() => (open = false)}>Cancel</button>
      <button class="btn btn-primary" disabled={busy || !text.trim()} onclick={send}>
        {busy ? 'Sending…' : active ? 'Update message' : 'Send to prefects'}
      </button>
    {/snippet}
  </Modal>
{/if}

<style>
  .bcast-bar { display: flex; }
  .bcast-open { border-style: dashed; color: var(--text-muted); }
  .bcast-live {
    display: flex; align-items: center; gap: 0.7rem; width: 100%;
    border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--border)); border-radius: var(--r-md);
    background: var(--warn-soft); padding: 0.6rem 0.8rem;
  }
  .bcast-dot { width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--warn); flex: none; box-shadow: 0 0 0 0 var(--warn); animation: bpulse 1.8s infinite; }
  @keyframes bpulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--warn) 55%, transparent); } 70% { box-shadow: 0 0 0 0.5rem transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
  @media (prefers-reduced-motion: reduce) { .bcast-dot { animation: none; } }
  .bcast-live-text { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; flex: 1; }
  .bcast-label { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--warn); }
  .bcast-msg { font-weight: 700; overflow-wrap: anywhere; }
  .bcast-meta { font-size: 0.74rem; color: var(--text-muted); }
  .bcast-actions { display: flex; gap: 0.4rem; flex: none; }
  .bcast-note { font-size: 0.86rem; color: var(--text-muted); margin: 0 0 0.6rem; line-height: 1.5; }
  .bcast-input {
    width: 100%; font: inherit; padding: 0.6rem 0.7rem; border: 1px solid var(--border-strong);
    border-radius: var(--r-sm); background: var(--surface); color: var(--text); resize: vertical;
  }
  .bcast-input:focus-visible { outline: none; border-color: var(--brand); box-shadow: var(--shadow-glow); }
  .bcast-count { font-size: 0.74rem; color: var(--text-muted); text-align: right; margin-top: 0.25rem; }
</style>
