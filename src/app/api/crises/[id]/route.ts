import { NextResponse } from 'next/server';
import {
  getCrisis,
  getCrisisRecipients,
  getCrisisDispatches,
  getCrisisAudit,
  claimCrisis,
  addCrisisMember,
  removeCrisisMember,
  dispatchCrisis,
  cancelCrisis,
  markContacted,
  resendToRecipient,
  evaluateEscalation,
  standDownCrisis,
  closeCrisis,
  recordDelivery,
} from '@/lib/crisisRuntime';
import { getRecallTemplates, getAckEscalationRule } from '@/lib/crisisStore';
import { renderPlaceholders } from '@/lib/crisisConfig';
import { hasCrisisPermission } from '@/lib/permissions';
import { computeCounters, medianAckSeconds, activeMembers } from '@/lib/crisis';

// Single crisis — read model for the Review screen and the Live Dashboard, plus
// every state-changing action (stories 13–16, 19–26).
//
// Permission enforcement uses hasCrisisPermission() with a permission CODE, never
// a role string comparison — see the Q1 note in src/lib/permissions.ts. There is
// no auth/session yet, so the acting role arrives in the request body (the same
// mock-identity approach the Broadcast module uses).

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const crisis = await getCrisis(id);
    if (!crisis) return NextResponse.json({ error: 'Crisis not found.' }, { status: 404 });

    const [recipients, dispatches, audit, templates, ackRule] = await Promise.all([
      getCrisisRecipients(id),
      getCrisisDispatches(id),
      getCrisisAudit(id),
      getRecallTemplates(),
      getAckEscalationRule(),
    ]);

    // Fully rendered preview (build plan §6.3) — the DM must see exactly what the
    // recipient will read, never the template with unresolved placeholders.
    const template = templates.find((t) => t.id === crisis.templateId) || templates.find((t) => t.channel === 'SMS' && t.status === 'Active');
    const preview = template
      ? renderPlaceholders(template.body, {
          '{{crisis_level}}': `L${crisis.crisisLevel}`,
          '{{incident_type}}': crisis.incidentType,
          '{{location}}': crisis.locationSummary,
          '{{reporting_point}}': 'Command Centre L1',
          '{{incident_no}}': crisis.sourceIncidentId,
          '{{recipient_name}}': '<recipient>',
          '{{ack_link}}': `${new URL(request.url).origin}/ack/<token>`,
          '{{dispatched_at}}': new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        })
      : '';

    return NextResponse.json({
      crisis,
      recipients,
      dispatches,
      audit,
      preview,
      templateName: template?.name || null,
      counters: computeCounters(recipients),
      medianAckSeconds: medianAckSeconds(recipients),
      ackWindowMinutes: ackRule.ackWindowMinutes,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, actor = 'Unknown', role } = body;
    const origin = new URL(request.url).origin;

    const deny = (code: any, what: string) =>
      role && !hasCrisisPermission(role, code)
        ? NextResponse.json({ error: `Your role (${role}) cannot ${what}.` }, { status: 403 })
        : null;

    switch (action) {
      // Soft claim (build plan §10 concurrency (b)). Deliberately not a hard lock —
      // a DM who walks away must never be able to block a crisis dispatch.
      case 'claim':
        return NextResponse.json({ ok: true, crisis: await claimCrisis(id, actor, !!body.takeOver) });

      case 'add-member': {
        // FSD §11.5.e. Q1 unresolved — enforced by permission code so the answer
        // changes one line in permissions.ts, not this route.
        const d = deny('crisis.members_edit', 'edit members on an active crisis');
        if (d) return d;
        if (!body.name?.trim()) return NextResponse.json({ error: 'Member name is required.' }, { status: 400 });
        return NextResponse.json({ ok: true, crisis: await addCrisisMember(id, actor, body) });
      }

      case 'remove-member': {
        const d = deny('crisis.members_edit', 'edit members on an active crisis');
        if (d) return d;
        return NextResponse.json({ ok: true, crisis: await removeCrisisMember(id, actor, body.memberId, body.reason || '') });
      }

      case 'dispatch': {
        const d = deny('crisis.dispatch', 'dispatch a crisis recall');
        if (d) return d;
        const result = await dispatchCrisis(id, actor, origin);
        return NextResponse.json({ ok: true, ...result });
      }

      case 'cancel': {
        const d = deny('crisis.dispatch', 'cancel a crisis');
        if (d) return d;
        return NextResponse.json({ ok: true, crisis: await cancelCrisis(id, actor, body.reason || '') });
      }

      case 'mark-contacted': {
        const d = deny('crisis.contact', 'mark a recipient as contacted');
        if (d) return d;
        await markContacted(body.recipientId, actor);
        return NextResponse.json({ ok: true });
      }

      case 'resend': {
        const d = deny('crisis.contact', 're-send a crisis message');
        if (d) return d;
        await resendToRecipient(body.recipientId, actor, origin);
        return NextResponse.json({ ok: true });
      }

      // Simulates the provider's delivery receipt. In production this is a separate
      // signature-verified webhook endpoint (build plan §10, Webhook security) —
      // it lives here only because the prototype gateway has no callback.
      case 'simulate-delivery': {
        await recordDelivery(body.recipientId, body.status === 'FAILED' ? 'FAILED' : 'DELIVERED', body.reason);
        return NextResponse.json({ ok: true });
      }

      // Lazy escalation tick, called by the dashboard poll. See the comment on
      // evaluateEscalation() — this is a documented stand-in for a real scheduler.
      case 'tick':
        return NextResponse.json({ ok: true, ...(await evaluateEscalation(id, origin)) });

      case 'stand-down': {
        const d = deny('crisis.close', 'stand down a crisis');
        if (d) return d;
        const crisis = await standDownCrisis(id, actor, body.reason || 'Resolved', body.notes || '', !!body.sendMessage, origin);
        return NextResponse.json({ ok: true, crisis });
      }

      case 'close': {
        const d = deny('crisis.close', 'close a crisis');
        if (d) return d;
        return NextResponse.json({ ok: true, crisis: await closeCrisis(id, actor) });
      }

      default:
        return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
    }
  } catch (error: any) {
    // Illegal state transitions land here — e.g. a second Dispatch click arriving
    // after the first already moved the crisis out of PENDING_REVIEW. That is the
    // idempotency guard doing its job, so it is a 409, not a 500.
    const msg = error.message || 'Unexpected error';
    const status = /Illegal crisis transition/.test(msg) ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
