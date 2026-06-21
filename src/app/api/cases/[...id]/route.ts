import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, Case, Incident, generateIncidentId } from '@/lib/db';
import { tryAutoCloseCase } from '@/lib/autoclose';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const caseId = id.join('/');
    const db = await getDb();
    
    const caseObj = db.cases.find(c => c.id === caseId);
    if (!caseObj) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }
    
    const fault = db.faults?.find(f => f.caseId === caseId);
    const responseData = {
      ...caseObj,
      linkedIncidentId: fault?.linkedIncidentId || undefined
    };
    
    return NextResponse.json(responseData);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const caseId = id.join('/');
    const body = await request.json();
    const db = await getDb();
    
    const caseIndex = db.cases.findIndex(c => c.id === caseId);
    if (caseIndex === -1) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }
    
    let existingCase = db.cases[caseIndex];

    // Closed cases are read-only
    if (existingCase.status === 'Closed') {
      return NextResponse.json({ error: 'Closed cases are read-only and cannot be updated.' }, { status: 400 });
    }
    
    // Update Case Title
    if (body.title !== undefined) {
      const title = String(body.title).replace(/<[^>]*>/g, '').trim();
      if (title.length > 255) {
        return NextResponse.json({ error: 'Case Title exceeds 255 characters limit.' }, { status: 400 });
      }
      existingCase.title = title || 'New Unnamed Case';
    }

    // Manual status transitions (case closure is system-managed and not allowed here)
    if (body.status) {
      const currentStatus = existingCase.status;
      const targetStatus = body.status;

      // Only allow: Pending Triage → Active, No Action Required → Active (admin reactivation)
      const allowed =
        (currentStatus === 'Pending Triage' && targetStatus === 'Active') ||
        (currentStatus === 'No Action Required' && targetStatus === 'Active');

      if (!allowed) {
        return NextResponse.json({
          error: `Manual status change from "${currentStatus}" to "${targetStatus}" is not permitted. Case closure is managed automatically by the system.`
        }, { status: 400 });
      }

      // Reactivation — clear closure metadata
      if (targetStatus === 'Active') {
        existingCase.closedAt = null;
        existingCase.closedBy = null;
      }

      existingCase.status = targetStatus;
    }

    // Attach Incident Report if requested
    if (body.incident) {
      const incidentData = body.incident;
      const incidentId = generateIncidentId(db);
      const newIncident: Incident = {
        id: incidentId,
        caseId: caseId,
        title: existingCase.title,
        dateTime: incidentData.dateTime || new Date().toISOString(),
        type: incidentData.type || 'Others',
        subType: incidentData.subType || 'Others',
        priority: incidentData.priority || 'Normal',
        crisisLevel: 4,
        reporterName: incidentData.reporterName || 'Unknown',
        requestedBy: incidentData.requestedBy || 'IIOC Controller',
        createdBy: body.username || 'admin',
        category: incidentData.category || 'Standard Incident',
        status: incidentData.status || 'Live',
        assignedTo: Array.isArray(incidentData.assignedTo)
          ? incidentData.assignedTo
          : (incidentData.assignedTo ? [incidentData.assignedTo] : []),
        location: {
          road: incidentData.location?.road || '',
          building: incidentData.location?.building || '',
          levelSpace: incidentData.location?.levelSpace || '',
          nearAt: incidentData.location?.nearAt || '',
          commonName: incidentData.location?.commonName || '',
          postalCode: incidentData.location?.postalCode || '000000',
          tags: incidentData.location?.tags || [],
          lat: incidentData.location?.lat || 1.2500,
          lng: incidentData.location?.lng || 103.8300
        },
        log: [
          {
            eventNumber: 1,
            date: new Date().toISOString().split('T')[0],
            time: new Date().toLocaleTimeString('en-US', { hour12: false }),
            description: `Incident logged under ID ${incidentId} (Case ID ${caseId}). Classification: ${incidentData.type} - ${incidentData.subType}.`
          }
        ],
        emergencyServices: {
          policeAtScene: false, officerNameRank: '', policeIncidentNo: '', classification: '', respondingUnit: '',
          ambulanceScdfType: '', ambulanceOfficerName: '', ambulanceCallSign: '', ambulanceRespondingUnit: '', ambulanceArrivalTime: '', hospitalConveyedTo: ''
        },
        mediaInvolvement: { mediaAtScene: false, mediaName: '', commsNotified: false },
        propertyDamage: { sdcPropertyDamaged: false, description: '' },
        vehiclesInvolved: [],
        personalInjuries: [],
        personsInvolved: [],
        cctvBwc: [],
        summary: incidentData.summary || '',
        completionRemarks: '',
        slaveIncidents: []
      };
      existingCase.incident = newIncident;
      // Escalates status to Active on child creation
      if (existingCase.status === 'Pending Triage') {
        existingCase.status = 'Active';
      }
    }

    // Link CMMS Ticket ID — receipt of ID means CMMS has accepted the job (system-closed)
    if (body.cmmsTicketId) {
      if (!existingCase.cmmsTickets.includes(body.cmmsTicketId)) {
        existingCase.cmmsTickets.push(body.cmmsTicketId);
        if (existingCase.status === 'Pending Triage') {
          existingCase.status = 'Active';
        }
      }
      db.cases[caseIndex] = existingCase;
      tryAutoCloseCase(db, caseId);
      existingCase = db.cases[caseIndex];
    }
    
    db.cases[caseIndex] = existingCase;
    await saveDb(db);
    
    return NextResponse.json(existingCase);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
