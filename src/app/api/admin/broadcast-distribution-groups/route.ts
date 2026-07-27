import { NextResponse } from 'next/server';
import { getBroadcastDistributionGroups, saveBroadcastDistributionGroups } from '@/lib/broadcastStore';

// Broadcast-only Distribution Groups (2026-07-27, Kyle — confirmed with client).
// Deliberately separate from /api/admin/distribution-groups, which now serves the
// Task module ("Task Distribution Groups") only. See DEFAULT_BROADCAST_DISTRIBUTION_GROUPS
// in src/lib/broadcastConfig.ts for the full rationale.
export async function GET() {
  try {
    return NextResponse.json(await getBroadcastDistributionGroups());
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
    await saveBroadcastDistributionGroups(groups);
    return NextResponse.json({ ok: true, count: groups.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
