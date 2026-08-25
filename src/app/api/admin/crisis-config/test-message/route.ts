import { NextResponse } from 'next/server';
import { getMessagingServiceConfig, getRecallTemplates } from '@/lib/crisisStore';
import { renderPlaceholders, isValidSgMobile, normalizeMobile, senderIdIsAlphanumeric } from '@/lib/crisisConfig';

// Send test message — build plan Epic 1 story 7.
//
// Routes through the existing /api/sms-mock prototype gateway. When a real
// provider is selected (blocked on the Shin Feng / IT dependency in build plan
// §9), this is the single place that swaps to a live client — the admin UI does
// not change.
//
// Guard rails, in order of how badly each would go wrong unnoticed:
//  1. A test SMS must never reach a real member's handset. Only an explicitly
//     typed number is accepted; there is no "send to group" option here.
//  2. Simulation mode restricts sending to the configured test numbers. This is
//     the §10 Testability requirement — crisis features are otherwise untestable
//     outside a real incident, and the failure mode of getting it wrong is
//     recalling live responders for a config check.
//  3. An alphanumeric sender ID cannot receive replies (Appendix A note 1), so a
//     keyword-ack test against one will look like it worked and silently drop
//     every response. Warned, not blocked.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phoneNumber, templateId, message } = body || {};

    if (!phoneNumber) {
      return NextResponse.json({ error: 'A test mobile number is required.' }, { status: 400 });
    }

    const cfg = await getMessagingServiceConfig();
    const warnings: string[] = [];

    const normalized = normalizeMobile(phoneNumber);
    if (!isValidSgMobile(normalized)) {
      warnings.push('Test number is not a valid Singapore mobile (+65 8xxxxxxx / 9xxxxxxx).');
    }

    // Guard 2 — simulation mode allowlist.
    if (cfg.simulationMode) {
      const allow = (cfg.testNumbers || '')
        .split(/[,\n;]/)
        .map((n) => normalizeMobile(n.trim()))
        .filter(Boolean);
      if (allow.length === 0) {
        return NextResponse.json(
          {
            error:
              'Simulation mode is on but no test numbers are configured. Add at least one test number before sending, or turn simulation mode off (not recommended until a provider is selected).',
          },
          { status: 400 }
        );
      }
      if (!allow.includes(normalized)) {
        return NextResponse.json(
          {
            error: `Simulation mode is on — ${normalized} is not in the configured test numbers. Add it to the allowlist first.`,
          },
          { status: 400 }
        );
      }
    } else {
      warnings.push(
        'Simulation mode is OFF. This message would be sent to a live handset once a real provider is configured.'
      );
    }

    // Guard 3 — send-only sender ID.
    if (senderIdIsAlphanumeric(cfg.senderId)) {
      warnings.push(
        `Sender ID "${cfg.senderId}" is alphanumeric and cannot receive inbound SMS. Reply-keyword acknowledgement will not work with this sender ID — a two-way long/short code is required (build plan §9, blocked on Shin Feng).`
      );
    }

    if (cfg.provider === 'Not selected') {
      warnings.push('No SMS provider is selected. This test used the prototype mock gateway, not a real provider.');
    }

    let content = message || '';
    if (templateId) {
      const templates = await getRecallTemplates();
      const tpl = templates.find((t) => t.id === templateId);
      if (!tpl) {
        return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
      }
      content = renderPlaceholders(tpl.body);
    }
    if (!content.trim()) {
      return NextResponse.json({ error: 'Nothing to send — pick a template or type a message.' }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const res = await fetch(`${origin}/api/sms-mock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: 'Crisis config test',
        phoneNumber: normalized,
        message: content,
      }),
    });
    const sms = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: sms.error || 'Mock gateway rejected the message.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, sent: content, to: normalized, sms, warnings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
