import { NextResponse } from 'next/server';
import { getDistributionGroups, saveDistributionGroups } from '@/lib/broadcastStore';

// FSD §10.3 / §13.3 — server-backed Distribution Groups (replaces localStorage).
export async function GET() {
  try {
    return NextResponse.json(await getDistributionGroups());
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const groups = Array.isArray(body) ? body : body.groups;
    if (!Array.isArray(groups)) {
      return NextResponse.json({ error: 'Expected an array of distribution groups.' }, { status: 400 });
    }
    await saveDistributionGroups(groups);
    return NextResponse.json({ ok: true, count: groups.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
