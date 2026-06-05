import { NextResponse } from 'next/server';
import { getDb, saveDb, generateCaseId, Case, Incident } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    // Sort cases by creation date descending
    const sortedCases = [...db.cases].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return NextResponse.json(sortedCases);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = getDb();
    
    const caseId = generateCaseId(db);
    const title = body.title || 'New Unnamed Case';
    
    // Create new Case structure
    const newCase: Case = {
      id: caseId,
      title: title,
      status: body.status || 'Active',
      createdAt: new Date().toISOString(),
      closedAt: null,
      cmmsTickets: [],
      incident: null
    };

    // If incident details are provided, instantiate an Incident object
    if (body.incident) {
      const incidentData = body.incident;
      
      const newIncident: Incident = {
        caseId: caseId,
        title: title,
        dateTime: incidentData.dateTime || new Date().toISOString(),
        type: incidentData.type || 'Others',
        subType: incidentData.subType || 'Others',
        priority: incidentData.priority || 'Medium',
        reporterName: incidentData.reporterName || 'Unknown',
        requestedBy: incidentData.requestedBy || 'IIOC Controller',
        createdBy: body.username || 'admin',
        status: incidentData.status || 'Live',
        assignedTo: incidentData.assignedTo || '',
        location: {
          road: incidentData.location?.road || '',
          building: incidentData.location?.building || '',
          levelSpace: incidentData.location?.levelSpace || '',
          nearAt: incidentData.location?.nearAt || '',
          commonName: incidentData.location?.commonName || '',
          postalCode: incidentData.location?.postalCode || '000000',
          tags: incidentData.location?.tags || [],
          lat: incidentData.location?.lat || 1.2500, // default Sentosa coords
          lng: incidentData.location?.lng || 103.8300
        },
        log: [
          {
            eventNumber: 1,
            date: new Date().toISOString().split('T')[0],
            time: new Date().toLocaleTimeString('en-US', { hour12: false }),
            description: `Incident logged under Case ID ${caseId}. Classification: ${incidentData.type} - ${incidentData.subType}.`
          }
        ],
        emergencyServices: {
          policeAtScene: incidentData.emergencyServices?.policeAtScene || false,
          officerNameRank: incidentData.emergencyServices?.officerNameRank || '',
          policeIncidentNo: incidentData.emergencyServices?.policeIncidentNo || '',
          classification: incidentData.emergencyServices?.classification || '',
          respondingUnit: incidentData.emergencyServices?.respondingUnit || '',
          ambulanceScdfType: incidentData.emergencyServices?.ambulanceScdfType || '',
          ambulanceOfficerName: incidentData.emergencyServices?.ambulanceOfficerName || '',
          ambulanceCallSign: incidentData.emergencyServices?.ambulanceCallSign || '',
          ambulanceRespondingUnit: incidentData.emergencyServices?.ambulanceRespondingUnit || '',
          ambulanceArrivalTime: incidentData.emergencyServices?.ambulanceArrivalTime || '',
          hospitalConveyedTo: incidentData.emergencyServices?.hospitalConveyedTo || ''
        },
        mediaInvolvement: {
          mediaAtScene: incidentData.mediaInvolvement?.mediaAtScene || false,
          mediaName: incidentData.mediaInvolvement?.mediaName || '',
          commsNotified: incidentData.mediaInvolvement?.commsNotified || false
        },
        propertyDamage: {
          sdcPropertyDamaged: incidentData.propertyDamage?.sdcPropertyDamaged || false,
          description: incidentData.propertyDamage?.description || ''
        },
        vehiclesInvolved: incidentData.vehiclesInvolved || [],
        personalInjuries: incidentData.personalInjuries || [],
        personsInvolved: incidentData.personsInvolved || [],
        cctvBwc: incidentData.cctvBwc || [],
        summary: incidentData.summary || '',
        completionRemarks: ''
      };
      
      newCase.incident = newIncident;
    }

    db.cases.push(newCase);
    saveDb(db);

    return NextResponse.json(newCase, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
