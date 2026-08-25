// Server-side persistence for Crisis Management configuration (Module M1 / Epic 1
// of Crisis-Management-Emergency-Recall-Build-Plan.md v1.1, FSD §11.5).
//
// Same MongoDB client (`sentosa-cms` database) and the same readOrSeed/replaceAll
// conventions as broadcastStore.ts, deliberately duplicated rather than shared:
// the two modules seed different defaults and the crisis collections must be
// independently droppable/reseedable without touching broadcast config.
//
// SERVER ONLY — imports the Mongo client. Do not import from client components.
//
// ── COLLECTION SEPARATION (D3 / FSD §11.5.d) ──────────────────────────────────
// `recallGroups` is NOT `broadcastDistributionGroups` and NOT `distributionGroups`.
// Three separate collections now exist for three separate purposes:
//   distributionGroups          → Task module assignment groups (FSD §10.3)
//   broadcastDistributionGroups → Broadcast recipients (2026-07-27)
//   recallGroups                → Emergency recall (FSD §11.5, this file)
// Editing one has no effect on the others. This is intentional and confirmed.

import { Db } from 'mongodb';
import clientPromise from './mongodb';
import {
  RecallGroup,
  RecallMessageTemplate,
  RecallRoutingRule,
  MessagingServiceConfig,
  AckEscalationRule,
  DEFAULT_RECALL_GROUPS,
  DEFAULT_RECALL_TEMPLATES,
  DEFAULT_RECALL_ROUTING_RULES,
  DEFAULT_MESSAGING_SERVICE_CONFIG,
  DEFAULT_ACK_ESCALATION_RULE,
} from './crisisConfig';

async function mdb(): Promise<Db> {
  const client = await clientPromise;
  return client.db('sentosa-cms');
}

async function readOrSeed<T extends { id: string }>(name: string, defaults: T[]): Promise<T[]> {
  const db = await mdb();
  const col = db.collection(name);
  const docs = await col.find({}, { projection: { _id: 0 } }).toArray();
  if (docs.length === 0 && defaults.length > 0) {
    await col.insertMany(defaults.map((d) => ({ ...d })) as any[]);
    return defaults;
  }
  return docs as unknown as T[];
}

async function replaceAll<T extends { id: string }>(name: string, docs: T[]): Promise<void> {
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
}

// ── Recall Groups (FSD §11.5) ─────────────────────────────────────────────────
// Normalised on read for the same reason broadcast-config normalises: this schema
// will change again (tier and roleInGroup were added during the M1 build), and a
// doc saved before a field existed must not crash the UI on `.map()`/`.join()`.
function normalizeGroup(g: any): RecallGroup {
  return {
    id: g.id,
    name: g.name || '',
    description: g.description || '',
    status: g.status === 'Inactive' ? 'Inactive' : 'Active',
    members: Array.isArray(g.members)
      ? g.members.map((m: any) => ({
          id: m.id,
          name: m.name || '',
          roleInGroup: m.roleInGroup || '',
          mobile: m.mobile || '',
          email: m.email || '',
          tier: m.tier || 'Tier 2 — Secondary',
          membershipStatus: m.membershipStatus === 'Inactive' ? 'Inactive' : 'Active',
          userId: m.userId,
          remark: m.remark,
        }))
      : [],
    updatedAt: g.updatedAt,
    updatedBy: g.updatedBy,
  };
}

export async function getRecallGroups(): Promise<RecallGroup[]> {
  const rows = await readOrSeed<RecallGroup>('recallGroups', DEFAULT_RECALL_GROUPS);
  return rows.map(normalizeGroup);
}
export const saveRecallGroups = (g: RecallGroup[]) => replaceAll('recallGroups', g);

// ── Crisis Message Templates ──────────────────────────────────────────────────
function normalizeTemplate(t: any): RecallMessageTemplate {
  return {
    id: t.id,
    name: t.name || '',
    channel: 'SMS',
    subject: t.subject || '',
    body: t.body || '',
    applicableLevels: Array.isArray(t.applicableLevels) ? t.applicableLevels : [],
    status: t.status === 'Inactive' ? 'Inactive' : 'Active',
  };
}

export async function getRecallTemplates(): Promise<RecallMessageTemplate[]> {
  const rows = await readOrSeed<RecallMessageTemplate>('crisisMessageTemplates', DEFAULT_RECALL_TEMPLATES);
  return rows.map(normalizeTemplate);
}
export const saveRecallTemplates = (t: RecallMessageTemplate[]) =>
  replaceAll('crisisMessageTemplates', t);

