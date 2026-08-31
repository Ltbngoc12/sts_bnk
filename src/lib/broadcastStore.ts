// Server-side persistence for Broadcast configuration + notifications.
//
// Uses the same MongoDB client (`sentosa-cms` database) and the same upsert-by-`id`
// convention as db.ts's saveCollection(), but is kept separate from the big
// getDb()/saveDb() hydrate/dehydrate pipeline because these collections carry no
// derived fields. Each collection seeds its FSD-aligned defaults on first read.
//
// SERVER ONLY — imports the Mongo client. Do not import from client components.

import { Db } from 'mongodb';
import clientPromise from './mongodb';
import { DistributionGroup, DEFAULT_GROUPS } from './groups';
import {
  BroadcastTemplate,
  BroadcastMatrixRule,
  BroadcastChannel,
  BroadcastConfig,
  BroadcastActionPromptRule,
  NotificationRecord,
  DEFAULT_BROADCAST_TEMPLATES,
  DEFAULT_BROADCAST_MATRIX,
  DEFAULT_BROADCAST_CHANNELS,
  DEFAULT_BROADCAST_CONFIG,
  DEFAULT_BROADCAST_PROMPT_RULES,
  DEFAULT_BROADCAST_DISTRIBUTION_GROUPS,
} from './broadcastConfig';

async function mdb(): Promise<Db> {
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB_NAME || undefined);
}

// In-memory cache fallback when MongoDB is down/unreachable
const inMemoryCache: Record<string, any[]> = {};
let inMemoryNotifications: NotificationRecord[] = [];

// Read a collection; if empty, seed it with the provided defaults and return those.
async function readOrSeed<T extends { id: string }>(name: string, defaults: T[]): Promise<T[]> {
  try {
    const db = await mdb();
    const col = db.collection(name);
    const docs = await col.find({}, { projection: { _id: 0 } }).toArray();
    if (docs.length === 0 && defaults.length > 0) {
      await col.insertMany(defaults.map((d) => ({ ...d })) as any[]);
      inMemoryCache[name] = defaults.map((d) => ({ ...d }));
      return defaults;
    }
    inMemoryCache[name] = docs as unknown as T[];
    return docs as unknown as T[];
  } catch (err: any) {
    if (!inMemoryCache[name]) {
      inMemoryCache[name] = defaults.map((d) => ({ ...d }));
    }
    return inMemoryCache[name] as T[];
  }
}

// Replace the entire collection with `docs` (upsert-by-id, prune removed).
async function replaceAll<T extends { id: string }>(name: string, docs: T[]): Promise<void> {
  inMemoryCache[name] = docs.map((d) => ({ ...d }));
  try {
    const db = await mdb();
    const col = db.collection(name);
    if (docs.length === 0) {
      await col.deleteMany({});
      return;
    }
    await col.bulkWrite(
      docs.map((doc) => ({
        replaceOne: { filter: { id: doc.id }, replacement: { ...doc }, upsert: true },
      })) as any[]
    );
    await col.deleteMany({ id: { $nin: docs.map((d) => d.id) } });
  } catch (err: any) {
    // Ignore MongoDB write errors in offline fallback mode
  }
}

// ── Distribution Groups — Task module (FSD §10.3) ──────────────────────────────
export const getDistributionGroups = () =>
  readOrSeed<DistributionGroup>('distributionGroups', DEFAULT_GROUPS);
export const saveDistributionGroups = (g: DistributionGroup[]) =>
  replaceAll('distributionGroups', g);

// ── Distribution Groups — Broadcast module only (2026-07-27, Kyle) ─────────────
// Deliberately a separate collection from `distributionGroups` above — see
// DEFAULT_BROADCAST_DISTRIBUTION_GROUPS comment in broadcastConfig.ts.
export const getBroadcastDistributionGroups = () =>
  readOrSeed<DistributionGroup>('broadcastDistributionGroups', DEFAULT_BROADCAST_DISTRIBUTION_GROUPS);
export const saveBroadcastDistributionGroups = (g: DistributionGroup[]) =>
  replaceAll('broadcastDistributionGroups', g);

// ── Broadcast Templates (FSD §10.4) ────────────────────────────────────────────
export const getBroadcastTemplates = () =>
  readOrSeed<BroadcastTemplate>('broadcastTemplates', DEFAULT_BROADCAST_TEMPLATES);
export const saveBroadcastTemplates = (t: BroadcastTemplate[]) =>
  replaceAll('broadcastTemplates', t);

// ── Broadcast Matrix (FSD §10.6) ───────────────────────────────────────────────
export const getBroadcastMatrix = () =>
  readOrSeed<BroadcastMatrixRule>('broadcastMatrixRules', DEFAULT_BROADCAST_MATRIX);
export const saveBroadcastMatrix = (m: BroadcastMatrixRule[]) =>
  replaceAll('broadcastMatrixRules', m);

// ── Delivery Channels (FSD §10.2) ──────────────────────────────────────────────
export const getBroadcastChannels = () =>
  readOrSeed<BroadcastChannel>('broadcastChannels', DEFAULT_BROADCAST_CHANNELS);
export const saveBroadcastChannels = (c: BroadcastChannel[]) =>
  replaceAll('broadcastChannels', c);

// ── Broadcast Action Prompt Rules (admin config redesign, 2026-07-25) ──────────
export const getBroadcastPromptRules = () =>
  readOrSeed<BroadcastActionPromptRule>('broadcastPromptRules', DEFAULT_BROADCAST_PROMPT_RULES);
