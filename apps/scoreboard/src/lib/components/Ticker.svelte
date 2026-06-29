<script lang="ts">
  import { contrastText } from '@mgs/ui';

  export interface TickItem {
    contestId: string;
    label: string;
    committedAt: number;
    winnerLabel?: string;
    winnerColour?: string;
  }

  let { items = [] }: { items?: TickItem[] } = $props();
</script>

{#if items.length}
  <div class="ticker card" aria-label="Recent results">
    <span class="ticker-label"><span class="dot"></span> RESULTS IN</span>
    <div class="viewport">
      <div class="track">
        {#each [...items, ...items] as r, i (i)}
          <span class="tick">
            {#if r.winnerColour}<span
                class="wchip"
                style="background:{r.winnerColour}; color:{contrastText(r.winnerColour)}">{r.winnerLabel}</span
              >{/if}
            <b>{r.label}</b>
          </span>
          <span class="sep">◆</span>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .ticker {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.55rem 0.9rem;
    overflow: hidden;
  }
  .ticker-label {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 800;
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    color: var(--gold);
  }
  .ticker-label .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--up);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--up) 60%, transparent);
    animation: tickpulse 1.8s infinite;
  }
  @keyframes tickpulse {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--up) 55%, transparent); }
    70% { box-shadow: 0 0 0 7px transparent; }
    100% { box-shadow: 0 0 0 0 transparent; }
  }
  .viewport {
    overflow: hidden;
    flex: 1;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent);
    mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent);
  }
  .track {
    display: inline-flex;
    align-items: center;
    gap: 1rem;
    white-space: nowrap;
    animation: scroll 38s linear infinite;
  }
  .tick {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--text);
  }
  .tick b { font-weight: 700; }
  .wchip {
    font-weight: 800;
    font-size: 0.78rem;
    padding: 0.1rem 0.45rem;
    border-radius: var(--r-sm);
    box-shadow: inset 0 0 0 1.5px rgba(0, 0, 0, 0.14);
  }
  .sep {
    color: var(--gold);
    font-size: 0.6rem;
  }
  @keyframes scroll {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .track { animation: none; }
  }
</style>
