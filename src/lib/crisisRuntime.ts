// Crisis Management — server-side runtime for modules M2–M5.
// Build plan: Crisis-Management-Emergency-Recall-Build-Plan.md (v1.1). FSD §11.5.
//
// SERVER ONLY — imports the Mongo client. Do not import from client components.
//
// Collections: crises, crisisDispatches, crisisRecipients, crisisAuditLog.
// Separate from the M1 config collections in crisisStore.ts (master data) — this
// file holds transactional records only.

import { Db } from 'mongodb';
import clientPromise from './mongodb';
import { addNotification } from './broadcastStore';
import { getRecallGroups, getRecallRoutingRules, getRecallTemplates, resolveRouting, getAckEscalationRule, getMessagingServiceConfig } from './crisisStore';
import { renderPlaceholders, isValidSgMobile, AckEscalationRule } from './crisisConfig';
import {
  Crisis,
  CrisisRecallMember,
  Dispatch,
  DispatchRecipient,
  CrisisAuditEntry,
  CrisisStatus,
  assertTransition,
  canAcknowledge,
  shouldTriggerCrisis,
  crisisLevelLabel,
  activeMembers,
} from './crisis';

async function mdb(): Promise<Db> {
  const client = await clientPromise;
  return client.db('sentosa-cms');
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

// Opaque, unguessable acknowledgement token (Appendix A method 2). Not derived
// from the member or crisis id — a predictable token would let anyone acknowledge
// on someone else's behalf, which corrupts the one number the DM is relying on.
function ackToken(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// ── Audit (story 27) ──────────────────────────────────────────────────────────
// Every state change and every member edit, with actor and timestamp. Append-only:
// there is no update or delete path for this collection anywhere in the codebase.
export async function auditCrisis(crisisId: string, actor: string, action: string, details: string): Promise<void> {
  const db = await mdb();
  const entry: CrisisAuditEntry = { id: id('CAU'), crisisId, at: new Date().toISOString(), actor, action, details };
  await db.collection('crisisAuditLog').insertOne({ ...entry } as any);
}

export async function getCrisisAudit(crisisId: string): Promise<CrisisAuditEntry[]> {
  const db = await mdb();
  const rows = await db.collection('crisisAuditLog').find({ crisisId }, { projection: { _id: 0 } }).toArray();
  return (rows as unknown as CrisisAuditEntry[]).sort((a, b) => a.at.localeCompare(b.at));
}

// ── Crisis records ────────────────────────────────────────────────────────────

export async function getCrises(): Promise<Crisis[]> {
  const db = await mdb();
  const rows = await db.collection('crises').find({}, { projection: { _id: 0 } }).toArray();
  return (rows as unknown as Crisis[]).map((c) => ({ ...c, members: Array.isArray(c.members) ? c.members : [] }));
}

export async function getCrisis(crisisId: string): Promise<Crisis | null> {
  const db = await mdb();
  const row = await db.collection('crises').findOne({ id: crisisId }, { projection: { _id: 0 } });
  if (!row) return null;
  const c = row as unknown as Crisis;
  return { ...c, members: Array.isArray(c.members) ? c.members : [] };
}

async function putCrisis(c: Crisis): Promise<void> {
  const db = await mdb();
  await db.collection('crises').replaceOne({ id: c.id }, { ...c } as any, { upsert: true });
}

// ── M2 story 9 + 10: trigger and snapshot ─────────────────────────────────────
//
// Called from the incident API whenever an incident is created or its crisis level
// changes. Returns the Crisis if one was created, or null.
//
// Idempotency: one open crisis per incident, ever. A DM editing an incident four
// times must not produce four pending crises for the same fire.
export async function evaluateCrisisTrigger(incident: any, actor: string): Promise<Crisis | null> {
  if (!incident || !shouldTriggerCrisis(incident.crisisLevel)) return null;

  const db = await mdb();
  const existing = await db
    .collection('crises')
    .findOne({ sourceIncidentId: incident.id, status: { $nin: ['CANCELLED', 'SUPERSEDED', 'CLOSED'] } }, { projection: { _id: 0 } });
  if (existing) return null;

  const [rules, groups, templates] = await Promise.all([
    getRecallRoutingRules(),
    getRecallGroups(),
    getRecallTemplates(),
  ]);

  const hour = new Date().getHours();
  const resolution = resolveRouting(
    {
      crisisLevel: crisisLevelLabel(incident.crisisLevel),
      incidentType: incident.type || '',
      zone: incident.location?.building || incident.location?.commonName || undefined,
      timeOfDay: hour >= 9 && hour < 18 ? 'Office hours' : 'After hours',
    },
    rules,
    groups,
    templates
  );

  // ── THE SNAPSHOT (build plan §4.3) ──
  // Member rows are COPIED here. From this line onward the crisis owns its own
  // recipient list and the master recall groups are untouchable by crisis actions.
  const members: CrisisRecallMember[] = resolution.recipients.map((r) => ({
    id: id('CRM'),
    masterMemberId: r.memberId,
    name: r.name,
    roleInGroup: '',
    mobile: r.mobile,
    email: r.email,
    tier: r.tier,
    sourceGroups: r.sourceGroups,
  }));

  const crisis: Crisis = {
    id: id('CRI'),
    sourceIncidentId: incident.id,
    sourceCaseId: incident.caseId,
    incidentTitle: incident.title || incident.id,
    incidentType: incident.type || '',
    incidentSubType: incident.subType,
    locationSummary:
      [incident.location?.building, incident.location?.commonName, incident.location?.road].filter(Boolean).join(', ') || '—',
    crisisLevel: incident.crisisLevel,
    status: 'PENDING_REVIEW',
    createdAt: new Date().toISOString(),
    matchedRuleNames: resolution.matchedRules.map((r) => r.name),
    resolvedGroupNames: resolution.groups.map((g) => g.name),
    templateId: resolution.templateId,
    routingWarnings: resolution.warnings,
    members,
  };

  await putCrisis(crisis);
  await auditCrisis(
    crisis.id,
    actor || 'System',
    'Crisis auto-created',
    `Incident ${incident.id} at ${crisisLevelLabel(incident.crisisLevel)} triggered a crisis. ${resolution.matchedRules.length} rule(s) matched, ${members.length} recipient(s) snapshotted${resolution.duplicatesRemoved ? `, ${resolution.duplicatesRemoved} duplicate(s) removed` : ''}.`
  );

  // ── Story 11: notify eligible DMs ──
  // Moved into phase 1a in build plan v1.1. Under D1/D2 a DM acting is the ONLY
  // way a crisis progresses — without this notification the crisis sits in
  // PENDING_REVIEW until somebody happens to look at the queue.
  //
  // Sent to the DM ROLE, not a named person (build plan §1 mitigation): a crisis
  // addressed to one absent DM is a crisis nobody sees.
  await addNotification({
    recipientRole: 'Duty Manager',
    type: 'crisis',
    title: `CRISIS ${crisisLevelLabel(incident.crisisLevel)} — review required`,
    message: `${incident.type || 'Incident'} at ${crisis.locationSummary}. ${members.length} recipient(s) resolved. No message has been sent — a Duty Manager must review and dispatch.`,
    link: `/crisis/${crisis.id}`,
  } as any);

  return crisis;
}

// Build plan §5.1 linkage table. Called when an incident's crisis level changes
// after a crisis already exists.
export async function reconcileIncidentLevelChange(incident: any, actor: string): Promise<void> {
  const db = await mdb();
  const row = await db
    .collection('crises')
    .findOne({ sourceIncidentId: incident.id, status: { $nin: ['CANCELLED', 'SUPERSEDED', 'CLOSED'] } }, { projection: { _id: 0 } });
  if (!row) return;
  const crisis = row as unknown as Crisis;
  if (incident.crisisLevel === crisis.crisisLevel) return;

  const nowSevere = shouldTriggerCrisis(incident.crisisLevel);
  const escalated = incident.crisisLevel < crisis.crisisLevel;

  if (crisis.status === 'PENDING_REVIEW' && !nowSevere) {
    // Downgraded before anyone reviewed it — nothing was sent, so retire it.
    await putCrisis({
      ...crisis,
      status: 'SUPERSEDED',
      crisisLevel: incident.crisisLevel,
      linkageNote: `Source incident downgraded to ${crisisLevelLabel(incident.crisisLevel)} before review.`,
    });
    await auditCrisis(crisis.id, actor, 'Crisis superseded', `Incident downgraded to ${crisisLevelLabel(incident.crisisLevel)}; no message had been dispatched.`);
    return;
  }

  if (crisis.status === 'PENDING_REVIEW' && escalated) {
    // Re-resolve the snapshot: a level 2 → 1 escalation may pull in more groups,
    // and nothing has been sent yet so rebuilding is safe.
    const [rules, groups, templates] = await Promise.all([getRecallRoutingRules(), getRecallGroups(), getRecallTemplates()]);
    const hour = new Date().getHours();
    const res = resolveRouting(
      {
        crisisLevel: crisisLevelLabel(incident.crisisLevel),
        incidentType: incident.type || '',
        timeOfDay: hour >= 9 && hour < 18 ? 'Office hours' : 'After hours',
      },
      rules,
      groups,
      templates
    );
    // Members added by hand during review are preserved — a DM's deliberate
    // addition must not be wiped out by an automatic re-resolve.
    const manual = crisis.members.filter((m) => m.addedDuringCrisis);
    const rebuilt: CrisisRecallMember[] = res.recipients.map((r) => ({
      id: id('CRM'),
      masterMemberId: r.memberId,
      name: r.name,
      roleInGroup: '',
      mobile: r.mobile,
      email: r.email,
      tier: r.tier,
      sourceGroups: r.sourceGroups,
    }));
    await putCrisis({
      ...crisis,
      crisisLevel: incident.crisisLevel,
      members: [...rebuilt, ...manual],
      matchedRuleNames: res.matchedRules.map((r) => r.name),
      resolvedGroupNames: res.groups.map((g) => g.name),
      templateId: res.templateId,
      routingWarnings: res.warnings,
      incidentEscalated: true,
      linkageNote: `Source incident escalated to ${crisisLevelLabel(incident.crisisLevel)}; recipient list re-resolved.`,
    });
    await auditCrisis(crisis.id, actor, 'Recipients re-resolved', `Incident escalated to ${crisisLevelLabel(incident.crisisLevel)}; snapshot rebuilt (${rebuilt.length} resolved + ${manual.length} manually added).`);
    return;
  }

  // Post-dispatch: NO automatic effect. Responders are already moving; only a DM
  // may stand the crisis down. Flag it so the dashboard shows a banner.
  await putCrisis({
    ...crisis,
    crisisLevel: incident.crisisLevel,
    incidentDowngraded: !nowSevere,
    incidentEscalated: escalated,
    linkageNote: nowSevere
      ? `Source incident escalated to ${crisisLevelLabel(incident.crisisLevel)} after dispatch. Additional groups may now match — a supplementary dispatch is a DM decision.`
      : `Source incident downgraded to ${crisisLevelLabel(incident.crisisLevel)} after dispatch. Responders are already mobilising — only a Duty Manager may stand this down.`,
  });
  await auditCrisis(crisis.id, actor, 'Source incident level changed', `Now ${crisisLevelLabel(incident.crisisLevel)}. No automatic action taken — the crisis was already dispatched.`);
}

// Build plan §5.1: an active recall cannot outlive its incident silently.
export async function blockingCrisisForIncident(incidentId: string): Promise<Crisis | null> {
  const db = await mdb();
  const row = await db
    .collection('crises')
    .findOne({ sourceIncidentId: incidentId, status: { $in: ['PENDING_REVIEW', 'DISPATCHED', 'ACTIVE'] } }, { projection: { _id: 0 } });
  return (row as unknown as Crisis) || null;
}

// ── M3: claim, member edits, dispatch, cancel ─────────────────────────────────

export async function claimCrisis(crisisId: string, actor: string, takeOver = false): Promise<Crisis> {
  const c = await getCrisis(crisisId);
  if (!c) throw new Error('Crisis not found.');
  const next = { ...c, claimedBy: actor, claimedAt: new Date().toISOString() };
  await putCrisis(next);
  if (takeOver && c.claimedBy && c.claimedBy !== actor) {
    await auditCrisis(crisisId, actor, 'Review taken over', `Taken over from ${c.claimedBy}.`);
  }
  return next;
}

// FSD §11.5.e — member edits on an active crisis. OPERATES ON THE SNAPSHOT ONLY.
// There is deliberately no code path from here to saveRecallGroups().
export async function addCrisisMember(
  crisisId: string,
  actor: string,
  member: { name: string; mobile: string; email?: string; roleInGroup?: string; tier?: string }
): Promise<Crisis> {
  const c = await getCrisis(crisisId);
  if (!c) throw new Error('Crisis not found.');
  const m: CrisisRecallMember = {
    id: id('CRM'),
    name: member.name,
    roleInGroup: member.roleInGroup || '',
    mobile: member.mobile || '',
    email: member.email || '',
    tier: member.tier || 'Tier 2 — Secondary',
    sourceGroups: [],
    addedDuringCrisis: true,
    addedBy: actor,
    addedAt: new Date().toISOString(),
  };
  const next = { ...c, members: [...c.members, m] };
  await putCrisis(next);
  await auditCrisis(crisisId, actor, 'Member added to crisis', `${m.name} (${m.mobile || 'no mobile'}) added to this crisis only. Master recall group unchanged.`);
  return next;
}

export async function removeCrisisMember(crisisId: string, actor: string, memberId: string, reason: string): Promise<Crisis> {
  const c = await getCrisis(crisisId);
  if (!c) throw new Error('Crisis not found.');
  const members = c.members.map((m) =>
    m.id === memberId ? { ...m, removed: true, removedBy: actor, removedAt: new Date().toISOString(), removalReason: reason } : m
  );
  const target = c.members.find((m) => m.id === memberId);
  const next = { ...c, members };
  await putCrisis(next);
  await auditCrisis(crisisId, actor, 'Member removed from crisis', `${target?.name || memberId} removed from this crisis only (${reason || 'no reason given'}). Master recall group unchanged.`);
  return next;
}

// ── Story 15 + 17: dispatch ───────────────────────────────────────────────────
//
// Idempotency is a hard requirement (build plan §10): double-clicking Dispatch must
// not send twice. Enforced by the state machine — the transition out of
// PENDING_REVIEW happens before any message goes out, so a second concurrent call
// fails the guard rather than fanning out a duplicate recall to every responder.
export async function dispatchCrisis(crisisId: string, actor: string, origin: string): Promise<{ crisis: Crisis; dispatch: Dispatch; recipients: DispatchRecipient[] }> {
  const c = await getCrisis(crisisId);
  if (!c) throw new Error('Crisis not found.');
  assertTransition(c.status, 'DISPATCHED');

  const recipientsToSend = activeMembers(c);
  if (recipientsToSend.length === 0) {
    throw new Error('This crisis has no active recipients. Add at least one before dispatching.');
  }

  const [templates, provider] = await Promise.all([getRecallTemplates(), getMessagingServiceConfig()]);
  const template = templates.find((t) => t.id === c.templateId) || templates.find((t) => t.channel === 'SMS' && t.status === 'Active');
  if (!template) throw new Error('No message template resolved for this crisis. Configure one in Crisis Configuration.');

  const now = new Date().toISOString();
  const db0 = await mdb();

  // ── IDEMPOTENCY (build plan §10: "Double-clicking Dispatch must not send twice.
  // Hard requirement.") ──
  // This is an ATOMIC conditional update, not a read-then-write. A read-then-write
  // loses the race between two clicks — or two Duty Managers — arriving
  // milliseconds apart: both would read PENDING_REVIEW, both would pass the guard,
  // and every responder would receive two recall messages. Mongo evaluates the
  // filter and the update as one operation, so exactly one caller can win.
  //
  // Claiming the transition BEFORE sending is also deliberate. If the send loop
  // then fails partway we are left in DISPATCHED with a partial send, which the DM
  // can repair from the dashboard with per-row Resend. The opposite ordering —
  // send first, mark dispatched after — has no recovery: it double-recalls.
  const claimed = await db0
    .collection('crises')
    .findOneAndUpdate(
      { id: crisisId, status: 'PENDING_REVIEW' },
      { $set: { status: 'DISPATCHED', dispatchedAt: now, dispatchedBy: actor, reviewedBy: actor, reviewedAt: now } },
      { returnDocument: 'after', projection: { _id: 0 } }
    );

  const claimedDoc = (claimed as any)?.value ?? claimed;
  if (!claimedDoc) {
    throw new Error('Illegal crisis transition — this crisis has already been dispatched or is no longer awaiting review.');
  }

  const dispatchedCrisis: Crisis = {
    ...c,
    status: 'DISPATCHED',
    dispatchedAt: now,
    dispatchedBy: actor,
    reviewedBy: actor,
    reviewedAt: now,
  };

  const dispatch: Dispatch = {
    id: id('CDS'),
    crisisId,
    templateId: template.id,
    templateName: template.name,
    channel: template.channel,
    renderedMessage: '',
    triggeredBy: actor,
    triggeredAt: now,
    sequence: 'initial',
    recipientCount: recipientsToSend.length,
  };

  const db = await mdb();
  const rows: DispatchRecipient[] = [];

  for (const m of recipientsToSend) {
    const token = ackToken();
    const values: Record<string, string> = {
      '{{crisis_level}}': `L${c.crisisLevel}`,
      '{{incident_type}}': c.incidentType,
      '{{location}}': c.locationSummary,
      '{{reporting_point}}': 'Command Centre L1',
      '{{incident_no}}': c.sourceIncidentId,
      '{{recipient_name}}': m.name,
      '{{ack_link}}': `${origin}/ack/${token}`,
      '{{dispatched_at}}': new Date(now).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    };
    const body = renderPlaceholders(template.body, values);
    if (!dispatch.renderedMessage) dispatch.renderedMessage = body;

    const rec: DispatchRecipient = {
      id: id('CDR'),
      crisisId,
      dispatchId: dispatch.id,
      memberId: m.id,
      name: m.name,
      mobile: m.mobile,
      channel: template.channel,
      deliveryStatus: 'PENDING',
      ackStatus: 'AWAITING',
      attempts: 0,
      escalationLevel: 0,
      ackToken: token,
    };

    // A member with no usable number cannot be sent to. Recorded as FAILED
    // immediately rather than left PENDING forever — the DM needs to see it as an
    // actionable row on the dashboard ("call this person"), not as a silent gap.
    if (!m.mobile || !isValidSgMobile(m.mobile)) {
      rec.deliveryStatus = 'FAILED';
      rec.failureReason = m.mobile ? 'Invalid mobile number format' : 'No mobile number on record';
      rows.push(rec);
      continue;
    }

    // Simulation mode restricts sending to the configured test numbers (build plan
    // §10 Testability). Anyone not on the list is recorded as suppressed rather
    // than quietly skipped.
    if (provider.simulationMode) {
      const allow = (provider.testNumbers || '').split(/[,\n;]/).map((n) => n.trim().replace(/\s/g, '')).filter(Boolean);
      if (!allow.includes(m.mobile)) {
        rec.deliveryStatus = 'FAILED';
        rec.failureReason = 'Suppressed — simulation mode is on and this number is not in the test allowlist';
        rows.push(rec);
        continue;
      }
    }

    try {
      const res = await fetch(`${origin}/api/sms-mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: m.name, phoneNumber: m.mobile, message: body, caseId: c.sourceCaseId }),
      });
      if (res.ok) {
        rec.deliveryStatus = 'SENT';
        rec.sentAt = new Date().toISOString();
        rec.attempts = 1;
      } else {
        rec.deliveryStatus = 'FAILED';
        rec.failureReason = 'Gateway rejected the message';
        rec.attempts = 1;
      }
    } catch (e: any) {
      rec.deliveryStatus = 'FAILED';
      rec.failureReason = e.message || 'Gateway unreachable';
      rec.attempts = 1;
    }
    rows.push(rec);
  }

  await db.collection('crisisDispatches').insertOne({ ...dispatch } as any);
  if (rows.length) await db.collection('crisisRecipients').insertMany(rows.map((r) => ({ ...r })) as any[]);

  const finalCrisis: Crisis = { ...dispatchedCrisis, status: 'ACTIVE' };
  await putCrisis(finalCrisis);

  const failed = rows.filter((r) => r.deliveryStatus === 'FAILED').length;
  await auditCrisis(
    crisisId,
    actor,
    'Crisis dispatched',
    `${rows.length} recipient(s), template "${template.name}"${failed ? `, ${failed} could not be sent` : ''}.`
  );

  return { crisis: finalCrisis, dispatch, recipients: rows };
}

export async function cancelCrisis(crisisId: string, actor: string, reason: string): Promise<Crisis> {
  const c = await getCrisis(crisisId);
  if (!c) throw new Error('Crisis not found.');
  // Guard enforces "cancel is pre-dispatch only". After dispatch the correct action
  // is stand down, which tells the mobilised responders to stop.
  assertTransition(c.status, 'CANCELLED');
  const next: Crisis = { ...c, status: 'CANCELLED', cancelledBy: actor, cancelledAt: new Date().toISOString(), cancelReason: reason };
  await putCrisis(next);
  await auditCrisis(crisisId, actor, 'Crisis cancelled', `False alarm — ${reason || 'no reason given'}. No message was dispatched.`);
  return next;
}

// ── M4: recipients, ack, escalation ───────────────────────────────────────────

export async function getCrisisRecipients(crisisId: string): Promise<DispatchRecipient[]> {
  const db = await mdb();
  const rows = await db.collection('crisisRecipients').find({ crisisId }, { projection: { _id: 0 } }).toArray();
  return rows as unknown as DispatchRecipient[];
}

export async function getCrisisDispatches(crisisId: string): Promise<Dispatch[]> {
  const db = await mdb();
  const rows = await db.collection('crisisDispatches').find({ crisisId }, { projection: { _id: 0 } }).toArray();
  return (rows as unknown as Dispatch[]).sort((a, b) => a.triggeredAt.localeCompare(b.triggeredAt));
}

// Story 18 — provider delivery callback. In production this is a signature-verified
// webhook (build plan §10, Webhook security); here the mock gateway is polled/poked.
// It writes ONLY to the delivery track and never touches ackStatus.
export async function recordDelivery(recipientId: string, status: 'DELIVERED' | 'FAILED', reason?: string): Promise<void> {
  const db = await mdb();
  await db.collection('crisisRecipients').updateOne(
    { id: recipientId },
    { $set: { deliveryStatus: status, deliveredAt: status === 'DELIVERED' ? new Date().toISOString() : undefined, failureReason: reason } }
  );
}

// Stories 19 + 20 — acknowledgement and decline via tokenised link.
// Accepts from any delivery state at or after SENT, including FAILED (see
// canAcknowledge() and rule 2 in crisis.ts). First arrival wins; a second tap on
// the same link is a no-op rather than an error, because a responder re-tapping a
// link they already used should not see a failure page mid-crisis.
export async function acknowledgeByToken(
  token: string,
  decision: 'ACKNOWLEDGED' | 'DECLINED',
  eta?: string
): Promise<{ ok: boolean; already?: boolean; recipient?: DispatchRecipient; crisis?: Crisis }> {
  const db = await mdb();
  const row = await db.collection('crisisRecipients').findOne({ ackToken: token }, { projection: { _id: 0 } });
  if (!row) return { ok: false };
  const rec = row as unknown as DispatchRecipient;
  const crisis = await getCrisis(rec.crisisId);

  if (!canAcknowledge(rec.deliveryStatus, rec.ackStatus)) {
    return { ok: true, already: true, recipient: rec, crisis: crisis || undefined };
  }

  const at = new Date().toISOString();
  await db.collection('crisisRecipients').updateOne(
    { id: rec.id },
    { $set: { ackStatus: decision, ackAt: at, ackMethod: 'Link', eta: eta || undefined } }
  );
  await auditCrisis(rec.crisisId, rec.name, decision === 'ACKNOWLEDGED' ? 'Acknowledged' : 'Declined', `Via acknowledgement link${eta ? `, ETA ${eta}` : ''}.`);
  return { ok: true, recipient: { ...rec, ackStatus: decision, ackAt: at, ackMethod: 'Link', eta }, crisis: crisis || undefined };
}

// Read-only lookup for the acknowledgement page, so the responder sees the actual
// crisis (level, type, location, reporting point) rather than a bare Yes/No prompt.
// Kept strictly separate from acknowledgeByToken() — merely opening the link must
// never record an acknowledgement, or a preview fetch by a messaging app would
// silently mark someone as responding.
export async function lookupAckToken(token: string): Promise<{
  recipientName: string;
  alreadyResponded: boolean;
  ackStatus: string;
  crisis: { id: string; level: number; type: string; location: string; incidentNo: string; status: CrisisStatus } | null;
} | null> {
  const db = await mdb();
  const row = await db.collection('crisisRecipients').findOne({ ackToken: token }, { projection: { _id: 0 } });
  if (!row) return null;
  const rec = row as unknown as DispatchRecipient;
  const c = await getCrisis(rec.crisisId);
  return {
    recipientName: rec.name,
    alreadyResponded: rec.ackStatus === 'ACKNOWLEDGED' || rec.ackStatus === 'DECLINED',
    ackStatus: rec.ackStatus,
    crisis: c
      ? { id: c.id, level: c.crisisLevel, type: c.incidentType, location: c.locationSummary, incidentNo: c.sourceIncidentId, status: c.status }
      : null,
  };
}

// Story 24 — manual actions by the DM. "Mark contacted" is the one acknowledgement
// the system did not observe itself, so it records who asserted it.
export async function markContacted(recipientId: string, actor: string): Promise<void> {
  const db = await mdb();
  const row = await db.collection('crisisRecipients').findOne({ id: recipientId }, { projection: { _id: 0 } });
  if (!row) throw new Error('Recipient not found.');
  const rec = row as unknown as DispatchRecipient;
  const at = new Date().toISOString();
  await db.collection('crisisRecipients').updateOne(
    { id: recipientId },
    { $set: { ackStatus: 'ACKNOWLEDGED', ackAt: at, ackMethod: 'Manual', markedContactedBy: actor, markedContactedAt: at } }
  );
  await auditCrisis(rec.crisisId, actor, 'Marked contacted', `${rec.name} confirmed responding by direct contact (not via the system).`);
}

export async function resendToRecipient(recipientId: string, actor: string, origin: string): Promise<void> {
  const db = await mdb();
  const row = await db.collection('crisisRecipients').findOne({ id: recipientId }, { projection: { _id: 0 } });
  if (!row) throw new Error('Recipient not found.');
  const rec = row as unknown as DispatchRecipient;
  const crisis = await getCrisis(rec.crisisId);
  if (!crisis) throw new Error('Crisis not found.');
  const dispatches = await getCrisisDispatches(rec.crisisId);
  const body = dispatches[0]?.renderedMessage || `[CRISIS L${crisis.crisisLevel}] ${crisis.incidentType} — ${crisis.locationSummary}. Ack: ${origin}/ack/${rec.ackToken}`;

  try {
    const res = await fetch(`${origin}/api/sms-mock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: rec.name, phoneNumber: rec.mobile, message: body }),
    });
    await db.collection('crisisRecipients').updateOne(
      { id: recipientId },
      {
        $set: {
          deliveryStatus: res.ok ? 'SENT' : 'FAILED',
          sentAt: new Date().toISOString(),
          failureReason: res.ok ? undefined : 'Gateway rejected the re-send',
        },
        $inc: { attempts: 1 },
      }
    );
  } catch (e: any) {
    await db.collection('crisisRecipients').updateOne({ id: recipientId }, { $set: { deliveryStatus: 'FAILED', failureReason: e.message }, $inc: { attempts: 1 } });
  }
  await auditCrisis(rec.crisisId, actor, 'Manual re-send', `Message re-sent to ${rec.name}.`);
}

