// Tracks a newly-deployed app version detected by the service worker, so the field app can move
// itself onto the latest release without anyone hard-refreshing. `ready` flips true once a new
// version is installed and waiting; applyUpdate() activates it and the page reloads onto the new
// shell (via the service worker's `controllerchange`).
export const appUpdate = $state({
  ready: false,
  reg: null as ServiceWorkerRegistration | null,
});

export function applyUpdate(): void {
  const waiting = appUpdate.reg?.waiting;
  if (waiting) {
    waiting.postMessage({ type: 'SKIP_WAITING' });
  } else {
    // No waiting worker to hand off to — a plain reload still fetches the fresh shell.
    location.reload();
  }
}
