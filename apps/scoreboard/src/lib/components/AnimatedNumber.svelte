<script lang="ts">
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  let { value = 0, duration = 750 }: { value?: number; duration?: number } = $props();

  // Respect reduced-motion: snap straight to the value rather than spinning the count up.
  const reduce =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = tweened(value, { duration: reduce ? 0 : duration, easing: cubicOut });
  $effect(() => {
    store.set(value);
  });
</script>

<span class="num">{Math.round($store)}</span>
