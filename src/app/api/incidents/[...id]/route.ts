import { NextResponse } from 'next/server';
import { getDb, saveDb, generateCaseId, ResponderLifecycleStatus } from '@/lib/db';
import { tryAutoCloseCase } from '@/lib/autoclose';
import { isValidIncidentCategory } from '@/lib/incidentCategory';
import {
  getBroadcastConfig,
  getDistributionGroups,
  getBroadcastTemplates,
  getBroadcastMatrix,
  getActivePromptRule,
  addNotification,
} from '@/lib/broadcastStore';
import {
  isClosureBroadcastRequired,
  resolveClosureBroadcast,
  initialDeliveryCounts,
  nextBroadcastId,
  crisisLevelKey,
  encodeIdPath,
} from '@/lib/broadcast';
import { hasBroadcastPermission } from '@/lib/permissions';
import { sendEmailMockBatch } from '@/lib/emailMock';

// Helper: build a timestamped log entry
function makeLogEntry(db_incident: any, description: string) {
  const now = new Date();
  return {
    eventNumber: (db_incident.log?.length ?? 0) + 1,
    date: now.toISOString().split('T')[0],
    time: now.toLocaleTimeString('en-US', { hour12: false }),
    description,
  };
}

/**
 * Route: /api/incidents/[...id]
 *
 * Supports slash-containing case/incident IDs, resolving by Case ID or Incident ID.
 */

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const queryId = id.join('/');
    const db = await getDb();
    const caseObj = db.cases.find(c => c.id === queryId || (c.incident && c.incident.id === queryId));
    if (!caseObj?.incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }
    
    const incidentData = caseObj.incident;
    const caseId = caseObj.id;
    
    // Fetch related records
    const relatedTasks = db.tasks.filter(t => t.caseId === caseId);
    const relatedFaults = db.faults?.filter(f => f.caseId === caseId) || [];
    const relatedBroadcasts = db.broadcasts?.filter(b => b.caseId === caseId || b.incidentId === incidentData.id) || [];
    const relatedOccurrences: any[] = []; // Occurrences are standalone per FRD 4.1
    
    const responsePayload = {
      ...incidentData,
      relatedTasks,
      relatedFaults,
      relatedBroadcasts,
      relatedOccurrences
    };
    
    return NextResponse.json(responsePayload);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── PUT (Legacy/ancillary updates) ───────────────────────────────────────────
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const queryId = id.join('/');
    const body = await request.json();
    const db = await getDb();

    const caseIndex = db.cases.findIndex(c => c.id === queryId || (c.incident && c.incident.id === queryId));
    if (caseIndex === -1 || !db.cases[caseIndex].incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    const currentCase = db.cases[caseIndex];
    const incident = currentCase.incident!;
    const now = new Date();
    const logDate = now.toISOString().split('T')[0];
    const logTime = now.toLocaleTimeString('en-US', { hour12: false });

    // Assigned responder — now supports arrays
    if (body.assignedTo !== undefined) {
      const incoming: string[] = Array.isArray(body.assignedTo)
        ? body.assignedTo
        : (body.assignedTo ? [body.assignedTo] : []);
      const prev: string[] = Array.isArray(incident.assignedTo)
        ? incident.assignedTo
        : (incident.assignedTo ? [incident.assignedTo as unknown as string] : []);
      
      if (JSON.stringify(incoming) !== JSON.stringify(prev)) {
        // Sync responders array (single source of truth)
        const actor = body.username ?? 'Controller';
        
        // Mark removed responders
        const updatedResponders = (incident.responders || []).map(r => {
          if (!incoming.includes(r.responderId) && r.status === 'Active') {
            return { ...r, status: 'Removed' as const };
          }
          return r;
        });

        // Add new active responders
        incoming.forEach(r => {
          const exists = updatedResponders.find(x => x.responderId === r);
          if (exists) {
            exists.status = 'Active';
          } else {
            updatedResponders.push({
              responderId: r,
              assignedBy: actor,
              assignedAt: new Date().toISOString(),
              status: 'Active',
              lifecycleStatus: 'Assigned'
            });
          }
        });

        incident.responders = updatedResponders;
        incident.assignedTo = incoming;

        if (incoming.length > 0) {
          incident.log.push({
            eventNumber: incident.log.length + 1,
            date: logDate,
            time: logTime,
            description: `Responders assigned: ${incoming.join(', ')} (by ${actor}).`
          });
        }
      }
    }

    // Direct Status update (if needed, though POST endpoints are preferred)
    if (body.status) {
      const old = incident.status;
      incident.status = body.status;
      let msg = `Status changed from "${old}" → "${body.status}"${body.username ? ` by ${body.username}` : ''}.`;
      incident.log.push({ eventNumber: incident.log.length + 1, date: logDate, time: logTime, description: msg });
    }

    // Manual log entry
    if (body.newLogEntry) {
      incident.log.push({ eventNumber: incident.log.length + 1, date: logDate, time: logTime, description: body.newLogEntry });
    }

    // Core particular updates
    if (body.title) {
      incident.title = body.title;
      currentCase.title = body.title;
    }
    if (body.dateTime) incident.dateTime = body.dateTime;
    if (body.type) incident.type = body.type;
    if (body.subType) incident.subType = body.subType;
    if (body.priority) incident.priority = body.priority;
    if (body.crisisLevel !== undefined) incident.crisisLevel = parseInt(body.crisisLevel, 10);
    if (body.requestedBy) incident.requestedBy = body.requestedBy;
    if (body.reporterName !== undefined) incident.reporterName = body.reporterName;
    if (body.category) {
      if (!isValidIncidentCategory(body.category)) {
        return NextResponse.json({ error: `Invalid Incident Category: "${body.category}".` }, { status: 400 });
      }
      incident.category = body.category;
    }
    if (body.reportingSource !== undefined) incident.reportingSource = body.reportingSource;

    // Location updates
    if (body.location) {
      incident.location = { ...incident.location, ...body.location };
    }

    // Ancillary field updates
    if (body.emergencyServices) incident.emergencyServices = { ...incident.emergencyServices, ...body.emergencyServices };
    if (body.mediaInvolvement) {
      const prevMedia = incident.mediaInvolvement.mediaAtScene;
      const prevComms = incident.mediaInvolvement.commsNotified;
      incident.mediaInvolvement = { ...incident.mediaInvolvement, ...body.mediaInvolvement };

      if (incident.mediaInvolvement.mediaAtScene && !prevMedia) {
        incident.log.push({ eventNumber: incident.log.length + 1, date: logDate, time: logTime, description: 'Media presence detected at scene.' });
      }
      if (incident.mediaInvolvement.commsNotified && !prevComms) {
        incident.log.push({ eventNumber: incident.log.length + 1, date: logDate, time: logTime, description: 'SDC Communications Team notified regarding media presence.' });
        // §10.8/G10 — was log-only before; now also prompts the Controller in-app
        // (recipient role config-driven — see 'media_present_confirmed' in
        // broadcastConfig.ts). The Controller still creates the actual SDC
        // Communications broadcast manually via New Broadcast.
        const mediaPromptRule = await getActivePromptRule('media_present_confirmed');
        if (mediaPromptRule) {
          for (const recipientRole of mediaPromptRule.recipientRoles) {
            await addNotification({
              recipientRole,
              type: 'broadcast',
              title: '📰 Notify SDC Communications Team',
              message: `Media presence confirmed on ${incident.id}${incident.mediaInvolvement.mediaName ? ` (${incident.mediaInvolvement.mediaName})` : ''} — please notify the SDC Communications team by broadcast.`,
              link: `/incidents/${incident.id}`,
            });
          }
        }
      }
    }
    if (body.propertyDamage) incident.propertyDamage = { ...incident.propertyDamage, ...body.propertyDamage };
    if (body.vehiclesInvolved) incident.vehiclesInvolved = body.vehiclesInvolved;
    if (body.personalInjuries) incident.personalInjuries = body.personalInjuries;
    if (body.personsInvolved) incident.personsInvolved = body.personsInvolved;
    if (body.cctvBwc) incident.cctvBwc = body.cctvBwc;
    if (body.summary) incident.summary = body.summary;
    if (body.attachments) incident.attachments = body.attachments;

    currentCase.incident = incident;
    db.cases[caseIndex] = currentCase;
    await saveDb(db);

    // ── Crisis trigger hook (Crisis build plan Epic 2, stories 9–11) ──
    // An incident reaching a triggering crisis level auto-creates a Crisis record
    // in PENDING_REVIEW and notifies the Duty Manager role. If a crisis already
    // exists for this incident, evaluateCrisisTrigger() is a no-op and
    // reconcileIncidentLevelChange() applies the §5.1 linkage rules instead
    // (downgrade before review supersedes; after dispatch nothing is automatic,
    // because responders are already mobilising).
    //
    // Deliberately non-fatal: a crisis-module failure must never prevent an
    // incident from being saved. The incident record is the system of record.
    if (body.crisisLevel !== undefined) {
      try {
        const { evaluateCrisisTrigger, reconcileIncidentLevelChange } = await import('@/lib/crisisRuntime');
        const crisisActor = body.username ?? 'System';
        await reconcileIncidentLevelChange(incident, crisisActor);
        await evaluateCrisisTrigger(incident, crisisActor);
      } catch (crisisErr) {
        console.error('Crisis trigger evaluation failed (incident saved regardless):', crisisErr);
      }
    }

    return NextResponse.json(incident);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── POST (action-oriented lifecycle transitions) ───────────────────────────
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;

    const lastSegment = id[id.length - 1];
    let action: string | null = null;
    let queryId = id.join('/');

    const knownActions = [
      'assign', 'acknowledge', 'on-site', 'notify-complete', 'set-responder-status', 'close', 'return',
      'return-to-responder', 'submit-review', 'submit-endorsement', 'log',
      'update-fields', 'reopen', 'mark-false-alarm', 'link-duplicate',
      'edit-log', 'delete-log'
    ];

    if (knownActions.includes(lastSegment)) {
      action = lastSegment;
      queryId = id.slice(0, -1).join('/');
    }

    const body = await request.json().catch(() => ({}));
    const db = await getDb();

    const caseIndex = db.cases.findIndex(c => c.id === queryId || (c.incident && c.incident.id === queryId));
    if (caseIndex === -1 || !db.cases[caseIndex].incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    const currentCase = db.cases[caseIndex];
    const incident = currentCase.incident!;
    const actor = body.username ?? 'System';
    const caseId = currentCase.id;

    switch (action) {
      // ── Assign / Add / Remove responder ───────────────────────────────────
      case 'assign': {
        const activeResponders = (incident.responders || []).filter(r => r.status === 'Active');
        const currentList = activeResponders.map(r => r.responderId);

        if (body.addResponder) {
          if (currentList.includes(body.addResponder)) {
            return NextResponse.json({ error: `${body.addResponder} is already assigned to this Incident.` }, { status: 409 });
          }
          incident.assignedTo = [...currentList, body.addResponder];
          incident.responders = [
            ...(incident.responders || []),
            { responderId: body.addResponder, assignedBy: actor, assignedAt: new Date().toISOString(), status: 'Active', lifecycleStatus: 'Assigned' }
          ];
          // Confirmed with BA (Shin Feng, FSD v0.5 §5.1.2): all 3 categories share the same
          // standard lifecycle. Responder assignment is optional for every category — but if a
          // Responder IS assigned (including on a Backdated Incident, e.g. for post-action log
          // updates), the normal ground-response cycle applies same as Operational.
          if (incident.status === 'Live') {
            incident.status = 'Live (Assigned)';
            incident.log.push(makeLogEntry(incident, `Responder assigned: ${body.addResponder} — by ${actor}. Status changed to Live (Assigned).`));
          } else {
            incident.log.push(makeLogEntry(incident, `Responder added: ${body.addResponder} — assigned by ${actor}.`));
          }
          break;
        }

        if (body.removeResponder) {
          if (currentList.length <= 1) {
            return NextResponse.json({ error: 'At least one Responder must remain assigned to the Incident.' }, { status: 409 });
          }
          if (!currentList.includes(body.removeResponder)) {
            return NextResponse.json({ error: `${body.removeResponder} is not assigned to this Incident.` }, { status: 404 });
          }
          incident.assignedTo = currentList.filter(r => r !== body.removeResponder);
          incident.responders = (incident.responders || []).map(r =>
            r.responderId === body.removeResponder ? { ...r, status: 'Removed' } : r
          );
          incident.log.push(makeLogEntry(incident, `Responder removed: ${body.removeResponder} — unassigned by ${actor}.`));
          break;
        }

        if (body.assignedTo !== undefined) {
          const incoming: string[] = Array.isArray(body.assignedTo)
            ? body.assignedTo : (body.assignedTo ? [body.assignedTo] : []);

          const updatedResponders = (incident.responders || []).map(r => {
            if (!incoming.includes(r.responderId) && r.status === 'Active') return { ...r, status: 'Removed' as const };
            return r;
          });
          incoming.forEach(r => {
            const exists = updatedResponders.find(x => x.responderId === r);
            if (exists) { exists.status = 'Active'; }
            else { updatedResponders.push({ responderId: r, assignedBy: actor, assignedAt: new Date().toISOString(), status: 'Active', lifecycleStatus: 'Assigned' }); }
          });
          incident.responders = updatedResponders;
          incident.assignedTo = incoming;
          incident.log.push(makeLogEntry(incident, `Responder assignment updated to: ${incoming.join(', ')} — by ${actor}.`));
          break;
        }

        return NextResponse.json({ error: 'assignedTo, addResponder, or removeResponder is required' }, { status: 400 });
      }

      // ── Responder acknowledges (per-Responder; Incident.status stays Live (Assigned)) ──
      case 'acknowledge': {
        if (!['Live', 'Live (Assigned)'].includes(incident.status)) {
          return NextResponse.json({ error: `Cannot acknowledge: current status is "${incident.status}"` }, { status: 409 });
        }
        const activeResponders = (incident.responders || []).filter(r => r.status === 'Active');
        const targetId = body.responderId || actor;
        const target = activeResponders.find(r => r.responderId === targetId)
          || (activeResponders.length === 1 ? activeResponders[0] : undefined);
        if (!target) {
          return NextResponse.json({ error: 'Could not determine which Responder is acknowledging. Pass responderId explicitly.' }, { status: 400 });
        }
        if (target.lifecycleStatus !== 'Assigned') {
          return NextResponse.json({ error: `Cannot acknowledge: Responder ${target.responderId} is currently "${target.lifecycleStatus}"` }, { status: 409 });
        }
        target.lifecycleStatus = 'Acknowledged';
        target.acknowledgedAt = new Date().toISOString();
        if (incident.status === 'Live') incident.status = 'Live (Assigned)';
        incident.log.push(makeLogEntry(incident, `Responder ${target.responderId} acknowledged dispatch.`));
        break;
      }

      // ── Responder arrives on-site (per-Responder) ──────────────────────────────
      case 'on-site': {
        if (!['Live', 'Live (Assigned)'].includes(incident.status)) {
          return NextResponse.json({ error: `Cannot mark on-site: current status is "${incident.status}"` }, { status: 409 });
        }
        const activeResponders = (incident.responders || []).filter(r => r.status === 'Active');
        const targetId = body.responderId || actor;
        const target = activeResponders.find(r => r.responderId === targetId)
          || (activeResponders.length === 1 ? activeResponders[0] : undefined);
        if (!target) {
          return NextResponse.json({ error: 'Could not determine which Responder arrived on-site. Pass responderId explicitly.' }, { status: 400 });
        }
        if (target.lifecycleStatus !== 'Acknowledged') {
          return NextResponse.json({ error: `Cannot mark on-site: Responder ${target.responderId} is currently "${target.lifecycleStatus}"` }, { status: 409 });
        }
        target.lifecycleStatus = 'On-Site';
        target.onSiteAt = new Date().toISOString();
        incident.log.push(makeLogEntry(incident, `Responder ${target.responderId} confirmed arrival on-site.`));
        break;
      }

      // ── Responder notifies Controller of completion (per-Responder) ───────────────
      case 'notify-complete': {
        if (!['Live', 'Live (Assigned)'].includes(incident.status)) {
          return NextResponse.json({ error: `Cannot notify completion: current status is "${incident.status}"` }, { status: 409 });
        }
        const activeResponders = (incident.responders || []).filter(r => r.status === 'Active');
        const targetId = body.responderId || actor;
        const target = activeResponders.find(r => r.responderId === targetId)
          || (activeResponders.length === 1 ? activeResponders[0] : undefined);
        if (!target) {
          return NextResponse.json({ error: 'Could not determine which Responder is notifying completion. Pass responderId explicitly.' }, { status: 400 });
        }
        if (!['On-Site', 'Acknowledged', 'Assigned', 'Live (Incomplete)'].includes(target.lifecycleStatus)) {
          return NextResponse.json({ error: `Cannot notify completion: Responder ${target.responderId} is currently "${target.lifecycleStatus}"` }, { status: 409 });
        }
        target.lifecycleStatus = 'Pending Controller Review';
        target.pendingReviewAt = new Date().toISOString();
        incident.log.push(makeLogEntry(incident,
          `Responder ${target.responderId} has notified completion of ground activities — awaiting Controller review.`
        ));
        // §10.5 (gap G7) — this System Notification event existed in the FSD's
        // 10-event list but was never wired server-side; it only ever fired if a
        // Controller happened to have the incident page open in a browser tab at
        // that exact moment (client-side addNotification calls elsewhere in the
        // codebase). Moved server-side here so it's reliable regardless of who's
        // looking at what.
        await addNotification({
          recipientRole: 'Controller',
          type: 'incident',
          title: '✅ Responder reported completion',
          message: `${target.responderId} has notified completion on ${incident.id} — awaiting your review.`,
          link: `/incidents/${incident.id}`,
        });
        break;
      }

      // ── Controller manually sets a Responder's status (per-Responder dropdown) ───
      // Lets the Controller jump a Responder directly to any of the "in-progress" states
      // (forward-skip or backward-correct) instead of only clicking one next-step button
      // at a time. Deliberately does NOT cover Live (Incomplete) (use return-to-responder,
      // which requires remarks) or Completed (use submit-endorsement, which is a bulk
      // lock) — see RESPONDER_STATUS_DROPDOWN_PLAN.md §2 (confirmed with Kyle, 2026-07-20).
      case 'set-responder-status': {
        if (body.role !== 'Controller' && body.role !== 'System Administrator') {
          return NextResponse.json({ error: 'Only a Controller can set Responder status directly.' }, { status: 403 });
        }
        if (!['Live', 'Live (Assigned)'].includes(incident.status)) {
          return NextResponse.json({ error: `Cannot change Responder status: current status is "${incident.status}"` }, { status: 409 });
        }
        const ORDER: ResponderLifecycleStatus[] = ['Assigned', 'Acknowledged', 'On-Site', 'Pending Controller Review'];
        const activeResponders = (incident.responders || []).filter(r => r.status === 'Active');
        const target = activeResponders.find(r => r.responderId === body.responderId);
        if (!target) {
          return NextResponse.json({ error: 'responderId is required and must be an active Responder.' }, { status: 400 });
        }
        if (!ORDER.includes(target.lifecycleStatus)) {
          return NextResponse.json({ error: `Responder ${target.responderId} is "${target.lifecycleStatus}" — use Return to Responder or Submit for Endorsement instead.` }, { status: 409 });
        }
        if (!ORDER.includes(body.status)) {
          return NextResponse.json({ error: `status must be one of: ${ORDER.join(', ')}` }, { status: 400 });
        }
        const fromIdx = ORDER.indexOf(target.lifecycleStatus);
        const toIdx = ORDER.indexOf(body.status);
        if (toIdx === fromIdx) {
          return NextResponse.json({ error: `Responder ${target.responderId} is already "${body.status}".` }, { status: 400 });
        }
        const now = new Date().toISOString();
        const skipped = ORDER.slice(Math.min(fromIdx, toIdx) + 1, Math.max(fromIdx, toIdx));
        if (toIdx > fromIdx) {
          // Moving forward — backfill timestamps for every stage crossed so downstream
          // reporting doesn't show gaps for stages that were skipped, not just unreached.
          if (toIdx >= ORDER.indexOf('Acknowledged') && !target.acknowledgedAt) target.acknowledgedAt = now;
          if (toIdx >= ORDER.indexOf('On-Site') && !target.onSiteAt) target.onSiteAt = now;
          if (toIdx >= ORDER.indexOf('Pending Controller Review')) target.pendingReviewAt = now;
        }
        // Moving backward: intentionally leave prior timestamps in place — a correction
        // shouldn't erase the history of what already happened, only the current status.
        const fromStatus = target.lifecycleStatus;
        target.lifecycleStatus = body.status;
        incident.log.push(makeLogEntry(incident,
          `Controller ${actor} manually set Responder ${target.responderId} status: ${fromStatus} → ${body.status}` +
          (skipped.length ? ` (skipped: ${skipped.join(', ')})` : '')
        ));
        break;
      }

      // ── Submit (or Force Submit) for Duty Manager endorsement ─────────────────────
      // Standard submit requires every active Responder to already be at
      // "Pending Controller Review" (or already Live (Incomplete)/Completed). Force
      // Submit (body.force === true) bypasses that gate and locks every active
      // Responder to Completed regardless of their current stage.
      case 'submit-review':
      case 'submit-endorsement': {
        // "Live" is included alongside "Live (Assigned)"/"Returned" so an incident that never had
        // a Responder assigned can still be submitted for endorsement. Confirmed with BA: Responder
        // assignment is optional across all 3 categories (FSD v0.5 §5.1.2) — when the Controller
        // doesn't need one, they fill in the Incident themselves and submit straight for Duty
        // Manager endorsement. Before the Incident Category feature this branch was unreachable in
        // practice since Category had no UI, so no incident ever legitimately stayed at "Live"
        // through to submission.
        if (!['Live', 'Live (Assigned)', 'Returned'].includes(incident.status)) {
          return NextResponse.json({ error: `Cannot submit for endorsement: incident must be Live, Live (Assigned) or Returned (current: "${incident.status}").` }, { status: 409 });
        }
        const activeResponders = (incident.responders || []).filter(r => r.status === 'Active');
        // Applies uniformly across all 3 categories (confirmed with BA — same standard
        // lifecycle regardless of category). If no Responder was ever assigned, activeResponders
        // is empty and this is naturally a no-op — Controller can submit straight from "Live".
        const notYetReviewed = activeResponders.filter(r => !['Pending Controller Review', 'Live (Incomplete)', 'Completed'].includes(r.lifecycleStatus));
        const isForceSubmit = notYetReviewed.length > 0;
        if (isForceSubmit && !body.force) {
          return NextResponse.json({
            error: 'Some Responders have not yet reached Pending Controller Review. Confirm Force Submit to proceed.',
            requiresForce: true,
            outstandingResponders: notYetReviewed.map(r => r.responderId)
          }, { status: 409 });
        }
        const submitNow = new Date().toISOString();
        activeResponders.forEach(r => {
          r.lifecycleStatus = 'Completed';
          r.completedAt = submitNow;
        });
        incident.status = 'Pending Endorsement';
        incident.log.push(makeLogEntry(incident,
          isForceSubmit
            ? `Incident FORCE-SUBMITTED for Duty Manager endorsement by ${actor}. Responder(s) still in progress at the time (${notYetReviewed.map(r => r.responderId).join(', ')}) have been locked to Completed.`
            : `Incident submitted for Duty Manager endorsement by ${actor}. All Responders marked Completed.`
        ));
        break;
      }

      // ── Duty Manager approves closure ──────────────────────────
      case 'close': {
        if (incident.status === 'Closed') {
          return NextResponse.json({ error: 'Incident is already Closed.' }, { status: 409 });
        }

        // ── Crisis build plan §5.1 linkage ──
        // An incident cannot be closed while its emergency recall is still live.
        // A recall with responders who have not been stood down must not outlive
        // its incident silently — someone is still driving in.
        try {
          const { blockingCrisisForIncident } = await import('@/lib/crisisRuntime');
          const openCrisis = await blockingCrisisForIncident(incident.id);
          if (openCrisis) {
            return NextResponse.json(
              {
                error: `This incident has an active emergency recall (${openCrisis.status}). Stand the crisis down before closing the incident.`,
                crisisId: openCrisis.id,
              },
              { status: 409 }
            );
          }
        } catch (crisisErr) {
          console.error('Crisis closure check failed:', crisisErr);
        }
        incident.status = 'Closed';
        incident.completionRemarks = body.closureRemarks || '';
        incident.closedAt = new Date().toISOString();
        incident.closedBy = actor;

        if (incident.slaveIncidents) {
          incident.slaveIncidents = incident.slaveIncidents.map((s: any) => ({ ...s, status: 'Closed' }));
        }
        const closingRole = body.role || 'Duty Manager';
        incident.log.push(makeLogEntry(incident,
          `Incident approved and closed by ${actor} (${closingRole}).${body.closureRemarks ? ` Closure remarks: ${body.closureRemarks}` : ''} Record is now read-only.`
        ));

        // ── Queue Closure Broadcast for Controller review (FSD §5.11.1 / §5.1.2) ──
        // C1 gate: a closure broadcast is only queued where REQUIRED under the
        // configured broadcast rules (driven by Incident Category). Where required,
        // the record is PENDING — recipients + template are pre-filled from the
        // Broadcast Matrix (snapshot per §10.3d) and the Controller reviews and
        // dispatches it via the 'dispatch-broadcast' action.
        {
          const bcConfig = await getBroadcastConfig();
          if (isClosureBroadcastRequired(incident.category, bcConfig)) {
            if (!db.broadcasts) db.broadcasts = [];
            const [groups, templates, matrix] = await Promise.all([
              getDistributionGroups(),
              getBroadcastTemplates(),
              getBroadcastMatrix(),
            ]);
            const resolved = resolveClosureBroadcast({ incident, caseId, groups, templates, matrix });
            // Fixes B4 — parses the max existing sequence instead of counting array
            // length, so a deleted broadcast or a race with the EOD cron can't
            // produce a duplicate/collided ID.
            const broadcastId = nextBroadcastId(db.broadcasts, caseId);
            const nowIso = new Date().toISOString();
            db.broadcasts.push({
              id: broadcastId,
              caseId,
              incidentId: incident.id,
              type: 'Closure',
              recipients: resolved.recipients,
              templateUsed: resolved.templateUsed,
              templateId: resolved.templateId,
              matrixRuleId: resolved.matrixRuleId,
              recipientGroups: resolved.recipientGroups,
              subject: resolved.subject,
              contentDispatched: resolved.content,
              contentDefault: resolved.content,
              channels: resolved.channels,
              crisisLevel: crisisLevelKey(incident.crisisLevel),
              incidentType: incident.type,
              incidentSubType: incident.subType,
              incidentTitle: incident.title,
              createdAt: nowIso,
              queuedBy: 'system',
              resolutionWarning: resolved.resolutionWarning,
              sentAt: null as any,
              sentBy: actor,
              status: 'PENDING',
              deliveryAttempts: 0,
            });
            incident.closureBroadcastStatus = 'pending';
            incident.closureBroadcastId = broadcastId;
            incident.log.push(makeLogEntry(incident,
              `Closure broadcast ${broadcastId} queued for Controller review — ${resolved.recipients.length} recipient(s) pre-filled from "${resolved.recipientGroups.join(', ') || 'no matched group'}".`
            ));

            // Audit trail — entityId lets the broadcast detail page's Audit Log
            // section filter the shared /api/admin/audit log to this record only.
            if (!db.auditLogs) db.auditLogs = [];
            db.auditLogs.push({
              id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              timestamp: nowIso,
              user: actor,
              module: 'Broadcast',
              action: 'Queue Closure Broadcast',
              details: `Closure broadcast ${broadcastId} queued for Controller review — ${resolved.recipients.length} recipient(s).`,
              correlationId: `CORR-${Date.now()}`,
              ipAddress: '127.0.0.1',
              entityId: broadcastId,
            });

            // ── Action Prompt Rule: notify recipient role(s) (admin config redesign,
            // 2026-07-25). Previously this prompt didn't exist at all — the Controller
            // had no in-app signal that a closure broadcast was waiting. Recipient
            // role(s) are config-driven (Broadcast Config → Action Prompt Rules), not
            // hardcoded; if the rule is Inactive/missing, nothing is sent (no hardcoded
            // fallback). recipientRoles is multi-select (2026-07-25, Kyle) — one
            // notification is fired per configured role.
            const closurePromptRule = await getActivePromptRule('closure_broadcast_queued');
            if (closurePromptRule) {
              for (const recipientRole of closurePromptRule.recipientRoles) {
                await addNotification({
                  recipientRole,
                  type: 'broadcast',
                  title: '📣 Closure Broadcast Pending Dispatch',
                  message: `${broadcastId} for incident ${incident.id} is queued and awaiting your review/dispatch.`,
                  link: `/incidents/${incident.id}`,
                });
              }
            }
            // §10.3c/G15 — 0-recipient records used to sit PENDING forever with no
            // signal that it was a config gap (missing/inactive Matrix rule or
            // group) rather than a deliberate empty broadcast. Flag System
            // Administrator directly since this is a config problem, not a
            // dispatch-review problem the Controller can fix from the broadcast UI.
            if (resolved.resolutionWarning) {
              await addNotification({
                recipientRole: 'System Administrator',
                type: 'broadcast',
                title: '⚠ Broadcast queued with 0 recipients',
                message: `${broadcastId}: ${resolved.resolutionWarning}`,
                link: `/broadcasts/${encodeIdPath(broadcastId)}`,
              });
            }
          } else {
            // Informational/Exercise & Backdated: FSD §5.1.2 — no broadcast handling by default.
            incident.closureBroadcastStatus = 'not_required';
            incident.log.push(makeLogEntry(incident,
              `Closure broadcast not required for category "${incident.category}".`
            ));
          }
        }
        break;
      }

      // ── Duty Manager returns to Controller ─────────────────────
      case 'return': {
        if (!['Live (Completed)', 'Pending Endorsement'].includes(incident.status)) {
          return NextResponse.json({ error: `Cannot return: incident status is "${incident.status}"` }, { status: 409 });
        }
        // FSD §5.5.4: return remarks are mandatory
        if (!body.returnRemarks || !body.returnRemarks.trim()) {
          return NextResponse.json({ error: 'Return remarks are required when returning an incident.' }, { status: 400 });
        }
        incident.status = 'Returned';
        incident.completionRemarks = body.returnRemarks;
        incident.log.push(makeLogEntry(incident,
          `Incident returned to Controller by ${actor}. Reason: ${body.returnRemarks}`
        ));
        break;
      }

      // ── Controller/DM returns specific Responder(s) for further action ──
      // Per-Responder, multi-select: the Controller picks one or more assigned
      // Responders to return for rework, each with its own Completion Remarks —
      // Responders not selected are left untouched (updated per Shin Feng's review
      // comment; previously this applied to every assigned Responder at once).
      //
      // Only Responders who have actually SUBMITTED something can be returned —
      // there's nothing to reject if they're still Assigned/Acknowledged/On-Site:
      //   - "Pending Controller Review": normal case, Controller reviews and rejects.
      //   - "Completed" — only while Incident.status is "Returned": the whole
      //     Incident was force-locked and the Duty Manager bounced it back, so the
      //     Controller may need to reopen a specific Responder's work.
      // Not allowed while Incident.status is "Pending Endorsement" — the Controller
      // can't silently pull back a submission before the Duty Manager has acted on it.
      case 'return-to-responder': {
        if (!['Live (Assigned)', 'Returned'].includes(incident.status)) {
          return NextResponse.json({ error: `Cannot return to responder: incident status is "${incident.status}". A Responder can only be returned while the Controller is still reviewing (Live (Assigned)), or after the Duty Manager has returned the Incident.` }, { status: 409 });
        }
        const responderIds: string[] = Array.isArray(body.responderIds)
          ? body.responderIds
          : (body.responderId ? [body.responderId] : []);
        if (responderIds.length === 0) {
          return NextResponse.json({ error: 'At least one responderId is required.' }, { status: 400 });
        }
        const remarksByResponder: Record<string, string> = body.remarksByResponder || {};
        for (const rid of responderIds) {
          const remark = remarksByResponder[rid];
          if (!remark || !remark.trim()) {
            return NextResponse.json({ error: `Completion Remarks are required for Responder ${rid}.` }, { status: 400 });
          }
        }
        const activeResponders = (incident.responders || []).filter(r => r.status === 'Active');
        const eligible = activeResponders.filter(r =>
          r.lifecycleStatus === 'Pending Controller Review' ||
          (r.lifecycleStatus === 'Completed' && incident.status === 'Returned')
        );
        const ineligibleSelected = responderIds.filter(rid => !eligible.some(r => r.responderId === rid));
        if (ineligibleSelected.length > 0) {
          return NextResponse.json({ error: `Responder(s) ${ineligibleSelected.join(', ')} haven't submitted for review yet and cannot be returned.` }, { status: 409 });
        }
        const targets = eligible.filter(r => responderIds.includes(r.responderId));
        if (targets.length === 0) {
          return NextResponse.json({ error: 'None of the specified Responders are eligible to be returned.' }, { status: 404 });
        }
        const returnNow = new Date().toISOString();
        targets.forEach(r => {
          r.lifecycleStatus = 'Live (Incomplete)';
          r.completionRemarks = remarksByResponder[r.responderId];
          r.returnedAt = returnNow;
          r.returnedBy = actor;
        });
        // If the Duty Manager had bounced the whole Incident back (Returned), returning
        // a Responder for rework brings the Incident back down to Live (Assigned).
        if (incident.status === 'Returned') {
          incident.status = 'Live (Assigned)';
        }
        incident.log.push(makeLogEntry(incident,
          `Incident returned to Responder(s) for further action by ${actor}: ` +
          targets.map(r => `${r.responderId} — "${remarksByResponder[r.responderId]}"`).join('; ')
        ));
        break;
      }

      // ── System Administrator Reopens closed incident ───────────
      case 'reopen': {
        // FSD §5.6.1: only System Administrator may reopen
        if (body.role !== 'System Administrator') {
          return NextResponse.json({ error: 'Only a System Administrator can reopen a closed incident.' }, { status: 403 });
        }
        if (incident.status !== 'Closed') {
          return NextResponse.json({ error: 'Incident is not closed and cannot be reopened.' }, { status: 400 });
        }
        incident.status = 'Live';
        incident.closedAt = undefined;
        incident.closedBy = undefined;
        if (currentCase.status === 'Closed' || currentCase.status === 'No Action Required') {
          currentCase.status = 'Active';
          currentCase.closedAt = null;
          currentCase.closedBy = null;
        }
        incident.log.push(makeLogEntry(incident, `Incident reopened by System Administrator (${actor}). Status reset to Live.`));
        break;
      }

      // ── Mark as False Alarm (FRD 5.10) ────────────────────────
      case 'mark-false-alarm': {
        if (incident.status === 'Closed') {
          return NextResponse.json({ error: 'Incident is already Closed.' }, { status: 409 });
        }
        if (incident.status === 'Pending Endorsement') {
          return NextResponse.json({ error: 'Cannot mark as false alarm while Pending Endorsement. The Duty Manager must first return the record.' }, { status: 409 });
        }
        const prevStatus = incident.status;
        incident.status = 'Closed';
        (incident as any).isFalseAlarm = true;
        incident.completionRemarks = body.remarks || 'Closed as False Alarm. No further action required.';
        incident.closedAt = new Date().toISOString();
        incident.closedBy = actor;
        incident.log.push(makeLogEntry(incident,
          `Incident marked as FALSE ALARM and closed by ${actor}. Previous status: "${prevStatus}". Record retained for audit purposes.`
        ));
        // FSD §4.3.2: False alarm with no outstanding tasks → Case = No Action Required (not Closed)
        const activeTasks = db.tasks.filter(t => t.caseId === caseId && t.status !== 'Closed');
        if (activeTasks.length === 0) {
          currentCase.status = 'No Action Required';
        }
        break;
      }

      // ── Link as Duplicate of a Master Incident (FRD 5.7) ──────
      case 'link-duplicate': {
        const { masterIncidentId } = body;
        if (!masterIncidentId) {
          return NextResponse.json({ error: 'masterIncidentId is required' }, { status: 400 });
        }
        const masterCaseIndex = db.cases.findIndex(c => c.incident?.id === masterIncidentId);
        if (masterCaseIndex === -1) {
          return NextResponse.json({ error: `Master incident ${masterIncidentId} not found` }, { status: 404 });
        }
        const masterIncident = db.cases[masterCaseIndex].incident!;

        if (!masterIncident.slaveIncidents) masterIncident.slaveIncidents = [];
        masterIncident.slaveIncidents.push({
          id: incident.id,
          caseId: incident.caseId,
          title: incident.title,
          dateTime: incident.dateTime,
          reporterName: incident.reporterName,
          summary: incident.summary || '',
          status: 'Closed'
        });
        masterIncident.log.push(makeLogEntry(masterIncident,
          `Duplicate report ${incident.id} linked to this incident by ${actor}.`
        ));
        db.cases[masterCaseIndex].incident = masterIncident;

        incident.isDuplicate = true;
        incident.masterIncidentId = masterIncidentId;
        incident.status = 'Closed';
        incident.closedAt = new Date().toISOString();
        incident.closedBy = actor;
        incident.completionRemarks = `Linked as duplicate of ${masterIncidentId}. Closed automatically.`;
        incident.log.push(makeLogEntry(incident, `Incident linked as duplicate of ${masterIncidentId} by ${actor}. Record closed.`));
        break;
      }

      // ── Append manual log entry ────────────────────────────────
      case 'log': {
        if (!body.description) return NextResponse.json({ error: 'description is required' }, { status: 400 });
        const isRangerLog = body.description.startsWith('[Ranger Log]');
        const text = isRangerLog ? body.description : `[MANUAL] ${body.description} — by ${actor}.`;
        const baseEntry = makeLogEntry(incident, text);
        // Use Controller-specified event date/time if provided, otherwise keep system now
        if (body.eventDate) baseEntry.date = body.eventDate;
        if (body.eventTime) baseEntry.time = body.eventTime.length === 5 ? `${body.eventTime}:00` : body.eventTime;
        const entry = { ...baseEntry, attachments: body.attachments || [] };
        incident.log.push(entry);
        break;
      }

      // ── Edit manual log entry ──────────────────────────────────
      case 'edit-log': {
        const eventNumber = parseInt(body.eventNumber, 10);
        const newDescription = body.description;
        if (isNaN(eventNumber) || !newDescription) {
          return NextResponse.json({ error: 'eventNumber and description are required' }, { status: 400 });
        }
        const logEntry = incident.log.find(e => e.eventNumber === eventNumber);
        if (!logEntry) return NextResponse.json({ error: 'Log entry not found' }, { status: 404 });

        let updatedText = newDescription;
        if (logEntry.description.startsWith('[Ranger Log] ')) {
          updatedText = `[Ranger Log] ${newDescription}`;
        } else if (logEntry.description.startsWith('[MANUAL] ')) {
          const suffixIndex = logEntry.description.lastIndexOf(' — by ');
          updatedText = suffixIndex !== -1
            ? `[MANUAL] ${newDescription}${logEntry.description.slice(suffixIndex)}`
            : `[MANUAL] ${newDescription} — by ${actor}.`;
        }
        logEntry.description = updatedText;
        if (body.eventDate) logEntry.date = body.eventDate;
        if (body.eventTime) logEntry.time = body.eventTime.length === 5 ? `${body.eventTime}:00` : body.eventTime;
        if (body.attachments !== undefined) (logEntry as any).attachments = body.attachments;
        logEntry.edited = true;
        logEntry.editedBy = actor;
        logEntry.editedAt = new Date().toISOString();
        break;
      }

      // ── Soft Delete manual log entry ──────────────────────────
      case 'delete-log': {
        const eventNumber = parseInt(body.eventNumber, 10);
        if (isNaN(eventNumber)) return NextResponse.json({ error: 'eventNumber is required' }, { status: 400 });
        const logEntry = incident.log.find(e => e.eventNumber === eventNumber);
        if (!logEntry) return NextResponse.json({ error: 'Log entry not found' }, { status: 404 });
        logEntry.deleted = true;
        logEntry.deletedBy = actor;
        logEntry.deletedAt = new Date().toISOString();
        break;
      }

      // ── Update ancillary fields ────────────────────────────────
      case 'update-fields': {
        if (body.emergencyServices) incident.emergencyServices = { ...incident.emergencyServices, ...body.emergencyServices };
        if (body.mediaInvolvement) {
          const prevComms = incident.mediaInvolvement.commsNotified;
          incident.mediaInvolvement = { ...incident.mediaInvolvement, ...body.mediaInvolvement };
          if (incident.mediaInvolvement.commsNotified && !prevComms) {
            incident.log.push(makeLogEntry(incident, 'SDC Communications Team notified regarding media presence.'));
            // §10.8/G10 — see matching PUT-handler comment above.
            const mediaPromptRule = await getActivePromptRule('media_present_confirmed');
            if (mediaPromptRule) {
              for (const recipientRole of mediaPromptRule.recipientRoles) {
                await addNotification({
                  recipientRole,
                  type: 'broadcast',
                  title: '📰 Notify SDC Communications Team',
                  message: `Media presence confirmed on ${incident.id}${incident.mediaInvolvement.mediaName ? ` (${incident.mediaInvolvement.mediaName})` : ''} — please notify the SDC Communications team by broadcast.`,
                  link: `/incidents/${incident.id}`,
                });
              }
            }
          }
        }
        if (body.propertyDamage) incident.propertyDamage = { ...incident.propertyDamage, ...body.propertyDamage };
        if (body.vehiclesInvolved) incident.vehiclesInvolved = body.vehiclesInvolved;
        if (body.personalInjuries) incident.personalInjuries = body.personalInjuries;
        if (body.personsInvolved) incident.personsInvolved = body.personsInvolved;
        if (body.cctvBwc) incident.cctvBwc = body.cctvBwc;
        if (body.summary !== undefined) incident.summary = body.summary;
        if (body.category) {
          if (!isValidIncidentCategory(body.category)) {
            return NextResponse.json({ error: `Invalid Incident Category: "${body.category}".` }, { status: 400 });
          }
          incident.category = body.category;
        }
        if (body.reportingSource !== undefined) incident.reportingSource = body.reportingSource;
        incident.log.push(makeLogEntry(incident, `Ancillary fields updated by ${actor}.`));
        break;
      }

      // ── Controller dispatches a PENDING Closure Broadcast (FSD §5.11.1b / §10.1) ──
      // Controller reviews the pre-filled recipients/content, then dispatches. Moves
      // the BroadcastRecord PENDING → SENT and stamps the incident as 'dispatched'.
      case 'dispatch-broadcast': {
        // RBAC (FSD §3 / §13.1) — broadcast.dispatch required. Fixes bug B5: role
        // used to be optional here (`if (body.role && ...)`), so simply omitting
        // it from the request body skipped the permission check entirely. Once a
        // real auth/session layer replaces the mock-identity RoleContext, swap
        // this for the resolved session role instead of trusting the client body.
        if (!body.role) {
          return NextResponse.json({ error: 'role is required.' }, { status: 400 });
        }
        if (!hasBroadcastPermission(body.role, 'broadcast.dispatch')) {
          return NextResponse.json({ error: 'You do not have permission to dispatch broadcasts.' }, { status: 403 });
        }
        if (!db.broadcasts) db.broadcasts = [];
        const bcId = body.broadcastId || incident.closureBroadcastId;
        const bc = db.broadcasts.find(b => b.id === bcId && b.incidentId === incident.id);
        if (!bc) {
          return NextResponse.json({ error: 'Broadcast not found for this incident.' }, { status: 404 });
        }
        if (bc.status !== 'PENDING') {
          return NextResponse.json({ error: `Broadcast ${bc.id} is already ${bc.status}.` }, { status: 409 });
        }
        const recipients: string[] = Array.isArray(body.recipients) ? body.recipients : bc.recipients;
        if (!recipients || recipients.length === 0) {
          return NextResponse.json({ error: 'Cannot dispatch: recipient list is empty.' }, { status: 400 });
        }
        // §10.4d — content edited BEYOND the auto-filled default needs explicit
        // confirmation (2026-07-25: content-diff gate, replaces the old per-field
        // sensitiveFields checklist — see BroadcastTemplate comment in
        // broadcastConfig.ts). Diffs against contentDefault (the untouched
        // auto-fill snapshot taken at queue time, gap G6) when present, falling
        // back to contentDispatched for records queued before that field existed —
        // must be computed BEFORE contentDispatched gets overwritten below.
        const baseline = bc.contentDefault ?? bc.contentDispatched ?? '';
        const contentChanged = typeof body.content === 'string' && body.content.trim() !== baseline.trim();
        if (contentChanged && !body.confirmContentChange) {
          return NextResponse.json({
            error: 'Content has been edited from the auto-filled default — explicit confirmation is required before dispatch.',
            requiresContentConfirmation: true,
          }, { status: 409 });
        }
        const now = new Date().toISOString();
        const before = JSON.stringify({ status: bc.status, recipients: bc.recipients.length });
        bc.recipients = recipients;
        if (typeof body.content === 'string' && body.content.length > 0) bc.contentDispatched = body.content;
        bc.status = 'SENT';
        bc.sentAt = now;
        bc.sentBy = actor;
        bc.dispatchedBy = actor;
        bc.dispatchedAt = now;
        bc.deliveryAttempts = (bc.deliveryAttempts || 0) + 1;
        bc.deliveryCounts = initialDeliveryCounts(recipients.length);
        if (contentChanged && body.confirmContentChange) bc.contentEditConfirmed = true;
        if (bc.type === 'Closure') {
          incident.closureBroadcastStatus = 'dispatched';
          incident.closureBroadcastId = bc.id;
        }
        incident.log.push(makeLogEntry(incident,
          `Broadcast ${bc.id} dispatched by ${actor} to ${recipients.length} recipient(s).`
          + (bc.contentEditConfirmed ? ' Content edited from default — Duty Manager confirmed.' : '')
        ));
        // Mock Email gateway — fire the actual send for the Email channel (§10.1a/§10.2).
        // Fire-and-forget: broadcast dispatch is not blocked on gateway latency.
        // Uses bc.subject (rendered from BroadcastTemplate.subject at queue time —
        // fixes G4) with a fallback for legacy records queued before that field
        // existed, so old PENDING broadcasts don't crash dispatch.
        if (!bc.channels || bc.channels.includes('Email')) {
          sendEmailMockBatch({
            recipients,
            subject: bc.subject || `[SDC] ${bc.type} Broadcast — ${bc.id}`,
            body: bc.contentDispatched,
            caseId: bc.caseId,
            broadcastId: bc.id,
          }).catch(() => {});
        }
        // In-app "Push Notification" channel (§10.2) — fixes G2: previously the
        // Matrix could set this channel and the UI would display it as part of the
        // broadcast, but nothing was ever sent for it. The notification mailbox
        // (broadcastStore/NotificationContext) only targets ROLES, not individual
        // email addresses — there's no email→user-account resolution wired in yet
        // — so this fires one role-level System Notification to the receive-only
        // 'Broadcast Recipient' role rather than silently doing nothing. Revisit
        // once real auth maps recipients to actual user accounts.
        if (bc.channels?.includes('Push Notification')) {
          addNotification({
            recipientRole: 'Broadcast Recipient',
            type: 'broadcast',
            title: bc.subject || `${bc.type} Broadcast`,
            message: bc.contentDispatched.slice(0, 240),
            link: `/broadcasts/${encodeIdPath(bc.id)}`,
          }).catch(() => {});
        }
        // Audit trail (FSD §13.5) — recorded server-side alongside the dispatch.
        if (!db.auditLogs) db.auditLogs = [];
        db.auditLogs.push({
          id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          timestamp: now,
          user: actor,
          module: 'Broadcast',
          action: 'Dispatch Broadcast',
          details: `Dispatched ${bc.type} broadcast ${bc.id} for incident ${incident.id} to ${recipients.length} recipient(s).`,
          beforeSnapshot: before,
          afterSnapshot: JSON.stringify({ status: 'SENT', recipients: recipients.length }),
          correlationId: `CORR-${Date.now()}`,
          ipAddress: '127.0.0.1',
        });
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown action: "${action}"` }, { status: 400 });
    }

    currentCase.incident = incident;
    db.cases[caseIndex] = currentCase;
    if (action === 'close' || action === 'link-duplicate') {
      tryAutoCloseCase(db, caseId);
    }
    await saveDb(db);

    return NextResponse.json({ ok: true, incident, case: currentCase });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
      