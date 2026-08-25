import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, Fault, generateFaultId, generateCaseId } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const caseId = searchParams.get('caseId');
    const status = searchParams.get('status');
    const faultType = searchParams.get('faultType');

    // List endpoint: skip the base64 attachment blobs (91% of this payload).
    // This db object must NOT be passed to saveDb() — see GetDbOptions in lib/db.
    const db = await getDb({ includeAttachments: false });
    let faults = [...(db.faults || [])];

    if (caseId) {
      faults = faults.filter(f => f.caseId === caseId);
    }
    if (status) {
      faults = faults.filter(f => f.status === status);
    }
    if (faultType) {
      faults = faults.filter(f => f.faultType === faultType);
    }
    if (startDate) {
      const start = new Date(startDate).getTime();
      faults = faults.filter(f => new Date(f.createdAt).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      faults = faults.filter(f => new Date(f.createdAt).getTime() <= end.getTime());
    }

    faults.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      faults,
      stats: {
        total: faults.length,
        pendingSubmission: faults.filter(f => f.status === 'Pending Submission').length,
        closed: faults.filter(f => f.status === 'Closed').length,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { faultType, faultSubType, location, description, attachments, caseId, linkedIncidentId, sourceEDiaryId, username } = body;

    if (!faultType || !faultSubType || !description) {
      return NextResponse.json(
        { error: 'faultType, faultSubType, and description are required' },
        { status: 400 }
      );
    }

    const locationName = location?.commonName || location?.road || location?.building;
    if (!locationName) {
      return NextResponse.json(
        { error: 'location is required — provide at least a common name, road, or building' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const now = new Date().toISOString();

    // Step 1 — resolve or auto-create parent Case
    let parentCaseId = caseId;
    if (!parentCaseId) {
      parentCaseId = generateCaseId(db);
      db.cases.push({
        id: parentCaseId,
        title: `Fault: ${faultType} — ${location?.commonName || 'Sentosa Island'}`,
        status: 'Active',
        createdAt: now,
        createdBy: username || 'system',
        closedAt: null,
        closedBy: null,
        cmmsTickets: [],
        incident: null,
      });
    } else {
      const parentCase = db.cases.find(c => c.id === parentCaseId);
      if (!parentCase) {
        return NextResponse.json({ error: `Case ${parentCaseId} not found` }, { status: 404 });
      }
    }

    // Step 2 — create Fault record (FRD §6.3.1: starts at "Pending Submission")
    const faultId = generateFaultId(db);
    const newFault: Fault = {
      id: faultId,
      caseId: parentCaseId,
      faultType,
      faultSubType,
      location: {
        road: location?.road || '',
        building: location?.building || '',
        levelSpace: location?.levelSpace || '',
        nearAt: location?.nearAt || '',
        commonName: location?.commonName || '',
        postalCode: location?.postalCode || '000000',
        tags: location?.tags || [],
        lat: location?.lat || 1.2500,
        lng: location?.lng || 103.8300,
      },
      description,
      attachments: Array.isArray(attachments) ? attachments : [],
      status: 'Pending Submission',
      createdBy: username || 'system',
      createdAt: now,
      linkedIncidentId: linkedIncidentId || undefined,
      sourceEDiaryId: sourceEDiaryId || undefined,
    };

    if (!db.faults) db.faults = [];
    db.faults.push(newFault);

    await saveDb(db);

    return NextResponse.json({
      fault: newFault,
      caseId: parentCaseId,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