// ── Recall Routing Rules ──────────────────────────────────────────────────────
function normalizeRule(r: any): RecallRoutingRule {
  return {
    id: r.id,
    name: r.name || '',
    crisisLevels: Array.isArray(r.crisisLevels) ? r.crisisLevels : [],
    incidentTypes: Array.isArray(r.incidentTypes) ? r.incidentTypes : [],
    incidentSubTypes: Array.isArray(r.incidentSubTypes) ? r.incidentSubTypes : [],
    zones: Array.isArray(r.zones) ? r.zones : [],
    timeOfDay: r.timeOfDay || 'Any',
    targetGroupIds: Array.isArray(r.targetGroupIds) ? r.targetGroupIds : [],
    templateId: r.templateId,
    priority: typeof r.priority === 'number' ? r.priority : 100,
    status: r.status === 'Inactive' ? 'Inactive' : 'Active',
  };
}

export async function getRecallRoutingRules(): Promise<RecallRoutingRule[]> {
  const rows = await readOrSeed<RecallRoutingRule>('recallRoutingRules', DEFAULT_RECALL_ROUTING_RULES);
  return rows.map(normalizeRule);
}
export const saveRecallRoutingRules = (r: RecallRoutingRule[]) =>
  replaceAll('recallRoutingRules', r);

// ── Messaging Service config (singleton) ──────────────────────────────────────
// Merged over the default rather than returned as-is, so a doc persisted before a
// field existed (simulationMode/testNumbers were added late in the M1 build) comes
// back complete instead of undefined.
export async function getMessagingServiceConfig(): Promise<MessagingServiceConfig> {
  const rows = await readOrSeed<MessagingServiceConfig>('crisisMessagingConfig', [
    DEFAULT_MESSAGING_SERVICE_CONFIG,
  ]);
  return { ...DEFAULT_MESSAGING_SERVICE_CONFIG, ...(rows[0] || {}) };
}

export const saveMessagingServiceConfig = (cfg: MessagingServiceConfig) =>
  replaceAll('crisisMessagingConfig', [{ ...cfg, id: 'singleton' as const }]);

// Credentials must never leave the server in full (build plan §6.1: "Credentials
// masked"). The API GET route returns this masked shape; the admin page sends the
// sentinel below back unchanged when the admin did not touch the field, and the
// POST route then preserves the stored value instead of overwriting it with dots.
export const MASKED_SENTINEL = '••••••••';

export function maskMessagingConfig(cfg: MessagingServiceConfig): MessagingServiceConfig {
  return { ...cfg, apiKeyRef: cfg.apiKeyRef ? MASKED_SENTINEL : '' };
}

export async function saveMessagingServiceConfigPreservingSecret(
  incoming: MessagingServiceConfig
): Promise<void> {
  const current = await getMessagingServiceConfig();
  const apiKeyRef =
    !incoming.apiKeyRef || incoming.apiKeyRef === MASKED_SENTINEL ? current.apiKeyRef : incoming.apiKeyRef;
  await saveMessagingServiceConfig({ ...incoming, apiKeyRef });
}

// ── Acknowledgement + Escalation rules (singleton) ────────────────────────────
export async function getAckEscalationRule(): Promise<AckEscalationRule> {
  const rows = await readOrSeed<AckEscalationRule>('crisisAckEscalationRules', [
    DEFAULT_ACK_ESCALATION_RULE,
  ]);
  const row = rows[0] || {};
  return {
    ...DEFAULT_ACK_ESCALATION_RULE,
    ...row,
    ladder: Array.isArray((row as AckEscalationRule).ladder)
      ? (row as AckEscalationRule).ladder
      : DEFAULT_ACK_ESCALATION_RULE.ladder,
  };
}

export const saveAckEscalationRule = (r: AckEscalationRule) =>
  replaceAll('crisisAckEscalationRules', [{ ...r, id: 'singleton' as const }]);

// ── Routing resolution (build plan §4.5) ──────────────────────────────────────
// Used by the "Test rule" function on the Routing Rules tab (story 5) and, later,
// by story 10 (snapshot on crisis trigger) — which is exactly why it lives here in
// the store rather than inside the admin page. When Epic 2 is built it must call
// THIS function, so that what an admin tests is provably what a crisis executes.
//
// ACCUMULATE-ALL with per-person de-duplication. Read §4.5 before changing it.

export interface RoutingTestInput {
  crisisLevel: string;
  incidentType: string;
  incidentSubType?: string;
  zone?: string;
  timeOfDay?: 'Office hours' | 'After hours';
}

export interface ResolvedRecipient {
  memberId: string;
  name: string;
  mobile: string;
  email: string;
  tier: string;
  // Every group this person was resolved from — retained so the after-action
  // report can explain why someone was contacted (§4.5, "Retained provenance").
  sourceGroups: string[];
}

export interface RoutingResolution {
  matchedRules: RecallRoutingRule[];
  groups: RecallGroup[];
  recipients: ResolvedRecipient[];
  duplicatesRemoved: number;
  templateId?: string;
  warnings: string[];
}

