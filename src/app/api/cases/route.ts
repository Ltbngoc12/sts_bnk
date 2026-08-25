import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, generateCaseId, generateIncidentId, Case, Incident } from '@/lib/db';
import { normalizeIncidentCategory } from '@/lib/incidentCategory';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const search = searchParams.get('search') || '';
    
    // Filters
    const statuses = searchParams.get('status') ? searchParams.get('status')!.split(',') : [];
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const createdBy = searchParams.get('createdBy');
    
    // Linked Record Presence Filters
    const hasIncident = searchParams.get('hasIncident') === 'true';
    const hasTasks = searchParams.get('hasTasks') === 'true';
    const hasFaults = searchParams.get('hasFaults') === 'true';
    const hasEDiary = searchParams.get('hasEDiary') === 'true';

    // List endpoint: skip the base64 attachment blobs (91% of this payload).
    // This db object must NOT be passed to saveDb() — see GetDbOptions in lib/db.
    const db = await getDb({ includeAttachments: false });
    let cases = [...db.cases];

    // 1. Text Search Filter (Case ID or Case Title)
    if (search) {
      const lowerSearch = search.toLowerCase();
      cases = cases.filter(c => 
        c.id.toLowerCase().includes(lowerSearch) || 
        c.title.toLowerCase().includes(lowerSearch)
      );
    }

    // 2. Date Range Filter
    if (startDate) {
      const start = new Date(startDate).getTime();
      cases = cases.filter(c => new Date(c.createdAt).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(endDate).getTime();
      cases = cases.filter(c => new Date(c.createdAt).getTime() <= end);
    }

    // 3. Creator Filter
    if (createdBy) {
      cases = cases.filter(c => c.createdBy.toLowerCase() === createdBy.toLowerCase());
    }

    // 4. Linked Record Filters
    if (hasIncident) {
      cases = cases.filter(c => c.incident !== null);
    }
    if (hasTasks) {
      cases = cases.filter(c => db.tasks.some(t => t.caseId === c.id));
    }
    if (hasFaults) {
      cases = cases.filter(c => db.faults?.some(f => f.caseId === c.id) || (c.cmmsTickets && c.cmmsTickets.length > 0));
    }
    if (hasEDiary) {
      cases = cases.filter(c => db.occurrences.some(o => o.caseId === c.id));
    }

    // Calculate dynamic stats before status filter is applied
    const allCount = cases.length;
    const activeCount = cases.filter(c => c.status !== 'Closed').length;

    // 5. Status Filter
    if (statuses.length > 0) {
      cases = cases.filter(c => statuses.includes(c.status));
    }

    // 6. Sorting
    cases.sort((a: any, b: any) => {
      let valA = a[sortBy];
      let valB = b[sortBy];

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (sortBy === 'createdAt' || sortBy === 'closedAt') {
        const timeA = valA ? new Date(valA).getTime() : 0;
        const timeB = valB ? new Date(valB).getTime() : 0;
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      }

      if (typeof valA === 'string') {
        return sortOrder === 'asc' 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      }

      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    const mapCaseCounts = (c: Case) => {
      const taskCount = db.tasks.filter(t => t.caseId === c.id).length;
      const occurrenceCount = db.occurrences.filter(o => o.caseId === c.id).length;
      const faultCount = db.faults?.filter(f => f.caseId === c.id).length || c.cmmsTickets?.length || 0;
      return {
        ...c,
        taskCount,
        occurrenceCount,
        faultCount
      };
    };

    // 7. Pagination
    if (!searchParams.has('page')) {
      return NextResponse.json(cases.map(mapCaseCounts));
    }

    const totalItems = cases.length;
    const startIndex = (page - 1) * limit;
    const paginatedCases = cases.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      data: paginatedCases.map(mapCaseCounts),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit)
      },
      stats: {
        total: allCount,
        active: activeCount,
        triage: cases.filter(c => c.status === 'Pending Triage').length,
        closed: cases.filter(c => c.status === 'Closed').length
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = await getDb();

    // Title Validation (sanitize and enforce length limit of 255)
    let title = body.title ? String(body.title).replace(/<[^>]*>/g, '').trim() : '';
    if (title.length > 255) {
      return NextResponse.json({ error: 'Case Title exceeds 255 characters limit.' }, { status: 400 });
    }
    if (!title) {
      title = body.incident ? `Incident: ${body.incident.title || 'New Incident'}` : 'New Unnamed Case';
    }
    
    const caseId = generateCaseId(db);
    
    // Create new Case structure
    const newCase: Case = {
      id: caseId,
      title: title,
      status: body.status || 'Pending Triage',
      createdAt: new Date().toISOString(),
      closedAt: null,
      closedBy: null,
      createdBy: body.username || 'admin',
      cmmsTickets: [],
      incident: null
    };

    // Transaction-like Wrapper with Rollback Logic
    try {
      // If incident details are provided, instantiate an Incident object
      if (body.incident) {
        // Escalates status to Active on child creation
        newCase.status = 'Active';
        const incidentData = body.incident;
        
        if (!incidentData.type || !incidentData.subType) {
          throw new Error('Incident Type and Sub-type are mandatory.');
        }
        
        const incidentId = generateIncidentId(db);
        const incidentDateTime = incidentData.dateTime || new Date().toISOString();
        // FSD §5.2: Crisis Level 45-minute reminder fires 45 min from incident dateTime
        const crisisReminderDue = new Date(new Date(incidentDateTime).getTime() + 45 * 60 * 1000).toISOString();
        const newIncident: Incident = {
          id: incidentId,
          caseId: caseId,
          title: title,
          dateTime: incidentDateTime,
          type: incidentData.type || 'Others',
          subType: incidentData.subType || 'Others',
          priority: incidentData.priority || 'Normal',
          // Was hardcoded to 4, silently discarding whatever crisis level the
          // Controller picked on the new-incident form. That made every incident a
          // Level 4 regardless of what was entered — which also meant the crisis
          // recall trigger (FSD §11.5, Level 1–2) could never fire from creation.
          crisisLevel: incidentData.crisisLevel !== undefined ? parseInt(String(incidentData.crisisLevel), 10) : 4,
          reporterName: incidentData.reporterName || 'Unknown',
          requestedBy: incidentData.requestedBy || 'IIOC Controller',
          reportingSource: incidentData.reportingSource || '',
          createdBy: body.username || 'admin',
          category: normalizeIncidentCategory(incidentData.category),
          crisisReminderDue,
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
          completionRemarks: '',
          slaveIncidents: []
        };
        
        newCase.incident = newIncident;
      }

      db.cases.push(newCase);
      await saveDb(db); // Commit transaction

      // ── Crisis trigger hook (Crisis build plan Epic 2, story 9) ──
      // Must run on CREATION, not only on update: an incident reported straight in
      // at Level 1–2 is exactly the case the emergency recall exists for, and it is
      // the most severe one. Hooking only the edit path would mean the worst
      // incidents — the ones logged correctly first time — never raise a recall.
      //
      // Non-fatal by design: a crisis-module failure must never stop an incident
      // from being created. The incident is the system of record.
      if (newCase.incident) {
        try {
          const { evaluateCrisisTrigger } = await import('@/lib/crisisRuntime');
          await evaluateCrisisTrigger(newCase.incident, body.username || 'System');
        } catch (crisisErr) {
          console.error('Crisis trigger evaluation failed (case created regardless):', crisisErr);
        }
      }

      return NextResponse.json(newCase, { status: 201 });
    } catch (validationError: any) {
      // Rollback: do not save db.
      return NextResponse.json({ error: validationError.message }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