export const saveBroadcastPromptRules = (r: BroadcastActionPromptRule[]) =>
  replaceAll('broadcastPromptRules', r);

// Convenience lookup used by the two trigger call sites (incidents/[...id] `close`
// action and cron/eod-broadcast) — returns the first Active rule for the event, or
// undefined if none configured/enabled (in which case the caller sends nothing,
// no hardcoded fallback).
export async function getActivePromptRule(
  triggerEvent: BroadcastActionPromptRule['triggerEvent']
): Promise<BroadcastActionPromptRule | undefined> {
  const rules = await getBroadcastPromptRules();
  return rules.find((r) => r.triggerEvent === triggerEvent && r.status === 'Active');
}

// ── Broadcast-level config: EOD timing + closure-required categories (§13.3) ────
// Merges over DEFAULT_BROADCAST_CONFIG rather than returning the persisted doc
// as-is: a Mongo doc saved before 2026-07-26 (Phase 0) predates
// eodExcludedCategories/eodMinCrisisLevel/eodExcludedStatuses/eodSchedulerEnabled
// and would otherwise come back with those fields simply missing, which crashes
// isEodEligible()'s `cfg.eodExcludedStatuses.includes(...)`. This is the same
// forward-compatible-merge approach as hydrateDb() elsewhere in the codebase.
export async function getBroadcastConfig(): Promise<BroadcastConfig> {
  const rows = await readOrSeed<BroadcastConfig>('broadcastConfig', [DEFAULT_BROADCAST_CONFIG]);
  return { ...DEFAULT_BROADCAST_CONFIG, ...(rows[0] || {}) };
}
export const saveBroadcastConfig = (cfg: BroadcastConfig) =>
  replaceAll('broadcastConfig', [{ ...cfg, id: 'singleton' as const }]);

// Records that the EOD cutover check ran for a given calendar night (§10.7,
// gap G8). Backs the lazy-trigger the EOD review tab uses in place of a real
// external scheduler (this deployment has no Vercel Cron / vercel.json — see
// BROADCAST_MODULE_FSD_GAP_AND_UIUX_PLAN.md Phase 3) and lets the UI show
// "Cutover 20:00 · last ran 20:03" instead of losing that the moment the page
// is refreshed (it used to live only in React state).
export async function recordEodRun(eodDate: string): Promise<void> {
  const cfg = await getBroadcastConfig();
  const nowIso = new Date().toISOString();
  await saveBroadcastConfig({
    ...cfg,
    lastEodRunAt: nowIso,
    lastEodRunPerDate: { ...(cfg.lastEodRunPerDate || {}), [eodDate]: nowIso },
  });
}

// ── Notifications mailbox (server-side; FSD §10.5) ─────────────────────────────
export async function getNotifications(): Promise<NotificationRecord[]> {
  try {
    const db = await mdb();
    const docs = await db
      .collection('notifications')
      .find({}, { projection: { _id: 0 } })
      .toArray();
    inMemoryNotifications = docs as unknown as NotificationRecord[];
    return docs as unknown as NotificationRecord[];
  } catch (err: any) {
    return inMemoryNotifications;
  }
}

export async function addNotification(n: Omit<NotificationRecord, 'id' | 'timestamp' | 'read'> & { read?: boolean }): Promise<NotificationRecord> {
  const rec: NotificationRecord = {
    id: `NTF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    read: n.read ?? false,
    userId: n.userId,
    recipientRole: n.recipientRole,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
  };
  inMemoryNotifications.unshift(rec);
  try {
    const db = await mdb();
    await db.collection('notifications').insertOne({ ...rec } as any);
  } catch (err: any) {
    // Ignore offline error
  }
  return rec;
}

export async function markNotificationRead(id: string, read = true): Promise<void> {
  const item = inMemoryNotifications.find((x) => x.id === id);
  if (item) item.read = read;
  try {
    const db = await mdb();
    await db.collection('notifications').updateOne({ id }, { $set: { read } });
  } catch (err: any) {
    // Ignore offline error
  }
}

export async function markAllNotificationsRead(recipientRole?: string): Promise<void> {
  inMemoryNotifications.forEach((x) => {
    if (!recipientRole || x.recipientRole === recipientRole || x.recipientRole === 'All') {
      x.read = true;
    }
  });
  try {
    const db = await mdb();
    const filter = recipientRole ? { $or: [{ recipientRole }, { recipientRole: 'All' }] } : {};
    await db.collection('notifications').updateMany(filter as any, { $set: { read: true } });
  } catch (err: any) {
    // Ignore offline error
  }
}

// Bulk-insert seed/records (used once to seed the mailbox on first read).
export async function insertNotifications(records: NotificationRecord[]): Promise<void> {
  if (records.length === 0) return;
  inMemoryNotifications = [...records, ...inMemoryNotifications];
  try {
    const db = await mdb();
    await db.collection('notifications').insertMany(records.map((r) => ({ ...r })) as any[]);
  } catch (err: any) {
    // Ignore offline error
  }
}

// Clear notifications for a role (and 'All'); no role = clear everything.
export async function clearNotifications(recipientRole?: string): Promise<void> {
  if (recipientRole) {
    inMemoryNotifications = inMemoryNotifications.filter(
      (x) => x.recipientRole !== recipientRole && x.recipientRole !== 'All'
    );
  } else {
    inMemoryNotifications = [];
  }
  try {
    const db = await mdb();
    const filter = recipientRole ? { $or: [{ recipientRole }, { recipientRole: 'All' }] } : {};
    await db.collection('notifications').deleteMany(filter as any);
  } catch (err: any) {
    // Ignore offline error
  }
}
