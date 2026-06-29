<script lang="ts">
  import { toastState, dismissToast } from '$lib/toast.svelte';

  const icon: Record<string, string> = { success: '✓', error: '⚠', info: 'ℹ' };
</script>

<div class="toasts" aria-live="polite">
  {#each toastState.items as t (t.id)}
    <div class="toast {t.kind}" role="status">
      <span class="ico">{icon[t.kind]}</span>
      <span class="msg">{t.message}</span>
      <button class="x" aria-label="Dismiss" onclick={() => dismissToast(t.id)}>×</button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    bottom: calc(1rem + env(safe-area-inset-bottom));
    right: calc(1rem + env(safe-area-inset-right));
    left: auto;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: min(92vw, 420px);
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.7rem 0.9rem;
    border-radius: var(--r-md);
    background: var(--surface);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
    font-size: 0.9rem;
    font-weight: 600;
    animation: slidein var(--dur) var(--ease-out);
  }
  .toast .ico { width: 1.4rem; height: 1.4rem; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 800; flex: none; }
  .toast.success .ico { background: var(--ok); }
  .toast.error .ico { background: var(--danger); }
  .toast.info .ico { background: var(--brand); }
  .toast .msg { flex: 1; }
  .toast .x {
    appearance: none; border: 0; background: transparent;
    font-size: 1.3rem; line-height: 1; color: var(--text-faint); cursor: pointer;
    flex: none;
    min-width: 44px; min-height: 44px;
    margin: -0.5rem -0.4rem -0.5rem 0;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: var(--r-sm);
    touch-action: manipulation;
  }
  @keyframes slidein { from { transform: translateY(0.6rem); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @media (max-width: 560px) {
    .toasts { left: max(0.6rem, env(safe-area-inset-left)); right: max(0.6rem, env(safe-area-inset-right)); max-width: none; }
  }
</style>
