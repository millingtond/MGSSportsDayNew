<script lang="ts">
  import { auth, signIn, createAccount, claimFirstAdmin, doSignOut } from '$lib/auth.svelte';
  import { toast, errMessage } from '$lib/toast.svelte';

  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let claimFailed = $state(false);
  let claimError = $state('');

  async function handle(mode: 'signin' | 'create') {
    if (!email || !password) {
      toast.error('Enter an email and password.');
      return;
    }
    busy = true;
    try {
      if (mode === 'signin') await signIn(email, password);
      else await createAccount(email, password);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      busy = false;
    }
  }

  async function claim() {
    busy = true;
    claimFailed = false;
    try {
      await claimFirstAdmin();
      toast.success('You are now an admin.');
    } catch (e) {
      claimFailed = true;
      claimError = errMessage(e);
      toast.error(claimError);
    } finally {
      busy = false;
    }
  }
</script>

<div class="auth-wrap">
  <div class="auth-card card">
    <div class="brand">
      <div class="mark">🏆</div>
      <div>
        <h1>MGS Sports Day</h1>
        <div class="sub">Results Console</div>
      </div>
    </div>

    {#if !auth.user}
      <p class="lede">Sign in to manage results, the public scoreboard, and access codes.</p>
      <form
        onsubmit={(e) => {
          e.preventDefault();
          handle('signin');
        }}
      >
        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" autocomplete="username" bind:value={email} placeholder="you@mgs.org" />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" type="password" autocomplete="current-password" bind:value={password} placeholder="••••••••" />
        </div>
        <div class="actions">
          <button class="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : 'Sign in'}
          </button>
          <button class="btn btn-block" type="button" disabled={busy} onclick={() => handle('create')}>
            Create account
          </button>
        </div>
      </form>
    {:else}
      <p class="lede">
        Signed in as <b>{auth.email}</b>, but this account is not an admin yet.
      </p>
      <div class="actions">
        <button class="btn btn-primary btn-block" disabled={busy} onclick={claim}>
          {busy ? 'Checking…' : 'Claim admin access'}
        </button>
        {#if claimFailed}
          <p class="note err">Couldn't claim admin: {claimError}</p>
          <p class="note faint">Try reloading. If it keeps failing, an existing admin can add you from the Admins page.</p>
        {:else}
          <p class="note faint">The first user to claim becomes the founding admin.</p>
        {/if}
        <button class="btn btn-ghost btn-block" disabled={busy} onclick={doSignOut}>Sign out</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .auth-wrap { min-height: 100dvh; display: grid; place-items: center; padding: 1.2rem; }
  .auth-card { width: min(420px, 100%); padding: 1.8rem; display: flex; flex-direction: column; gap: 1.1rem; }
  .brand { display: flex; align-items: center; gap: 0.8rem; }
  .brand .mark {
    width: 48px; height: 48px; border-radius: 14px;
    background: linear-gradient(150deg, var(--mgs-navy-2), var(--mgs-navy));
    display: grid; place-items: center; font-size: 1.5rem; box-shadow: var(--shadow-sm);
  }
  .brand h1 { font-size: 1.3rem; }
  .brand .sub { font-size: 0.74rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-faint); }
  .lede { color: var(--text-muted); font-size: 0.92rem; line-height: 1.5; }
  form { display: flex; flex-direction: column; gap: 0.9rem; }
  .actions { display: flex; flex-direction: column; gap: 0.6rem; }
  .note { font-size: 0.82rem; color: var(--text-muted); line-height: 1.4; }
  .note.err { color: var(--danger); font-weight: 600; }
</style>
