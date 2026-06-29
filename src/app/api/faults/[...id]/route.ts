import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';
import { tryAutoCloseCase } from '@/lib/autoclose';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const faultId = id.join('/');
    const db = await getDb();
    const fault = (db.faults || []).find(f => f.id === faultId);
    if (!fault) {
      return NextResponse.json({ error: 'Fault not found' }, { status: 404 });
    }
    return NextResponse.json(fault);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const faultId = id.join('/');
    const body = await request.json();
    const db = await getDb();

    const idx = (db.faults || []).findIndex(f => f.id === faultId);
    if (idx === -1) {
      return NextResponse.json({ error: 'Fault not found' }, { status: 404 });
    }

    const fault = db.faults![idx];
    const now = new Date().toISOString();

    // action: "submit" — FRD §6.3.1: Pending Submission → Closed (on CMMS Fault ID receipt)
    if (body.action === 'submit') {
      if (fault.status !== 'Pending Submission') {
        return NextResponse.json(
          { error: `Cannot submit fault in status "${fault.status}" — only "Pending Submission" faults can be submitted` },
          { status: 400 }
        );
      }

      fault.submittedAt = now;
      db.faults![idx] = fault;
      await saveDb(db);

      // Call CMMS API — on success, auto-close (FRD §6.3.1)
      let cmmsTicketId: string | undefined;
      let cmmsAssignedTo: string | undefined;
      try {
        const cmmsRes = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/cmms-mock`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              faultId,
              caseId: fault.caseId,
              faultType: fault.faultType,
              faultSubType: fault.faultSubType,
              location: fault.location?.commonName || 'Sentosa Island',
              description: fault.description,
            }),
          }
        );
        if (cmmsRes.ok) {
          const cmmsData = await cmmsRes.json();
          cmmsTicketId = cmmsData.ticketId;
          cmmsAssignedTo = cmmsData.assignedTo;
        }
      } catch (_) {
        // CMMS unreachable — fault stays at "Pending Submission", submittedAt recorded
      }

      // Auto-close on receipt of CMMS Fault ID (FRD §6.3.1, §6.5)
      if (cmmsTicketId) {
        fault.cmmsTicketId = cmmsTicketId;
        fault.status = 'Closed';
        fault.closedAt = now;
        fault.closedBy = 'system';

        const caseIdx = db.cases.findIndex(c => c.id === fault.caseId);
        if (caseIdx !== -1 && !db.cases[caseIdx].cmmsTickets.includes(cmmsTicketId)) {
          db.cases[caseIdx].cmmsTickets.push(cmmsTicketId);
        }

        db.faults![idx] = fault;
        tryAutoCloseCase(db, fault.caseId);
        await saveDb(db);
      }

      return NextResponse.json({ fault, cmmsTicketId, cmmsAssignedTo });
    }

    // Manual field updates (fallback)
    if (body.status !== undefined) fault.status = body.status;
    if (body.cmmsTicketId !== undefined) fault.cmmsTicketId = body.cmmsTicketId;
    if (body.submittedAt !== undefined) fault.submittedAt = body.submittedAt;
    if (body.closedAt !== undefined) fault.closedAt = body.closedAt;
    if (body.closedBy !== undefined) fault.closedBy = body.closedBy;

    db.faults![idx] = fault;
    await saveDb(db);

    return NextResponse.json(fault);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
