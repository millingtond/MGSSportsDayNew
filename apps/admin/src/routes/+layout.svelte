<script lang="ts">
  import '@fontsource-variable/inter';
  import '@mgs/ui/tokens.css';
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { auth, startAuth, doSignOut } from '$lib/auth.svelte';
  import { startData, stopData, data } from '$lib/data.svelte';
  import { startAutoBackup, stopAutoBackup } from '$lib/backup.svelte';
  import SignIn from '$lib/components/SignIn.svelte';
  import Toasts from '$lib/components/Toasts.svelte';
  import ConfirmHost from '$lib/components/ConfirmHost.svelte';
  import Crest from '$lib/components/Crest.svelte';
  import { isDryRun, getSeasonId } from '@mgs/firebase';

  let { children } = $props();

  let menuOpen = $state(false);
  const dryRun = isDryRun();
  const seasonName = getSeasonId();
  const mode = $derived(data.control?.mode ?? 'live');
  const modeLabel = $derived(
    mode === 'live' ? '● Board is LIVE' : mode === 'suspense' ? '⏸ Suspense — board hidden' : '🏆 Champions revealed',
  );

  onMount(() => {
    startAuth();
    return () => stopData();
  });

  // Start/stop the data layer in step with admin status.
  let dataRunning = false;
  $effect(() => {
    if (auth.isAdmin && !dataRunning) {
      dataRunning = true;
      startData();
      startAutoBackup();
    } else if (!auth.isAdmin && dataRunning) {
      dataRunning = false;
      stopData();
      stopAutoBackup();
    }
  });

  const pendingCount = $derived(data.submissions.length);
  const path = $derived($page.url.pathname.replace(/\/$/, '') || '/');

  interface NavItem {
    href: string;
    label: string;
    ico: string;
    badge?: () => number;
  }
  const nav: NavItem[] = [
    { href: '/', label: 'Dashboard', ico: '📊' },
    { href: '/standings', label: 'Champions Sheet', ico: '🏆' },
    { href: '/queue', label: 'Review Queue', ico: '📥', badge: () => pendingCount },
    { href: '/schedule', label: 'Schedule', ico: '🗓️' },
    { href: '/map', label: 'Venue map', ico: '🗺️' },
    { href: '/contests', label: 'Contests', ico: '🏁' },
    { href: '/records', label: 'Records', ico: '🥇' },
    { href: '/config', label: 'Config', ico: '⚙️' },
    { href: '/access', label: 'Access codes', ico: '🔑' },
    { href: '/prefects', label: 'Prefects', ico: '🙋' },
    { href: '/admins', label: 'Admins', ico: '👥' },
    { href: '/audit', label: 'Audit log', ico: '📜' },
  ];

  function isActive(href: string): boolean {
    return href === '/' ? path === '/' : path.startsWith(href);
  }
</script>

<Toasts />
<ConfirmHost />

{#if !auth.ready}
  <div class="boot">Loading…</div>
{:else if !auth.isAdmin}
  <SignIn />
{:else}
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="mark"><Crest /></div>
        <div>
          <h1>Sports Day</h1>
          <div class="sub">Results Console</div>
        </div>
      </div>
      {#each nav as item}
        <a class="nav-link" class:active={isActive(item.href)} href={item.href}>
          <span class="ico">{item.ico}</span>
          <span>{item.label}</span>
          {#if item.badge && item.badge() > 0}
            <span class="pill-count">{item.badge()}</span>
          {/if}
        </a>
      {/each}
      <div class="spacer"></div>
      <div class="who-box">
        <div class="email">{auth.email}</div>
        <button class="btn btn-ghost" style="padding:0.5rem 0.6rem; font-size:0.85rem; justify-content:flex-start;" onclick={doSignOut}>Sign out</button>
      </div>
    </aside>

    <header class="topbar-mobile">
      <div class="mark"><Crest /></div>
      <h1>Results Console</h1>
      <button class="btn menu-btn" onclick={() => (menuOpen = !menuOpen)} aria-expanded={menuOpen}>
        {menuOpen ? '✕' : '☰'} Menu
      </button>
    </header>
    <nav class="mobile-drawer" class:open={menuOpen}>
      {#each nav as item}
        <a class="nav-link" class:active={isActive(item.href)} href={item.href} onclick={() => (menuOpen = false)}>
          <span class="ico">{item.ico}</span>
          <span>{item.label}</span>
          {#if item.badge && item.badge() > 0}
            <span class="pill-count">{item.badge()}</span>
          {/if}
        </a>
      {/each}
      <button class="btn btn-ghost" style="justify-content:flex-start" onclick={doSignOut}>Sign out ({auth.email})</button>
    </nav>

    <main class="main">
      {#if dryRun}
        <div class="dryrun-banner">⚠ DRY RUN — “{seasonName}” · everything here affects the rehearsal season only, not the live event</div>
      {/if}
      <div class="status-strip mode-{mode}">
        <span class="ss-mode">{modeLabel}</span>
        {#if pendingCount > 0}<span class="ss-item">{pendingCount} pending</span>{/if}
        <span class="ss-grow"></span>
        <span class="ss-conn" class:on={data.connected} class:off={data.ready && !data.connected}>
          {data.connected ? '● Live data' : data.ready ? '⚠ Offline — reconnecting' : 'Connecting…'}
        </span>
      </div>
      {@render children()}
    </main>
  </div>
{/if}

<style>
  .boot { min-height: 100dvh; display: grid; place-items: center; color: var(--text-muted); font-weight: 600; }
</style>
