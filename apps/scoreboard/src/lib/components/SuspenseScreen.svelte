<script lang="ts">
  let { message = null }: { message?: string | null } = $props();
</script>

<div class="suspense">
  <div class="halo"></div>
  <div class="lock">🔒</div>
  <h1>{message ?? 'Scores under wraps'}</h1>
  <p class="lead">We're keeping the latest results a secret for a moment…</p>
  <p class="sub">Stay tuned — back live shortly!</p>
  <div class="dots"><span></span><span></span><span></span></div>
</div>

<style>
  .suspense {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 0.6rem;
    padding: max(2rem, env(safe-area-inset-top)) max(2rem, env(safe-area-inset-right))
      max(2rem, env(safe-area-inset-bottom)) max(2rem, env(safe-area-inset-left));
    position: relative;
    overflow: hidden;
  }
  .halo {
    position: absolute;
    width: min(80vmin, 620px);
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(circle, color-mix(in srgb, var(--gold) 26%, transparent), transparent 62%);
    animation: breathe 4s var(--ease-out) infinite;
    z-index: 0;
  }
  .lock {
    font-size: clamp(4rem, 14vw, 9rem);
    z-index: 1;
    filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.5));
    animation: float 3.5s ease-in-out infinite;
  }
  h1 {
    z-index: 1;
    font-size: clamp(2rem, 7vw, 4.5rem);
    background: linear-gradient(92deg, #fff, var(--gold));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    max-width: 100%;
    overflow-wrap: anywhere;
    word-break: break-word;
    hyphens: auto;
  }
  .lead { z-index: 1; font-size: clamp(1.1rem, 3vw, 1.8rem); font-weight: 600; color: var(--text); }
  .sub { z-index: 1; color: var(--text-muted); font-size: clamp(0.9rem, 2vw, 1.15rem); }
  .dots { display: flex; gap: 0.5rem; margin-top: 1rem; z-index: 1; }
  .dots span { width: 12px; height: 12px; border-radius: 50%; background: var(--gold); animation: blink 1.4s infinite both; }
  .dots span:nth-child(2) { animation-delay: 0.2s; }
  .dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes breathe { 0%, 100% { transform: scale(0.92); opacity: 0.6; } 50% { transform: scale(1.05); opacity: 1; } }
  @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
  @keyframes blink { 0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }

  /* High-contrast: gradient-clipped title would vanish — fall back to a solid colour. */
  @media (forced-colors: active) {
    h1 { -webkit-text-fill-color: CanvasText; color: CanvasText; background: none; }
  }
</style>
