<script lang="ts">
  import { onMount } from 'svelte';

  let { duration = 6000, count = 180 }: { duration?: number; count?: number } = $props();
  let canvas: HTMLCanvasElement;

  onMount(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Size the backing store from the canvas's own rendered box (not window.innerHeight,
    // which fights the CSS height:100% as the mobile URL bar shows/hides) and account for
    // devicePixelRatio so the confetti is crisp on phones. Draw coords stay in CSS px.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const sync = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    sync();
    const colors = ['#f5b301', '#2563eb', '#ec4899', '#22c55e', '#14b8a6', '#ffffff'];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const parts = Array.from({ length: count }, () => ({
      x: rnd(0, w),
      y: rnd(-h, 0),
      r: rnd(5, 11),
      c: colors[Math.floor(Math.random() * colors.length)] as string,
      vy: rnd(2, 5.5),
      vx: rnd(-1.6, 1.6),
      rot: rnd(0, Math.PI * 2),
      vr: rnd(-0.25, 0.25),
    }));
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const fade = Math.max(0, 1 - (t - start) / duration);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > h + 20) {
          p.y = -10;
          p.x = rnd(0, w);
        }
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.62);
        ctx.restore();
      }
      if (t - start < duration) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.visualViewport?.addEventListener('resize', sync);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      window.visualViewport?.removeEventListener('resize', sync);
    };
  });
</script>

<canvas bind:this={canvas} class="confetti" aria-hidden="true"></canvas>

<style>
  .confetti {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 60;
  }
</style>
