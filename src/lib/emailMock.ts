// Mock Email gateway — FSD §10.1a/§10.2, Phase 5 stretch item.
//
// Mirrors src/app/api/sms-mock/route.ts's in-memory Queued→Sent→Delivered→Failed
// lifecycle and latency simulation, but as a plain library module (not a route)
// so both the /api/email-mock route (for direct testing/inspection) and the
// broadcast dispatch endpoints can call it synchronously in the same request
// without a self-fetch. Swap this module's internals for a real SMTP client
// later without touching any call site (§13 risk register).

export interface EmailRecord {
  emailId: string;
  to: string;
  subject: string;
  body: string;
  status: 'Queued' | 'Sent' | 'Delivered' | 'Failed';
  sentAt: string;
  deliveredAt?: string;
  caseId?: string;
  broadcastId?: string;
}

const emailQueue: EmailRecord[] = [];
let emailCounter = 1;

// Dispatch one email. Resolves once "sent" (fire-and-forget "delivered" follows
// shortly after, same latency simulation as sms-mock).
export async function sendEmailMock(input: {
  to: string;
  subject: string;
  body: string;
  caseId?: string;
  broadcastId?: string;
}): Promise<EmailRecord> {
  const { to, subject, body, caseId, broadcastId } = input;
  const emailId = `EML-${String(emailCounter++).padStart(4, '0')}`;
  const sentAt = new Date().toISOString();

  const record: EmailRecord = { emailId, to, subject, body, status: 'Queued', sentAt, caseId, broadcastId };
  emailQueue.push(record);

  // Simulate SMTP handoff latency, then mark Sent.
  await new Promise((resolve) => setTimeout(resolve, 150));
  record.status = 'Sent';

  // Simulate delivery acknowledgement shortly after (fire-and-forget).
  setTimeout(() => {
    record.status = 'Delivered';
    record.deliveredAt = new Date().toISOString();
  }, 800);

  return record;
}

// Dispatch the same subject/body to a list of recipients; returns the individual
// records so callers can compute delivery counts.
export async function sendEmailMockBatch(input: {
  recipients: string[];
  subject: string;
  body: string;
  caseId?: string;
  broadcastId?: string;
}): Promise<EmailRecord[]> {
  const { recipients, subject, body, caseId, broadcastId } = input;
  return Promise.all(
    recipients.map((to) => sendEmailMock({ to, subject, body, caseId, broadcastId }))
  );
}

export function getEmailQueue(filter?: { caseId?: string; broadcastId?: string; emailId?: string }): EmailRecord[] {
  if (!filter) return emailQueue;
  return emailQueue.filter(
    (r) =>
      (!filter.emailId || r.emailId === filter.emailId) &&
      (!filter.caseId || r.caseId === filter.caseId) &&
      (!filter.broadcastId || r.broadcastId === filter.broadcastId)
  );
}
