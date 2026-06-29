/** Shared constants for the admin console. */
import { isDryRun, getSeasonId } from '@mgs/firebase';

function usingEmulators(): boolean {
  try {
    return (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_USE_EMULATORS === '1';
  } catch {
    return false;
  }
}

/** Base URL of the prefect entry app (where station QR codes point). */
export const ENTRY_BASE = usingEmulators() ? 'http://localhost:5175' : 'https://mgssportsday-entry.web.app';

export function entryUrl(code: string): string {
  // In a dry-run, carry the season so a scanned QR opens the rehearsal — not the live board.
  const season = isDryRun() ? `&season=${getSeasonId()}` : '';
  return `${ENTRY_BASE}/?code=${code}${season}`;
}