// Story 22 — automatic escalation & reminders evaluation.
export async function markAckWindowElapsed(
  crisis: Crisis,
  rule: AckEscalationRule,
  recipients: DispatchRecipient[],
  db: any
): Promise<number> {
  let count = 0;
  const now = Date.now();
  for (const r of recipients) {
    if (r.ackStatus !== 'AWAITING') continue;
    const baseIso = r.firstSentAt || r.sentAt || crisis.dispatchedAt || crisis.createdAt;
    const elapsedMin = (now - new Date(baseIso).getTime()) / 60000;
    if (elapsedMin >= rule.ackWindowMinutes) {
      await db.collection('crisisRecipients').updateOne({ id: r.id }, { $set: { ackStatus: 'NO_RESPONSE' } });
      await auditCrisis(
        crisis.id,
        'System',
        'Ack window elapsed — NO_RESPONSE',
        `${r.name}: Ack window (${rule.ackWindowMinutes}m) elapsed without response. Status changed to NO_RESPONSE.`
      );
      count++;
    }
  }
  return count;
}

export async function evaluateCrisisRules(crisisId: string, origin: string): Promise<{ advanced: number }> {
  const crisis = await getCrisis(crisisId);
  if (!crisis || crisis.status !== 'ACTIVE') return { advanced: 0 };

  const [rule, recipients] = await Promise.all([getAckEscalationRule(), getCrisisRecipients(crisisId)]);
  const db = await mdb();
  const nowMs = Date.now();
  let advanced = 0;

  advanced += await markAckWindowElapsed(crisis, rule, recipients, db);

  const currentRecipients = await getCrisisRecipients(crisisId);

  for (const r of currentRecipients) {
    if (r.ackStatus === 'ACKNOWLEDGED' || r.ackStatus === 'DECLINED') continue;
    const baseIso = r.firstSentAt || r.sentAt || crisis.dispatchedAt || crisis.createdAt;
    const elapsedMin = (nowMs - new Date(baseIso).getTime()) / 60000;

    const due = rule.ladder.filter((s) => elapsedMin >= s.afterMinutes);
    if (due.length > r.escalationLevel) {
      const step = due[due.length - 1];
      if (step.action === 'Resend SMS') {
        if (!r.mobile) {
          await db.collection('crisisRecipients').updateOne({ id: r.id }, { $set: { escalationLevel: due.length } });
          await auditCrisis(crisisId, 'System', 'Escalation step skipped', `${r.name}: ${step.action} at +${step.afterMinutes} min skipped (no mobile number).`);
          advanced++;
        } else {
          await db.collection('crisisRecipients').updateOne(
            { id: r.id },
            { $set: { escalationLevel: due.length, ackStatus: r.ackStatus === 'AWAITING' ? 'AWAITING' : 'ESCALATED' } }
          );
          await resendToRecipient(r.id, 'System (escalation)', origin);
          await auditCrisis(crisisId, 'System', 'Escalation step executed', `${r.name}: ${step.action} at +${step.afterMinutes} min.`);
          advanced++;
        }
      } else if (step.action === 'Notify Duty Manager') {
        await db.collection('crisisRecipients').updateOne(
          { id: r.id },
          { $set: { escalationLevel: due.length, ackStatus: r.ackStatus === 'AWAITING' ? 'AWAITING' : 'ESCALATED' } }
        );
        await addNotification({
          recipientRole: 'Duty Manager',
          type: 'crisis',
          title: 'Crisis escalation — non-responder',
          message: `${r.name} has not acknowledged after ${step.afterMinutes} minutes. Direct contact required.`,
          link: `/crisis/${crisisId}`,
        } as any);
        await auditCrisis(crisisId, 'System', 'Escalation step executed', `${r.name}: ${step.action} at +${step.afterMinutes} min.`);
        advanced++;
      }
    }
  }

  return { advanced };
}

