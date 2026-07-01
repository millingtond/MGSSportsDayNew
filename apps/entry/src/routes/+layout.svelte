<script lang="ts">
  import { onMount } from 'svelte';
  import '@fontsource-variable/inter';
  import '@mgs/ui/tokens.css';
  import '../app.css';
  import { appUpdate } from '$lib/updates.svelte';

  let { children } = $props();

  // Register the offline app-shell service worker AND keep the field app on the latest deploy:
  // detect a new version, then let the page apply it (silently when idle, or on a tap mid-entry).
  onMount(() => {
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

    // When a new worker takes control, the cached shell is the new version — reload onto it once.
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });

    navigator.serviceWorker
      .register('/service-worker.js')
      .then((reg) => {
        appUpdate.reg = reg;
        // Only flag an *update* (a new worker while one already controls the page), never the
        // very first install — that would pop an "update" banner on a prefect's first visit.
        const markReady = () => {
          if (navigator.serviceWorker.controller) appUpdate.ready = true;
        };
        if (reg.waiting) markReady();
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed') markReady();
          });
        });

        // Look for a fresh deploy: on a timer, whenever the app regains focus, and on reconnect.
        const check = () => void reg.update().catch(() => {});
        setInterval(check, 60_000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
        window.addEventListener('online', check);
      })
      .catch(() => {});
  });
</script>

{@render children()}
