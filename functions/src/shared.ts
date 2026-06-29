import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { computeStandings } from '@mgs/scoring';
import type {
  SeasonConfig,
  Form,
  Contest,
  RecordDoc,
  Standings,
  AuditAction,
  Placement,
} from '@mgs/config-types';

if (!getApps().length) initializeApp();
export const db = getFirestore();
export const REGION = 'europe-west2';

export function requireAuth(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  return req.auth.uid;
}

export function requireAdmin(req: CallableRequest): string {
  const uid = requireAuth(req);
  if (req.auth!.token.admin !== true) throw new HttpsError('permission-denied', 'Admins only.');
  return uid;
}

export function actorName(req: CallableRequest): string {
  const t = req.auth?.token as Record<string, unknown> | undefined;
  return (t?.name as string) || (t?.email as string) || req.auth?.uid || 'admin';
}

/** Validate a placements array from the client. Rejects duplicates and bad shapes. */
export function validatePlacements(raw: unknown): Placement[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpsError('invalid-argument', 'placements must be a non-empty array');
  }
  const seen = new Set<string>();
  const out: Placement[] = [];
  for (const item of raw) {
    const formId = (item as { formId?: unknown })?.formId;
    const position = (item as { position?: unknown })?.position;
    if (typeof formId !== 'string' || typeof position !== 'number' || !Number.isFinite(position) || position < 1) {
      throw new HttpsError('invalid-argument', 'each placement needs a formId and a position >= 1');
    }
    if (seen.has(formId)) throw new HttpsError('invalid-argument', `form ${formId} appears twice`);
    seen.add(formId);
    const placement: Placement = { formId, position };
    // Optional athlete name (Phase 2: individual champions) — trimmed + length-capped.
    const athleteName = (item as { athleteName?: unknown })?.athleteName;
    if (typeof athleteName === 'string' && athleteName.trim()) {
      placement.athleteName = athleteName.trim().slice(0, 60);
    }
    out.push(placement);
  }
  return out;
}

export async function writeAudit(
  action: AuditAction,
  target: string,
  before: unknown,
  after: unknown,
  actor: string,
  name: string,
  reason: string,
): Promise<void> {
  await db.collection('audit').add({
    ts: Date.now(),
    actor,
    actorName: name,
    action,
    target,
    before: before ?? null,
    after: after ?? null,
    reason: reason || '',
  });
}

/**
 * The authoritative recompute: re-derive the WHOLE standings doc from all committed
 * contests + records + config. Idempotent — never an increment. Carries the previous
 * schoolPos so the scoreboard can draw up/down arrows.
 */
export async function recompute(seasonId: string): Promise<Standings> {
  const seasonRef = db.doc(`seasons/${seasonId}`);
  const standingsRef = db.doc(`standings/${seasonId}`);
  const [configSnap, formsSnap, contestsSnap, recordsSnap, prevSnap] = await Promise.all([
    seasonRef.get(),
    seasonRef.collection('forms').get(),
    seasonRef.collection('contests').get(),
    seasonRef.collection('records').get(),
    standingsRef.get(),
  ]);
  if (!configSnap.exists) throw new HttpsError('failed-precondition', `season ${seasonId} not found`);

  const config = configSnap.data() as SeasonConfig;
  const forms = formsSnap.docs.map((d) => d.data() as Form);
  const contests = contestsSnap.docs.map((d) => d.data() as Contest);
  const records = recordsSnap.docs.map((d) => d.data() as RecordDoc);
  const prevStandings = prevSnap.exists ? (prevSnap.data() as Standings) : null;

  // Diagnostic: a committed placement that points at a form NOT in the roster scores nothing
  // (computeStandings skips unknown forms). This should never happen in normal use (there is no
  // form-delete UI), so if it does, log loudly with the offending ids — it means the roster and
  // committed results have drifted and points are being silently dropped.
  const formIds = new Set(forms.map((f) => f.id));
  const orphanForms = new Set<string>();
  for (const c of contests) {
    if (c.status !== 'committed') continue;
    for (const p of c.placements ?? []) if (!formIds.has(p.formId)) orphanForms.add(p.formId);
  }
  if (orphanForms.size) {
    console.error(
      `recompute(${seasonId}): committed placements reference ${orphanForms.size} unknown form(s) — points dropped:`,
      [...orphanForms].join(', '),
    );
  }

  let standings: Standings;
  try {
    standings = computeStandings({ contests, records, forms, config, prevStandings });
  } catch (e) {
    // computeStandings is defensive and shouldn't throw, but if malformed data ever makes it,
    // fail LOUDLY with context rather than leaving a silently-stale board.
    console.error(`recompute(${seasonId}) failed in computeStandings:`, e);
    throw new HttpsError('internal', 'Could not recompute standings — see logs.');
  }
  standings.computedAt = Date.now();
  await standingsRef.set(standings);
  return standings;
}
