/**
 * Central reactive data layer for the admin console.
 * Subscribes (onSnapshot) to season config, roster, contests, records, standings,
 * control, submissions, access codes and audit once the user is an authenticated admin.
 */

import {
  onSnapshot,
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb, paths, getSeasonId, SEASON_ID } from '@mgs/firebase';
import { nowMinutes } from '@mgs/ui';
import type {
  SeasonConfig,
  Form,
  EventDef,
  Contest,
  RecordDoc,
  Standings,
  DisplayControl,
  Submission,
  AuditEntry,
  ScheduleDoc,
} from '@mgs/config-types';

export interface AccessCodeDoc {
  id: string;
  code?: string; // plaintext (admin-only) for re-showing the QR/link; absent on codes created before this was stored
  codeHash: string;
  areaCode: string;
  eventScope: string[];
  expiresAt: number;
  maxMints: number;
  mints: number;
  active: boolean;
  createdAt: number;
  lastMintedAt?: number;
}

export interface AdminDoc {
  uid: string;
  email: string;
  name?: string;
  addedBy?: string;
  addedAt?: number;
}

export const data = $state({
  config: null as SeasonConfig | null,
  forms: [] as Form[],
  events: [] as EventDef[],
  contests: [] as Contest[],
  records: [] as RecordDoc[],
  standings: null as Standings | null,
  control: null as DisplayControl | null,
  submissions: [] as Submission[], // pending only
  clarifying: [] as Submission[], // sent back to a prefect, awaiting their resubmit
  discarded: [] as Submission[], // deleted as junk — reversible (status 'rejected')
  accessCodes: [] as AccessCodeDoc[],
  admins: [] as AdminDoc[],
  audit: [] as AuditEntry[],
  schedule: null as ScheduleDoc | null,
  clockMin: nowMinutes(new Date()), // local time-of-day, ticked so now/next/overdue stays fresh
  ready: false,
  connected: false, // true only while we are actually receiving server (non-cache) data
});

let unsubs: Unsubscribe[] = [];
let clockTimer: ReturnType<typeof setInterval> | undefined;

export function startData(): void {
  if (unsubs.length) return;
  const db = getDb();

  // A dropped network doesn't error onSnapshot — it just keeps serving cache. Track real
  // connectivity from snapshot metadata (+ the offline event) so the status strip can't
  // claim "Live data" while the tent is actually offline on stale standings.
  const onOffline = () => (data.connected = false);
  window.addEventListener('offline', onOffline);
  unsubs.push(() => window.removeEventListener('offline', onOffline));

  unsubs.push(
    onSnapshot(doc(db, paths.season()), (snap) => {
      data.config = (snap.data() as SeasonConfig) ?? null;
      data.ready = true;
    }),
  );

  unsubs.push(
    onSnapshot(collection(db, paths.forms()), (snap) => {
      data.forms = snap.docs.map((d) => d.data() as Form).sort((a, b) => a.year.localeCompare(b.year) || a.order - b.order);
    }),
  );

  unsubs.push(
    onSnapshot(collection(db, paths.events()), (snap) => {
      data.events = snap.docs.map((d) => d.data() as EventDef).sort((a, b) => a.order - b.order);
    }),
  );

  unsubs.push(
    onSnapshot(collection(db, paths.contests()), (snap) => {
      data.contests = snap.docs.map((d) => d.data() as Contest);
    }),
  );

  unsubs.push(
    onSnapshot(collection(db, paths.records()), (snap) => {
      data.records = snap.docs.map((d) => d.data() as RecordDoc);
    }),
  );

  unsubs.push(
    onSnapshot(doc(db, paths.standings()), { includeMetadataChanges: true }, (snap) => {
      data.standings = (snap.data() as Standings) ?? null;
      data.connected = !snap.metadata.fromCache;
    }),
  );

  unsubs.push(
    onSnapshot(doc(db, paths.control()), (snap) => {
      data.control = (snap.data() as DisplayControl) ?? null;
    }),
  );

  unsubs.push(
    onSnapshot(doc(db, paths.schedule()), (snap) => {
      data.schedule = (snap.data() as ScheduleDoc) ?? null;
    }),
  );

  if (!clockTimer) clockTimer = setInterval(() => (data.clockMin = nowMinutes(new Date())), 15000);

  unsubs.push(
    onSnapshot(
      query(collection(db, paths.submissions()), where('status', '==', 'pending'), orderBy('clientCreatedAt', 'asc')),
      (snap) => {
        // Submissions share one collection; show only those for the active (live or dry-run) season.
        data.submissions = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Submission, 'id'>) }))
          .filter((s) => (s.seasonId ?? SEASON_ID) === getSeasonId());
      },
    ),
  );

  // Submissions the tent has sent back for clarification — shown separately so the operator
  // can see what's awaiting a prefect (single-field equality query needs no composite index).
  unsubs.push(
    onSnapshot(query(collection(db, paths.submissions()), where('status', '==', 'clarify')), (snap) => {
      data.clarifying = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Submission, 'id'>) }))
        .filter((s) => (s.seasonId ?? SEASON_ID) === getSeasonId())
        .sort((a, b) => a.clientCreatedAt - b.clientCreatedAt);
    }),
  );

  // Submissions deleted as junk (status 'rejected') — kept visible so a mistaken delete can be
  // restored (single-field equality query needs no composite index).
  unsubs.push(
    onSnapshot(query(collection(db, paths.submissions()), where('status', '==', 'rejected')), (snap) => {
      data.discarded = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Submission, 'id'>) }))
        .filter((s) => (s.seasonId ?? SEASON_ID) === getSeasonId())
        .sort((a, b) => a.clientCreatedAt - b.clientCreatedAt);
    }),
  );

  unsubs.push(
    onSnapshot(collection(db, 'accessCodes'), (snap) => {
      data.accessCodes = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<AccessCodeDoc, 'id'>) }))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    }),
  );

  unsubs.push(
    onSnapshot(collection(db, 'admins'), (snap) => {
      data.admins = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<AdminDoc, 'uid'>) }));
    }),
  );

  unsubs.push(
    onSnapshot(query(collection(db, paths.audit()), orderBy('ts', 'desc'), limit(100)), (snap) => {
      data.audit = snap.docs.map((d) => d.data() as AuditEntry);
    }),
  );
}

export function stopData(): void {
  unsubs.forEach((u) => u());
  unsubs = [];
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = undefined;
  }
  data.ready = false;
  data.connected = false;
}
