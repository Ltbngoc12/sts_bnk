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
 * Segments supported:
 *   GET  /api/incidents/[caseId]               → fetch incident
 *   PUT  /api/incidents/[caseId]               → legacy partial update (deprecated)
 *   POST /api/incidents/[caseId]/assign        → assign responder
 *   POST /api/incidents/[caseId]/acknowledge   → responder acknowledges dispatch
 *   POST /api/incidents/[caseId]/on-site       → responder arrives on site
 *   POST /api/incidents/[caseId]/complete      → responder completes ground activities
 *   POST /api/incidents/[caseId]/close         → DM/DM-elevated approves closure
 *   POST /api/incidents/[caseId]/return        → DM returns incident to controller
 *   POST /api/incidents/[caseId]/log           → append manual log entry
 *   POST /api/incidents/[caseId]/update-fields → update ancillary fields (injuries, damage, media, etc.)
 */

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const caseId = id[0];
    const db = getDb();
    const caseObj = db.cases.find(c => c.id === caseId);
    if (!caseObj?.incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }
    return NextResponse.json(caseObj.incident);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── PUT (legacy / general update) ───────────────────────────────────────────
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const caseId = id.join('/');
    const body = await request.json();
    const db = getDb();

    const caseIndex = db.cases.findIndex(c => c.id === caseId);
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
        incident.log.push({ eventNumber: incident.log.length + 1, date: logDate, time: logTime,
          description: `Responder assigned: ${body.assignedTo} (by ${body.username ?? 'Controller'}).` });
      }
    }

    // Status transition
    if (body.status) {
      const old = incident.status;
      incident.status = body.status;
      let msg = `Status changed from "${old}" → "${body.status}"${body.username ? ` by ${body.username}` : ''}.`;

      if (body.status === 'Live (Acknowledged)') msg = `Responder ${incident.assignedTo ?? '—'} acknowledged dispatch.`;
      else if (body.status === 'Live (On-Site)')    msg = `Responder ${incident.assignedTo ?? '—'} confirmed arrival on-site.`;
      else if (body.status === 'Live (Completed)') {
        msg = `Responder ${incident.assignedTo ?? '—'} marked ground activities completed.`;
        if (body.completionRemarks) { incident.completionRemarks = body.completionRemarks; msg += ` Remarks: ${body.completionRemarks}`; }
      } else if (body.status === 'Closed') {
        currentCase.status = 'Closed';
        currentCase.closedAt = new Date().toISOString();
        msg = `Incident closed by ${body.username ?? 'Duty Manager'}. Record is now read-only.`;
      } else if (body.status === 'Returned') {
        msg = `Incident returned to Controller by ${body.username ?? 'Duty Manager'}.`;
      }

      incident.log.push({ eventNumber: incident.log.length + 1, date: logDate, time: logTime, description: msg });
    }

    // Manual log entry
    if (body.newLogEntry) {
      incident.log.push({ eventNumber: incident.log.length + 1, date: logDate, time: logTime, description: body.newLogEntry });
    }

    // Ancillary field updates
    if (body.emergencyServices) incident.emergencyServices = { ...incident.emergencyServices, ...body.emergencyServices };
    if (body.mediaInvolvement) {
      incident.mediaInvolvement = { ...incident.mediaInvolvement, ...body.mediaInvolvement };
      if (body.mediaInvolvement.commsNotified) {
        incident.log.push({ eventNumber: incident.log.length + 1, date: logDate, time: logTime, description: 'SDC Communications Team notified regarding media presence.' });
      }
    }
    if (body.propertyDamage)   incident.propertyDamage   = { ...incident.propertyDamage, ...body.propertyDamage };
    if (body.vehiclesInvolved) incident.vehiclesInvolved  = body.vehiclesInvolved;
    if (body.personalInjuries) incident.personalInjuries  = body.personalInjuries;
    if (body.personsInvolved)  incident.personsInvolved   = body.personsInvolved;
    if (body.cctvBwc)          incident.cctvBwc           = body.cctvBwc;
    if (body.summary)          incident.summary           = body.summary;
    if (body.slaveIncidents)   incident.slaveIncidents    = body.slaveIncidents;

    currentCase.incident = incident;
    db.cases[caseIndex] = currentCase;
    saveDb(db);

    return NextResponse.json(incident);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── POST (action-oriented) ───────────────────────────────────────────────────
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    // id = ['CASE-001'] or ['CASE-001', 'assign']
    const caseId = id[0];
    const action = id[1] ?? null; // e.g. 'assign', 'acknowledge', etc.

    const body = await request.json().catch(() => ({}));
    const db = getDb();

    const caseIndex = db.cases.findIndex(c => c.id === caseId);
    if (caseIndex === -1 || !db.cases[caseIndex].incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    const currentCase = db.cases[caseIndex];
    const incident = currentCase.incident!;
    const actor = body.username ?? 'System';

    switch (action) {
      // ── Assign responder ───────────────────────────────────────
      case 'assign': {
        if (!body.assignedTo) return NextResponse.json({ error: 'assignedTo is required' }, { status: 400 });
        const prev = incident.assignedTo;
        incident.assignedTo = body.assignedTo;
        incident.log.push(makeLogEntry(incident, `Responder assigned: ${body.assignedTo}${prev ? ` (replaced ${prev})` : ''} — by ${actor}.`));
        break;
      }

      // ── Responder acknowledges ─────────────────────────────────
      case 'acknowledge': {
        if (incident.status !== 'Live') {
          return NextResponse.json({ error: `Cannot acknowledge: current status is "${incident.status}"` }, { status: 409 });
        }
        incident.status = 'Live (Acknowledged)';
        incident.acknowledgedAt = new Date().toISOString();
        incident.log.push(makeLogEntry(incident, `Responder ${incident.assignedTo ?? actor} acknowledged dispatch.`));
        break;
      }

      // ── Responder arrives on-site ──────────────────────────────
      case 'on-site': {
        if (incident.status !== 'Live (Acknowledged)') {
          return NextResponse.json({ error: `Cannot mark on-site: current status is "${incident.status}"` }, { status: 409 });
        }
        incident.status = 'Live (On-Site)';
        incident.onSiteAt = new Date().toISOString();
        incident.log.push(makeLogEntry(incident, `Responder ${incident.assignedTo ?? actor} confirmed arrival on-site.`));
        break;
      }

      // ── Responder completes ground activities ──────────────────
      case 'complete': {
        if (!['Live (On-Site)', 'Live (Acknowledged)', 'Live'].includes(incident.status)) {
          return NextResponse.json({ error: `Cannot complete: current status is "${incident.status}"` }, { status: 409 });
        }
        incident.status = 'Live (Completed)';
        incident.completedAt = new Date().toISOString();
        if (body.completionRemarks) incident.completionRemarks = body.completionRemarks;
        incident.log.push(makeLogEntry(incident,
          `Responder ${incident.assignedTo ?? actor} marked ground activities completed.${body.completionRemarks ? ` Remarks: ${body.completionRemarks}` : ''}`
        ));
        break;
      }

      // ── Duty Manager closes incident ───────────────────────────
      case 'close': {
        if (incident.status !== 'Pending Review') {
          // DM can also force-close from completed states
          if (!['Live (Completed)', 'Live (On-Site)', 'Live (Acknowledged)'].includes(incident.status)) {
            return NextResponse.json({ error: `Cannot close: incident is "${incident.status}"` }, { status: 409 });
          }
        }
        incident.status = 'Closed';
        incident.closedAt = new Date().toISOString();
        if (body.closureRemarks) incident.closureRemarks = body.closureRemarks;
        // Also close the parent case
        currentCase.status = 'Closed';
        currentCase.closedAt = new Date().toISOString();
        // Close any slave incidents
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
        incident.status = 'Live';
        incident.log.push(makeLogEntry(incident,
          `Incident returned to Controller by ${actor}${body.returnRemarks ? `. Reason: ${body.returnRemarks}` : '.'}`
        ));
        break;
      }

      // ── Submit for review (pending DM approval) ────────────────
      case 'submit-review': {
        if (incident.status !== 'Live (Completed)') {
          return NextResponse.json({ error: `Can only submit for review from "Live (Completed)" status` }, { status: 409 });
        }
        incident.status = 'Pending Review';
        incident.log.push(makeLogEntry(incident, `Incident submitted for Duty Manager review by ${actor}.`));
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
        if (body.propertyDamage)   incident.propertyDamage   = { ...incident.propertyDamage, ...body.propertyDamage };
        if (body.vehiclesInvolved) incident.vehiclesInvolved  = body.vehiclesInvolved;
        if (body.personalInjuries) incident.personalInjuries  = body.personalInjuries;
        if (body.personsInvolved)  incident.personsInvolved   = body.personsInvolved;
        if (body.cctvBwc)          incident.cctvBwc           = body.cctvBwc;
        if (body.summary)          incident.summary           = body.summary;
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
