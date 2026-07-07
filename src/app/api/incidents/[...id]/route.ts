import { NextResponse } from 'next/server';
import { getDb, saveDb, generateCaseId } from '@/lib/db';
import { tryAutoCloseCase } from '@/lib/autoclose';
import { isValidIncidentCategory } from '@/lib/incidentCategory';

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
      'assign', 'acknowledge', 'on-site', 'notify-complete', 'close', 'return',
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
          // Backdated Incident (FSD v0.5 §5.1.2) never goes through the live ground-response
          // cycle — assigning a Responder is a record only (who handled it), not a dispatch.
          // Status stays as-is; acknowledge/on-site/notify-complete are blocked below too.
          if (incident.status === 'Live' && incident.category !== 'Backdated Incident') {
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
        if (incident.category === 'Backdated Incident') {
          return NextResponse.json({ error: 'Backdated Incidents do not go through the ground-response cycle — there is nothing to acknowledge.' }, { status: 409 });
        }
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
        if (incident.category === 'Backdated Incident') {
          return NextResponse.json({ error: 'Backdated Incidents do not go through the ground-response cycle — there is no on-site step.' }, { status: 409 });
        }
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
        if (incident.category === 'Backdated Incident') {
          return NextResponse.json({ error: 'Backdated Incidents do not go through the ground-response cycle — submit the Incident directly for endorsement instead.' }, { status: 409 });
        }
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
        break;
      }

      // ── Submit (or Force Submit) for Duty Manager endorsement ─────────────────────
      // Standard submit requires every active Responder to already be at
      // "Pending Controller Review" (or already Live (Incomplete)/Completed). Force
      // Submit (body.force === true) bypasses that gate and locks every active
      // Responder to Completed regardless of their current stage.
      case 'submit-review':
      case 'submit-endorsement': {
        // "Live" is included alongside "Live (Assigned)"/"Returned" so an incident that never
        // had a Responder assigned can still be submitted for endorsement — this is required for
        // Backdated Incident and Informational/Exercise Records (FSD v0.5 §5.1.2), which by design
        // may have zero Responders. Before the Incident Category feature this branch was
        // unreachable in practice since Category had no UI, so no incident ever legitimately
        // stayed at "Live" through to submission.
        if (!['Live', 'Live (Assigned)', 'Returned'].includes(incident.status)) {
          return NextResponse.json({ error: `Cannot submit for endorsement: incident must be Live, Live (Assigned) or Returned (current: "${incident.status}").` }, { status: 409 });
        }
        const activeResponders = (incident.responders || []).filter(r => r.status === 'Active');
        // Backdated Incident Responders never go through the ground-response cycle (see the
        // 'acknowledge'/'on-site'/'notify-complete' guards above), so their lifecycleStatus
        // legitimately stays "Assigned" forever — that's expected, not "outstanding work",
        // so the Force Submit warning gate below doesn't apply to this category.
        const notYetReviewed = incident.category === 'Backdated Incident'
          ? []
          : activeResponders.filter(r => !['Pending Controller Review', 'Live (Incomplete)', 'Completed'].includes(r.lifecycleStatus));
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

        // ── Queue Closure Broadcast for Controller review (FSD §5.3.11) ────────
        // Broadcast is PENDING — not dispatched until Controller reviews and confirms
        if (!db.broadcasts) db.broadcasts = [];
        const broadcastSeq = db.broadcasts.filter(b => b.caseId === caseId).length + 1;
        const broadcastId = `${caseId}-BC${String(broadcastSeq).padStart(3, '0')}`;
        db.broadcasts.push({
          id: broadcastId,
          caseId,
          incidentId: incident.id,
          type: 'Closure',
          recipients: [],
          templateUsed: 'Closure Broadcast Template',
          contentDispatched: [
            'INCIDENT CLOSURE NOTICE',
            `Case ID: ${caseId}`,
            `Incident ID: ${incident.id}`,
            `Title: ${incident.title}`,
            `Type: ${incident.type} — ${incident.subType}`,
            `Location: ${incident.location?.commonName || 'N/A'}`,
            `Closed At: ${incident.closedAt}`,
            `Closed By: ${actor}`,
            `Closure Remarks: ${body.closureRemarks || 'N/A'}`,
          ].join('\n'),
          sentAt: null as any,
          sentBy: actor,
          status: 'PENDING',
          deliveryAttempts: 0
        });
        incident.closureBroadcastStatus = 'pending';
        incident.closureBroadcastId = broadcastId;
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
          incident.mediaInvolvement = { ...incident.mediaInvolvement, ...body.mediaInvolvement };
          if (body.mediaInvolvement.commsNotified) {
            incident.log.push(makeLogEntry(incident, 'SDC Communications Team notified regarding media presence.'));
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
      