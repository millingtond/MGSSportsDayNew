<script lang="ts">
  import { goto } from '$app/navigation';
  import { data } from '$lib/data.svelte';
  import { formatDateTime } from '$lib/helpers';
  import type { AuditAction, AuditEntry } from '@mgs/config-types';

  const actionMeta: Record<AuditAction, { label: string; cls: string }> = {
    commit: { label: 'Commit', cls: 'commit' },
    correct: { label: 'Correct', cls: 'correct' },
    void: { label: 'Void', cls: 'void' },
    unvoid: { label: 'Unvoid', cls: 'unvoid' },
    'config-change': { label: 'Config', cls: 'config' },
    record: { label: 'Record', cls: 'record' },
    'resolve-duplicate': { label: 'Resolve', cls: 'resolve' },
    clarify: { label: 'Sent back', cls: 'clarify' },
  };

  function meta(a: string) {
    return actionMeta[a as AuditAction] ?? { label: a, cls: 'other' };
  }

  // Route an audit entry to the section of the console it concerns — a contest target
  // deep-links straight to that contest's editor.
  function auditHref(e: AuditEntry): string | null {
    // Targets are written WITHOUT a leading slash, e.g. `contests/Y9__100m__A`, `records/Y9__100m`,
    // `schedule/2026`, `seasons/2026`. Match at a segment boundary so both forms work.
    const t = e.target ?? '';
    const cm = t.match(/(?:^|\/)contests\/([^/]+)/);
    if (cm) return `/contests?c=${encodeURIComponent(cm[1]!)}`;
    if (/(?:^|\/)records\//.test(t)) return '/records';
    if (/(?:^|\/)(forms|yearGroups)\//.test(t)) return '/config';
    if (t.startsWith('schedule/')) return '/schedule';
    if (t.startsWith('accessCodes/')) return '/access';
    if (t.startsWith('seasons/')) return '/config';
    return null;
  }
  function destLabel(href: string): string {
    if (href.startsWith('/contests')) return 'Contests';
    if (href === '/records') return 'Records';
    if (href === '/config') return 'Config';
    if (href === '/schedule') return 'Schedule';
    if (href === '/access') return 'Access codes';
    return 'section';
  }
  function go(e: AuditEntry) {
    const h = auditHref(e);
    if (h) goto(h);
  }
</script>

<div class="page-head">
  <div>
    <h2>Audit log</h2>
    <div class="lede">The most recent {data.audit.length} actions. Every commit, correction, void and config change is recorded. <b>Click a row</b> to open the section it concerns.</div>
  </div>
</div>

<section class="card section-card">
  {#if data.audit.length === 0}
    <div class="empty-state">No audit entries yet.</div>
  {:else}
    <div class="table-scroll">
      <table class="data">
        <thead>
          <tr><th>When</th><th>Action</th><th>Target</th><th>Actor</th><th>Reason</th></tr>
        </thead>
        <tbody>
          {#each data.audit as e, i (e.ts + '-' + i)}
            {@const href = auditHref(e)}
            <tr
              class:clickable={!!href}
              onclick={() => go(e)}
              onkeydown={(ev) => { if (href && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); go(e); } }}
              tabindex={href ? 0 : undefined}
              role={href ? 'link' : undefined}
              title={href ? `Open ${destLabel(href)} →` : undefined}
            >
              <td class="faint nowrap">{formatDateTime(e.ts)}</td>
              <td><span class="act {meta(e.action).cls}">{meta(e.action).label}</span></td>
              <td class="mono">{e.target}{#if href}<span class="go" aria-hidden="true">↗</span>{/if}</td>
              <td>{e.actorName || e.actor}</td>
              <td class="muted reason">{e.reason || '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .table-scroll { overflow-x: auto; }
  .nowrap { white-space: nowrap; }
  .mono { font-family: var(--font-mono); font-size: 0.82rem; overflow-wrap: anywhere; }
  .reason { max-width: 22rem; overflow-wrap: anywhere; word-break: break-word; }
  .act { font-size: 0.72rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: var(--r-pill); text-transform: uppercase; letter-spacing: 0.03em; background: var(--surface-3); color: var(--text-muted); }
  .act.commit { background: var(--up-soft); color: var(--up); }
  .act.correct { background: var(--warn-soft); color: var(--warn); }
  .act.void { background: var(--down-soft); color: var(--down); }
  .act.unvoid { background: var(--brand-soft); color: var(--brand-strong); }
  .act.record { background: var(--gold-soft); color: #7a5c00; }
  .act.config { background: var(--brand-soft); color: var(--brand-strong); }
  .act.clarify { background: var(--warn-soft); color: var(--warn); }
  tr.clickable { cursor: pointer; }
  tr.clickable:hover { background: var(--surface-2); }
  tr.clickable:focus-visible { outline: 2px solid var(--brand); outline-offset: -2px; }
  .go { color: var(--brand); font-weight: 800; margin-left: 0.4rem; opacity: 0.5; }
  tr.clickable:hover .go { opacity: 1; }
</style>
