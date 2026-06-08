import { NextResponse } from 'next/server';

const CONTRACTORS = [
  'Wilson Fire Services',
  'KES Building Services',
  'Premas Facilities Mgmt',
  'Certis Facilities',
];
const CMMS_STATUSES = ['Open', 'Assigned', 'In Progress', 'Pending Materials', 'Completed', 'Closed'];

// Simulates the external IFM CMMS ticket registry (in-memory for prototype)
type CmmsTicket = {
  ticketId: string;
  location: string;
  description: string;
  severity: string;
  status: string;
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
};
const ticketRegistry = new Map<string, CmmsTicket>();

/** POST /api/cmms-mock  — Create a new CMMS work order ticket */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.location || !body.description) {
      return NextResponse.json({ error: 'location and description are required' }, { status: 400 });
    }

    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const randNum = Math.floor(10000 + Math.random() * 90000);
    const ticketId = `CMMS-${dateStr}-${randNum}`;
    const contractor = CONTRACTORS[Math.floor(Math.random() * CONTRACTORS.length)];

    const ticket: CmmsTicket = {
      ticketId,
      location: body.location,
      description: body.description,
      severity: body.severity || 'Medium',
      status: 'Open',
      assignedTo: contractor,
      createdAt: today.toISOString(),
      updatedAt: today.toISOString(),
    };

    // Simulate 600ms integration latency
    await new Promise(resolve => setTimeout(resolve, 600));

    ticketRegistry.set(ticketId, ticket);

    return NextResponse.json({
      success: true,
      ticketId,
      assignedTo: contractor,
      status: 'Open',
      message: `CMMS ticket raised for [${body.location}]. Assigned to: ${contractor}.`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET /api/cmms-mock?ticketId=CMMS-... — Retrieve CMMS ticket status */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticketId = searchParams.get('ticketId');

    if (!ticketId) {
      return NextResponse.json(Array.from(ticketRegistry.values()));
    }

    const ticket = ticketRegistry.get(ticketId);
    if (!ticket) {
      return NextResponse.json({ error: `Ticket ${ticketId} not found in this session` }, { status: 404 });
    }

    return NextResponse.json(ticket);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PATCH /api/cmms-mock — Simulate CMMS callback updating ticket status */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { ticketId, status } = body;

    if (!ticketId || !status) {
      return NextResponse.json({ error: 'ticketId and status are required' }, { status: 400 });
    }
    if (!CMMS_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${CMMS_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const ticket = ticketRegistry.get(ticketId);
    const now = new Date().toISOString();

    if (!ticket) {
      // Accept update for externally-created tickets
      ticketRegistry.set(ticketId, {
        ticketId, location: 'Unknown', description: 'External ticket',
        severity: 'Medium', status, assignedTo: 'External Contractor',
        createdAt: now, updatedAt: now,
      });
    } else {
      ticket.status = status;
      ticket.updatedAt = now;
    }

    return NextResponse.json({ success: true, ticketId, status, updatedAt: now });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
