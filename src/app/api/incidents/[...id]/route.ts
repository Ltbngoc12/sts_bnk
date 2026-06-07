import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const caseId = id.join('/');
    const body = await request.json();
    const db = getDb();
    
    // Find the case by ID
    const caseIndex = db.cases.findIndex(c => c.id === caseId);
    if (caseIndex === -1 || !db.cases[caseIndex].incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }
    
    const currentCase = db.cases[caseIndex];
    const incident = currentCase.incident!;
    const logDate = new Date().toISOString().split('T')[0];
    const logTime = new Date().toLocaleTimeString('en-US', { hour12: false });
    
    // 1. Update Assigned Responder
    if (body.assignedTo !== undefined) {
      const prevAssignee = incident.assignedTo;
      incident.assignedTo = body.assignedTo;
      if (body.assignedTo && body.assignedTo !== prevAssignee) {
        // Log dispatcher event
        incident.log.push({
          eventNumber: incident.log.length + 1,
          date: logDate,
          time: logTime,
          description: `Responder assigned: ${body.assignedTo} (by ${body.username || 'Controller'}).`
        });
      }
    }
    
    // 2. Update Status and milestone logging
    if (body.status) {
      const oldStatus = incident.status;
      incident.status = body.status;
      
      let milestoneLog = `Incident status transitioned from "${oldStatus}" to "${body.status}"`;
      if (body.username) {
        milestoneLog += ` by ${body.username}`;
      }
      
      // Special milestone logs
      if (body.status === 'Live (Acknowledged)') {
        milestoneLog = `Responder ${incident.assignedTo || 'assigned responder'} acknowledged the dispatch.`;
      } else if (body.status === 'Live (On-Site)') {
        milestoneLog = `Responder ${incident.assignedTo || 'assigned responder'} confirmed arrival on-site.`;
      } else if (body.status === 'Live (Completed)') {
        milestoneLog = `Responder ${incident.assignedTo || 'assigned responder'} marked ground activities as completed.`;
        if (body.completionRemarks) {
          incident.completionRemarks = body.completionRemarks;
          milestoneLog += ` Remarks: ${body.completionRemarks}`;
        }
      } else if (body.status === 'Closed') {
        currentCase.status = 'Closed';
        currentCase.closedAt = new Date().toISOString();
        milestoneLog = `Incident approved for closure by ${body.username || 'Duty Manager'}. Record is now read-only.`;
        if (incident.slaveIncidents) {
          incident.slaveIncidents = incident.slaveIncidents.map(s => ({ ...s, status: 'Closed' }));
        }
      } else if (body.status === 'Returned') {
        milestoneLog = `Incident returned to Controller by ${body.username || 'Duty Manager'}.`;
      }
      
      incident.log.push({
        eventNumber: incident.log.length + 1,
        date: logDate,
        time: logTime,
        description: milestoneLog
      });
    }
    
    // 3. Append Custom Event Log entry
    if (body.newLogEntry) {
      incident.log.push({
        eventNumber: incident.log.length + 1,
        date: logDate,
        time: logTime,
        description: body.newLogEntry
      });
    }
    
    // 4. Update general fields
    if (body.emergencyServices) {
      incident.emergencyServices = { ...incident.emergencyServices, ...body.emergencyServices };
    }
    if (body.mediaInvolvement) {
      incident.mediaInvolvement = { ...incident.mediaInvolvement, ...body.mediaInvolvement };
      // If SDC Comms is notified, log it
      if (body.mediaInvolvement.commsNotified) {
        incident.log.push({
          eventNumber: incident.log.length + 1,
          date: logDate,
          time: logTime,
          description: "SDC Communications Team notified regarding media presence."
        });
      }
    }
    if (body.propertyDamage) {
      incident.propertyDamage = { ...incident.propertyDamage, ...body.propertyDamage };
    }
    if (body.vehiclesInvolved) {
      incident.vehiclesInvolved = body.vehiclesInvolved;
    }
    if (body.personalInjuries) {
      incident.personalInjuries = body.personalInjuries;
    }
    if (body.personsInvolved) {
      incident.personsInvolved = body.personsInvolved;
    }
    if (body.cctvBwc) {
      incident.cctvBwc = body.cctvBwc;
    }
    if (body.summary) {
      incident.summary = body.summary;
    }
    if (body.slaveIncidents) {
      incident.slaveIncidents = body.slaveIncidents;
    }
    
    currentCase.incident = incident;
    db.cases[caseIndex] = currentCase;
    saveDb(db);
    
    return NextResponse.json(incident);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
