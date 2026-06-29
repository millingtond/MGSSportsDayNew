<script lang="ts">
  import { data } from '$lib/data.svelte';
  import { auth } from '$lib/auth.svelte';
  import { addAdmin, removeAdmin } from '$lib/api';
  import { toast, errMessage } from '$lib/toast.svelte';
  import { confirm } from '$lib/confirm.svelte';
  import { formatDateTime } from '$lib/helpers';

  let email = $state('');
  let busy = $state(false);
  let removingUid = $state<string | null>(null);

  async function add() {
    if (!email.trim()) {
      toast.error('Enter an email address.');
      return;
    }
    busy = true;
    try {
      await addAdmin(email.trim().toLowerCase());
      toast.success(`${email.trim()} is now an admin.`);
      email = '';
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      busy = false;
    }
  }

  async function remove(uid: string, label: string) {
    const ok = await confirm({
      title: 'Remove admin?',
      message: `${label} will lose admin access immediately and be signed out.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    removingUid = uid;
    try {
      await removeAdmin(uid);
      toast.success(`${label} removed.`);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      removingUid = null;
    }
  }
</script>

<div class="page-head">
  <div>
    <h2>Admins</h2>
    <div class="lede">Admins can manage all results and the public display. A user must have signed in once before they can be added.</div>
  </div>
</div>

<section class="card section-card">
  <div class="section-title">➕ Add an admin</div>
  <div class="add-row">
    <div class="field" style="flex:1">
      <label for="admin-email">Email address</label>
      <input
        id="admin-email"
        type="email"
        bind:value={email}
        placeholder="colleague@mgs.org"
        onkeydown={(e) => e.key === 'Enter' && add()}
      />
    </div>
    <button class="btn btn-primary" disabled={busy} onclick={add}>{busy ? 'Adding…' : 'Add admin'}</button>
  </div>
</section>

<section class="card section-card">
  <div class="section-title">👥 Current admins ({data.admins.length})</div>
  {#if data.admins.length === 0}
    <div class="loading-state">Loading admins…</div>
  {:else}
    <div class="table-scroll">
      <table class="data">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Added</th><th></th></tr>
        </thead>
        <tbody>
          {#each data.admins as a (a.uid)}
            <tr>
              <td>
                <b>{a.name ?? '—'}</b>
                {#if a.uid === auth.uid}<span class="tag you">You</span>{/if}
              </td>
              <td class="muted">{a.email ?? '—'}</td>
              <td class="faint">{formatDateTime(a.addedAt)}</td>
              <td>
                {#if a.uid !== auth.uid}
                  <button class="btn btn-danger" style="padding:0.35rem 0.9rem; min-width:88px" disabled={removingUid === a.uid} onclick={() => remove(a.uid, a.email ?? a.uid)}>
                    {removingUid === a.uid ? '…' : 'Remove'}
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .add-row { display: flex; gap: 0.7rem; align-items: flex-end; flex-wrap: wrap; }
  .table-scroll { overflow-x: auto; }
  .tag.you { background: var(--brand-soft); color: var(--brand-strong); margin-left: 0.4rem; }
</style>
