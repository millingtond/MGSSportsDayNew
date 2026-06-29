<script lang="ts">
  import type { ContestStatus } from '@mgs/config-types';

  let { status }: { status: ContestStatus } = $props();

  const meta: Record<ContestStatus, { label: string; cls: string }> = {
    outstanding: { label: 'Outstanding', cls: 'out' },
    committed: { label: 'Committed', cls: 'ok' },
    void: { label: 'Void', cls: 'void' },
  };
</script>

<span class="badge {meta[status].cls}">
  <span class="dot"></span>{meta[status].label}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.74rem;
    font-weight: 800;
    padding: 0.2rem 0.55rem;
    border-radius: var(--r-pill);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; }
  .ok { background: var(--up-soft); color: var(--up); }
  .ok .dot { background: var(--up); }
  .out { background: var(--surface-3); color: var(--text-muted); }
  .out .dot { background: var(--text-faint); }
  .void { background: var(--down-soft); color: var(--down); }
  .void .dot { background: var(--down); }
</style>
