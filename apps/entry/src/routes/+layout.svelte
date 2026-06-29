<script lang="ts">
  import { onMount } from 'svelte';
  import '@fontsource-variable/inter';
  import '@mgs/ui/tokens.css';
  import '../app.css';

  let { children } = $props();

  // Ensure the offline app-shell service worker is registered (belt-and-braces
  // alongside SvelteKit's own registration) so the field app works with no signal.
  onMount(() => {
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    }
  });
</script>

{@render children()}
