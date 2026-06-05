import { NextResponse } from 'next/server';
import { getDb, saveDb, Case } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const caseId = id.join('/');
    const db = getDb();
    
    const caseObj = db.cases.find(c => c.id === caseId);
    if (!caseObj) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }
    
    return NextResponse.json(caseObj);
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
    const db = getDb();
    
    const caseIndex = db.cases.findIndex(c => c.id === caseId);
    if (caseIndex === -1) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }
    
    const existingCase = db.cases[caseIndex];
    
    // Update Case status
    if (body.status) {
      existingCase.status = body.status;
      if (body.status === 'Closed') {
        existingCase.closedAt = new Date().toISOString();
        if (existingCase.incident) {
          existingCase.incident.status = 'Closed';
        }
      }
    }

    // Link CMMS Ticket ID
    if (body.cmmsTicketId) {
      if (!existingCase.cmmsTickets.includes(body.cmmsTicketId)) {
        existingCase.cmmsTickets.push(body.cmmsTicketId);
      }
    }
    
    db.cases[caseIndex] = existingCase;
    saveDb(db);
    
    return NextResponse.json(existingCase);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
