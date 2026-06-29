<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open = false,
    title = '',
    onclose,
    children,
    footer,
    wide = false,
    layer = 90,
  }: {
    open?: boolean;
    title?: string;
    onclose?: () => void;
    children: Snippet;
    footer?: Snippet;
    wide?: boolean;
    layer?: number;
  } = $props();

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose?.();
  }
</script>

<svelte:window onkeydown={open ? onKey : undefined} />

{#if open}
  <div class="overlay" style="z-index:{layer}">
    <button type="button" class="backdrop" aria-label="Close dialog" onclick={() => onclose?.()}></button>
    <div class="dialog card" class:wide role="dialog" aria-modal="true" aria-label={title}>
      <header class="dlg-head">
        <h3>{title}</h3>
        <button class="x" aria-label="Close" onclick={() => onclose?.()}>×</button>
      </header>
      <div class="dlg-body">
        {@render children()}
      </div>
      {#if footer}
        <footer class="dlg-foot">{@render footer()}</footer>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    /* viewport-fit=cover: keep the dialog clear of notch/home-indicator on all sides. */
    padding: max(clamp(0.6rem, 4vh, 3rem), env(safe-area-inset-top))
      max(0.8rem, env(safe-area-inset-right))
      max(clamp(0.6rem, 4vh, 3rem), env(safe-area-inset-bottom))
      max(0.8rem, env(safe-area-inset-left));
    overflow-y: auto;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 0;
    border: 0;
    cursor: default;
    background: rgba(15, 23, 42, 0.5);
    backdrop-filter: blur(2px);
  }
  .dialog {
    position: relative;
    z-index: 1;
    width: min(560px, 100%);
    /* 100% of the overlay's content box already excludes its (safe-area) padding,
       so the header/footer never clip on short landscape — the body scrolls instead. */
    max-height: 100%;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-lg);
    animation: pop var(--dur) var(--ease-out);
  }
  .dialog.wide { width: min(880px, 100%); }
  .dlg-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.2rem;
    border-bottom: 1px solid var(--border);
  }
  .dlg-head h3 { font-size: 1.15rem; }
  .dlg-head .x {
    appearance: none; border: 0; background: transparent;
    font-size: 1.6rem; line-height: 1; color: var(--text-faint); cursor: pointer;
    min-width: 44px; min-height: 44px;
    margin: -0.5rem -0.4rem -0.5rem 0; /* keep header height tidy while giving a 44px hit area */
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: var(--r-sm);
    touch-action: manipulation;
  }
  .dlg-body { padding: 1.2rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem; }
  .dlg-foot { padding: 0.9rem 1.2rem; border-top: 1px solid var(--border); display: flex; gap: 0.6rem; justify-content: flex-end; flex-wrap: wrap; }
  @keyframes pop { from { transform: translateY(0.8rem) scale(0.98); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
</style>
