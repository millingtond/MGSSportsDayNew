/** Lightweight toast notifications (success / error / info). */

export type ToastKind = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

export const toastState = $state({ items: [] as Toast[] });

let seq = 0;

export function pushToast(kind: ToastKind, message: string, ttl = 4500): number {
  const id = ++seq;
  toastState.items = [...toastState.items, { id, kind, message }];
  if (ttl > 0) {
    setTimeout(() => dismissToast(id), ttl);
  }
  return id;
}

export function dismissToast(id: number): void {
  toastState.items = toastState.items.filter((t) => t.id !== id);
}

export const toast = {
  success: (m: string) => pushToast('success', m),
  error: (m: string) => pushToast('error', m, 7000),
  info: (m: string) => pushToast('info', m),
};

/** Pull a friendly message out of a thrown Firebase/callable error. */
export function errMessage(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as { message?: string; code?: string };
    if (anyE.message) return anyE.message;
    if (anyE.code) return anyE.code;
  }
  return String(e);
}
