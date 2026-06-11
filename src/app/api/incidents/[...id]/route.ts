import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';

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
    const db = getDb();
    const caseObj = db.cases.find(c => c.id === queryId || (c.incident && c.incident.id === queryId));
    if (!caseObj?.incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }
    return NextResponse.json(caseObj.incident);
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
    const db = getDb();

    const caseIndex = db.cases.findIndex(c => c.id === queryId || (c.incident && c.incident.id === queryId));
    if (caseIndex === -1 || !db.cases[caseIndex].incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    const currentCase = db.cases[caseIndex];
    const incident = currentCase.incident!;
    const now = new Date();
    const logDate = now.toISOString().split('T')[0];
    const logTime = now.toLocaleTimeString('en-US', { hour12: false });

    // Assigned responder
    if (body.assignedTo !== undefined) {
      const prev = incident.assignedTo;
      incident.assignedTo = body.assignedTo;
      if (body.assignedTo && body.assignedTo !== prev) {
        incident.status = 'Live (Assigned)';
        incident.log.push({
          eventNumber: incident.log.length + 1,
          date: logDate,
          time: logTime,
          description: `Responder assigned: ${body.assignedTo} (by ${body.username ?? 'Controller'}). Status set to Live (Assigned).`
        });
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
    if (body.category) incident.category = body.category;

    currentCase.incident = incident;
    db.cases[caseIndex] = currentCase;
    saveDb(db);

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
    
    // Resolve queryId and action correctly
    const lastSegment = id[id.length - 1];
    let action: string | null = null;
    let queryId = id.join('/');

    const knownActions = [
      'assign', 'acknowledge', 'on-site', 'complete', 'close', 'return',
      'submit-review', 'submit-endorsement', 'log', 'update-fields',
      'reopen', 'mark-incomplete'
    ];

    if (knownActions.includes(lastSegment)) {
      action = lastSegment;
      queryId = id.slice(0, -1).join('/');
    }

    const body = await request.json().catch(() => ({}));
    const db = getDb();

    const caseIndex = db.cases.findIndex(c => c.id === queryId || (c.incident && c.incident.id === queryId));
    if (caseIndex === -1 || !db.cases[caseIndex].incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    const currentCase = db.cases[caseIndex];
    const incident = currentCase.incident!;
    const actor = body.username ?? 'System';
    const caseId = currentCase.id;

    switch (action) {
      // ── Assign responder ───────────────────────────────────────
      case 'assign': {
        if (!body.assignedTo) return NextResponse.json({ error: 'assignedTo is required' }, { status: 400 });
        const prev = incident.assignedTo;
        incident.assignedTo = body.assignedTo;
        incident.status = 'Live (Assigned)';
        incident.log.push(makeLogEntry(incident, `Responder assigned: ${body.assignedTo}${prev ? ` (replaced ${prev})` : ''} — by ${actor}. Status changed to Live (Assigned).`));
        break;
      }

      // ── Responder acknowledges ─────────────────────────────────
      case 'acknowledge': {
        if (!['Live', 'Live (Assigned)'].includes(incident.status)) {
          return NextResponse.json({ error: `Cannot acknowledge: current status is "${incident.status}"` }, { status: 409 });
        }
        incident.status = 'Live (Acknowledged)';
        incident.acknowledgedAt = new Date().toISOString();
        incident.log.push(makeLogEntry(incident, `Responder ${incident.assignedTo ?? actor} acknowledged dispatch. Status changed to Live (Acknowledged).`));
        break;
      }

      // ── Responder arrives on-site ──────────────────────────────
      case 'on-site': {
        if (incident.status !== 'Live (Acknowledged)') {
          return NextResponse.json({ error: `Cannot mark on-site: current status is "${incident.status}"` }, { status: 409 });
        }
        incident.status = 'Live (On-Site)';
        incident.onSiteAt = new Date().toISOString();
        incident.log.push(makeLogEntry(incident, `Responder ${incident.assignedTo ?? actor} confirmed arrival on-site. Status changed to Live (On-Site).`));
        break;
      }

      // ── Responder completes ground activities ──────────────────
      case 'complete': {
        if (!['Live (On-Site)', 'Live (Acknowledged)', 'Live', 'Live (Assigned)', 'Live (Incomplete)'].includes(incident.status)) {
          return NextResponse.json({ error: `Cannot complete: current status is "${incident.status}"` }, { status: 409 });
        }
        incident.status = 'Live (Completed)';
        incident.completedAt = new Date().toISOString();
        if (body.completionRemarks) incident.completionRemarks = body.completionRemarks;
        incident.log.push(makeLogEntry(incident,
          `Responder ${incident.assignedTo ?? actor} marked ground activities completed.${body.completionRemarks ? ` Remarks: ${body.completionRemarks}` : ''} Status changed to Live (Completed).`
        ));
        break;
      }

      // ── Submit for review / endorsement ────────────────────────
      case 'submit-review':
      case 'submit-endorsement': {
        if (!['Live (Completed)', 'Live (Incomplete)', 'Returned', 'Live'].includes(incident.status)) {
          return NextResponse.json({ error: `Can only submit for endorsement from completed, incomplete, or returned status. Current: "${incident.status}"` }, { status: 409 });
        }
        incident.status = 'Pending Endorsement';
        incident.log.push(makeLogEntry(incident, `Incident submitted for Duty Manager endorsement by ${actor}.`));
        break;
      }

      // ── Duty Manager approves closure ──────────────────────────
      case 'close': {
        if (!['Pending Endorsement', 'Live (Completed)', 'Live (On-Site)', 'Live (Acknowledged)', 'Live (Incomplete)'].includes(incident.status)) {
          return NextResponse.json({ error: `Cannot close: incident status is "${incident.status}"` }, { status: 409 });
        }
        incident.status = 'Closed';
        
        // Close the parent case only if no other active tasks exist
        const activeTasks = db.tasks.filter(t => t.caseId === caseId && t.status !== 'Closed');
        if (activeTasks.length === 0) {
          currentCase.status = 'Closed';
          currentCase.closedAt = new Date().toISOString();
          currentCase.closedBy = actor;
        }
        
        // Close any linked duplicate records
        if (incident.slaveIncidents) {
          incident.slaveIncidents = incident.slaveIncidents.map((s: any) => ({ ...s, status: 'Closed' }));
        }
        incident.log.push(makeLogEntry(incident,
          `Incident approved and closed by ${actor} (Duty Manager).${body.closureRemarks ? ` Closure remarks: ${body.closureRemarks}` : ''} Record is now read-only.`
        ));
        break;
      }

      // ── Duty Manager returns to controller ─────────────────────
      case 'return': {
        if (incident.status !== 'Pending Endorsement') {
          return NextResponse.json({ error: `Cannot return: incident status is "${incident.status}" (must be Pending Endorsement)` }, { status: 409 });
        }
        incident.status = 'Returned';
        incident.log.push(makeLogEntry(incident,
          `Incident returned to Controller by ${actor}${body.returnRemarks ? `. Reason: ${body.returnRemarks}` : '.'}`
        ));
        break;
      }

      // ── System Administrator Reopens closed incident ───────────
      case 'reopen': {
        if (incident.status !== 'Closed') {
          return NextResponse.json({ error: 'Incident is not closed and cannot be reopened.' }, { status: 400 });
        }
        
        incident.status = 'Live';
        
        // Reopen parent Case as active
        if (currentCase.status === 'Closed') {
          currentCase.status = 'Active';
          currentCase.closedAt = null;
          currentCase.closedBy = null;
        }
        
        incident.log.push(makeLogEntry(incident, `Incident reopened by System Administrator (${actor}). Status reset to Live.`));
        break;
      }

      // ── Mark Incomplete ────────────────────────────────────────
      case 'mark-incomplete': {
        if (!['Live (On-Site)', 'Live (Acknowledged)', 'Live (Assigned)', 'Live'].includes(incident.status)) {
          return NextResponse.json({ error: `Cannot mark incomplete: current status is "${incident.status}"` }, { status: 409 });
        }
        incident.status = 'Live (Incomplete)';
        incident.log.push(makeLogEntry(incident, `Incident marked as Incomplete by ${actor}.${body.remarks ? ` Remarks: ${body.remarks}` : ''}`));
        break;
      }

      // ── Append manual log entry ────────────────────────────────
      case 'log': {
        if (!body.description) return NextResponse.json({ error: 'description is required' }, { status: 400 });
        incident.log.push(makeLogEntry(incident, `[MANUAL] ${body.description} — by ${actor}.`));
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
        if (body.summary) incident.summary = body.summary;
        if (body.category) incident.category = body.category;
        
        incident.log.push(makeLogEntry(incident, `Ancillary fields updated by ${actor}.`));
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown action: "${action}"` }, { status: 400 });
    }

    currentCase.incident = incident;
    db.cases[caseIndex] = currentCase;
    saveDb(db);

    return NextResponse.json({ ok: true, incident, case: currentCase });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
