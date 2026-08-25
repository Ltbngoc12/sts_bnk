// In-memory mock of the external IFM CMMS ticket registry (prototype only).
// Shared by /api/cmms-mock (external-facing mock endpoint) and the faults
// submit flow, which calls createCmmsTicket() directly rather than making a
// self-referential HTTP request back into this same server.

const CONTRACTORS = [
  'Wilson Fire Services',
  'KES Building Services',
  'Premas Facilities Mgmt',
  'Certis Facilities',
];
export const CMMS_STATUSES = ['Open', 'Assigned', 'In Progress', 'Pending Materials', 'Completed', 'Closed'];

export type CmmsTicket = {
  ticketId: string;
  location: string;
  description: string;
  severity: string;
  status: string;
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
};

export const ticketRegistry = new Map<string, CmmsTicket>();

export async function createCmmsTicket(input: { location: string; description: string; severity?: string }): Promise<CmmsTicket> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const randNum = Math.floor(10000 + Math.random() * 90000);
  const ticketId = `CMMS-${dateStr}-${randNum}`;
  const contractor = CONTRACTORS[Math.floor(Math.random() * CONTRACTORS.length)];

  const ticket: CmmsTicket = {
    ticketId,
    location: input.location,
    description: input.description,
    severity: input.severity || 'Medium',
    status: 'Open',
    assignedTo: contractor,
    createdAt: today.toISOString(),
    updatedAt: today.toISOString(),
  };

  // Simulate integration latency
  await new Promise(resolve => setTimeout(resolve, 600));

  ticketRegistry.set(ticketId, ticket);
  return ticket;
}
