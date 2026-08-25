import { NextResponse } from 'next/server';
import {
  getMessagingServiceConfig,
  saveMessagingServiceConfigPreservingSecret,
  maskMessagingConfig,
} from '@/lib/crisisStore';

// Messaging Service Settings — build plan Epic 1 story 6.
//
// Credentials are masked on the way out (build plan §6.1, "Credentials masked")
// and preserved on the way in when the admin did not retype them. The client never
// receives the stored API key reference.
export async function GET() {
  try {
    const cfg = await getMessagingServiceConfig();
    return NextResponse.json(maskMessagingConfig(cfg));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Expected a messaging service config object.' }, { status: 400 });
    }
    await saveMessagingServiceConfigPreservingSecret({ ...body, id: 'singleton' });
    const saved = await getMessagingServiceConfig();
    return NextResponse.json({ ok: true, config: maskMessagingConfig(saved) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