function ruleMatches(rule: RecallRoutingRule, input: RoutingTestInput): boolean {
  if (rule.status !== 'Active') return false;
  // Empty condition array = wildcard (fail-open), same convention as the
  // broadcast routing matrix.
  if (rule.crisisLevels.length && !rule.crisisLevels.includes(input.crisisLevel)) return false;
  if (rule.incidentTypes.length && !rule.incidentTypes.includes(input.incidentType)) return false;
  if (rule.incidentSubTypes && rule.incidentSubTypes.length && input.incidentSubType && !rule.incidentSubTypes.includes(input.incidentSubType)) return false;
  if (rule.zones.length && input.zone && !rule.zones.includes(input.zone)) return false;
  if (rule.timeOfDay !== 'Any' && input.timeOfDay && rule.timeOfDay !== input.timeOfDay) return false;
  return true;
}

// Tier ordering for the "highest tier wins" de-dupe rule (§4.5). Lower index =
// higher precedence.
const TIER_ORDER = ['Tier 1 — Primary', 'Tier 2 — Secondary', 'Tier 3 — Standby'];
function higherTier(a: string, b: string): string {
  const ia = TIER_ORDER.indexOf(a);
  const ib = TIER_ORDER.indexOf(b);
  if (ia === -1) return b;
  if (ib === -1) return a;
  return ia <= ib ? a : b;
}

export function resolveRouting(
  input: RoutingTestInput,
  rules: RecallRoutingRule[],
  groups: RecallGroup[],
  templates: RecallMessageTemplate[]
): RoutingResolution {
  const warnings: string[] = [];
  const matchedRules = rules.filter((r) => ruleMatches(r, input));

  if (matchedRules.length === 0) {
    // §4.5 zero-match: never silently dropped.
    warnings.push(
      'No routing rule matched. A Crisis record would still be created in PENDING_REVIEW with an empty recipient list and a visible warning on Crisis Review.'
    );
    return { matchedRules: [], groups: [], recipients: [], duplicatesRemoved: 0, warnings };
  }

  // Template conflict: priority breaks the tie, lowest number wins. Priority does
  // NOT select which rule applies — all matched rules contribute recipients.
  const withTemplate = matchedRules.filter((r) => r.templateId);
  const sorted = [...withTemplate].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  const templateId = sorted[0]?.templateId;
  const distinctTemplates = new Set(withTemplate.map((r) => r.templateId));
  if (distinctTemplates.size > 1) {
    const winner = templates.find((t) => t.id === templateId);
    warnings.push(
      `${distinctTemplates.size} matched rules specify different templates. Priority resolved this to "${winner?.name || templateId}" (priority ${sorted[0]?.priority}).`
    );
  }
  if (withTemplate.length < matchedRules.length) {
    warnings.push('One or more matched rules have no template assigned.');
  }

  const groupIds = Array.from(new Set(matchedRules.flatMap((r) => r.targetGroupIds)));
  const resolvedGroups = groupIds
    .map((id) => groups.find((g) => g.id === id))
    .filter((g): g is RecallGroup => !!g);

  const inactive = resolvedGroups.filter((g) => g.status === 'Inactive');
  if (inactive.length) {
    warnings.push(
      `${inactive.length} targeted recall group(s) are Inactive and were skipped: ${inactive.map((g) => g.name).join(', ')}.`
    );
  }

  // De-duplicate by person. Identity key: userId when the member came from a CMS
  // user account, otherwise the normalised mobile, otherwise the name. Mobile is
  // preferred over name because the same person is often entered with slightly
  // different names across groups ("DM Gan" / "Gan S.H.").
  const byPerson = new Map<string, ResolvedRecipient>();
  let seen = 0;
  for (const g of resolvedGroups.filter((g) => g.status === 'Active')) {
    for (const m of g.members) {
      if (m.membershipStatus !== 'Active') continue;
      seen++;
      const key = m.userId || (m.mobile ? m.mobile.replace(/\D/g, '') : '') || m.name.toLowerCase();
      const existing = byPerson.get(key);
      if (existing) {
        existing.sourceGroups.push(g.name);
        existing.tier = higherTier(existing.tier, m.tier);
      } else {
        byPerson.set(key, {
          memberId: m.id,
          name: m.name,
          mobile: m.mobile,
          email: m.email,
          tier: m.tier,
          sourceGroups: [g.name],
        });
      }
    }
  }

  const recipients = Array.from(byPerson.values()).sort(
    (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)
  );

  return {
    matchedRules,
    groups: resolvedGroups,
    recipients,
    duplicatesRemoved: seen - recipients.length,
    templateId,
    warnings,
  };
}
