/** Imperative confirm dialog state. `await confirm({...})` resolves true/false. */

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set, the user must type a reason; the resolved value is the reason string (or null if cancelled). */
  requireReason?: boolean;
  reasonLabel?: string;
  /** When set, the user must type this exact phrase to enable the confirm button (destructive gate). */
  requireText?: string;
  textLabel?: string;
}

interface ActiveConfirm extends ConfirmOptions {
  id: number;
  resolve: (value: boolean | string | null) => void;
}

export const confirmState = $state({ active: null as ActiveConfirm | null });

let seq = 0;

/** Standard yes/no confirm. Resolves true if confirmed. */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    confirmState.active = {
      ...opts,
      id: ++seq,
      resolve: (v) => resolve(v === true),
    };
  });
}

/** Confirm that collects a required reason. Resolves the reason string, or null if cancelled. */
export function confirmWithReason(opts: Omit<ConfirmOptions, 'requireReason'>): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    confirmState.active = {
      ...opts,
      requireReason: true,
      id: ++seq,
      resolve: (v) => resolve(typeof v === 'string' ? v : null),
    };
  });
}

/**
 * Destructive confirm gated behind typing an exact phrase (e.g. 'DELETE'). The confirm button
 * stays disabled until the typed text matches. Resolves true only if confirmed. Defaults to danger.
 */
export function confirmWithText(opts: Omit<ConfirmOptions, 'requireReason' | 'requireText'>, requireText: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    confirmState.active = {
      danger: true,
      ...opts,
      requireText,
      id: ++seq,
      resolve: (v) => resolve(v === true),
    };
  });
}

export function resolveConfirm(value: boolean | string | null): void {
  confirmState.active?.resolve(value);
  confirmState.active = null;
}
