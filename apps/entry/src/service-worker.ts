/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Caches the app shell so the entry app opens with no signal on the field.
// Firebase/Firestore traffic is NEVER intercepted — the SDK owns offline data.

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `mgs-entry-${version}`;
const ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
  // Cache the new shell but DON'T skipWaiting automatically — the page decides when to switch
  // (silently when the prefect is idle, or on a tap mid-entry), so a reload never wipes a
  // half-entered race. The client sends SKIP_WAITING when it's safe to activate.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

sw.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') void sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin) return; // let Firebase handle its own requests

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        return await fetch(req);
      } catch {
        const fallback = await caches.match('/');
        return fallback ?? Response.error();
      }
    })(),
  );
});
