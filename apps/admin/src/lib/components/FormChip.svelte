<script lang="ts">
  import { contrastText } from '@mgs/ui';
  import type { Form } from '@mgs/config-types';

  let { form, formId, forms = [] }: { form?: Form; formId?: string; forms?: Form[] } = $props();

  const resolved = $derived(form ?? forms.find((f) => f.id === formId));
</script>

{#if resolved}
  <span class="chip form-chip" style="background:{resolved.colour}; color:{contrastText(resolved.colour)}">{resolved.label}</span>
{:else if formId}
  <span class="chip form-chip unknown">{formId}</span>
{/if}

<style>
  .form-chip {
    font-size: 0.82rem;
    padding: 0.22em 0.6em;
    box-shadow: var(--shadow-sm);
    max-width: 9rem;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .unknown { background: var(--surface-3); color: var(--text-muted); }
</style>