export async function evaluateEscalation(crisisId: string, origin: string): Promise<{ advanced: number }> {
  return evaluateCrisisRules(crisisId, origin);
}

// ── M5: stand down and closure ────────────────────────────────────────────────

export async function standDownCrisis(
  crisisId: string,
  actor: string,
  reason: 'Resolved' | 'False alarm' | 'Duplicate',
  notes: string,
  sendMessage: boolean,
  origin: string
): Promise<Crisis> {
  const c = await getCrisis(crisisId);
  if (!c) throw new Error('Crisis not found.');
  assertTransition(c.status, 'STOOD_DOWN');

  const now = new Date().toISOString();
  const next: Crisis = { ...c, status: 'STOOD_DOWN', standDownAt: now, standDownBy: actor, standDownReason: reason, closureNotes: notes };
  await putCrisis(next);

  if (sendMessage) {
    // Everyone who was contacted gets the stand-down, including people who
    // declined — a responder who said no still needs to know the recall is over,
    // and someone who never acknowledged may still be driving in.
    const templates = await getRecallTemplates();
    const tpl = templates.find((t) => /stand.?down/i.test(t.name) && t.status === 'Active');
    const recipients = await getCrisisRecipients(crisisId);
    const body = tpl
      ? renderPlaceholders(tpl.body, {
          '{{incident_no}}': c.sourceIncidentId,
          '{{incident_type}}': c.incidentType,
          '{{location}}': c.locationSummary,
        })
      : `[STAND DOWN] ${c.sourceIncidentId} ${c.incidentType} at ${c.locationSummary}. No further action required.`;

    const db = await mdb();
    const dispatch: Dispatch = {
      id: id('CDS'),
      crisisId,
      templateId: tpl?.id,
      templateName: tpl?.name || 'Ad-hoc stand-down',
      channel: 'SMS',
      renderedMessage: body,
      triggeredBy: actor,
      triggeredAt: now,
      sequence: 'stand_down',
      recipientCount: recipients.length,
    };
    await db.collection('crisisDispatches').insertOne({ ...dispatch } as any);

    for (const r of recipients) {
      if (!r.mobile) continue;
      try {
        await fetch(`${origin}/api/sms-mock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipient: r.name, phoneNumber: r.mobile, message: body }),
        });
      } catch {
        /* stand-down delivery failures must not block closure */
      }
    }
  }

  await auditCrisis(crisisId, actor, 'Crisis stood down', `Reason: ${reason}.${sendMessage ? ' Stand-down message sent to all recipients.' : ' No stand-down message sent.'}${notes ? ` Notes: ${notes}` : ''}`);
  return next;
}

export async function closeCrisis(crisisId: string, actor: string): Promise<Crisis> {
  const c = await getCrisis(crisisId);
  if (!c) throw new Error('Crisis not found.');
  assertTransition(c.status, 'CLOSED');
  const next: Crisis = { ...c, status: 'CLOSED', closedAt: new Date().toISOString() };
  await putCrisis(next);
  await auditCrisis(crisisId, actor, 'Crisis closed', 'Record closed. After-action report available.');
  return next;
}
