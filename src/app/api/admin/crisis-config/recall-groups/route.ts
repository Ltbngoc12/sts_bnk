import { NextResponse } from 'next/server';
import { getRecallGroups, saveRecallGroups } from '@/lib/crisisStore';

// Recall Groups — FSD §11.5, build plan Epic 1 stories 1 and 2.
//
// SEPARATE from /api/admin/broadcast-distribution-groups and from
// /api/admin/distribution-groups. FSD §11.5.d makes recall groups their own
// entity; see the D3 note at the top of src/lib/crisisConfig.ts before anyone is
// tempted to merge these three endpoints.
export async function GET() {
  try {
    return NextResponse.json(await getRecallGroups());
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const groups = Array.isArray(body) ? body : body.groups;
    if (!Array.isArray(groups)) {
      return NextResponse.json({ error: 'Expected an array of recall groups.' }, { status: 400 });
    }
    // Audit stamp (build plan §4.1). `actor` is the RoleContext role until real
    // auth lands — same mock-identity approach as permissions.ts.
    const actor = (!Array.isArray(body) && body.actor) || 'Unknown';
    const now = new Date().toISOString();
    const stamped = groups.map((g: any) => ({ ...g, updatedAt: now, updatedBy: actor }));

    // Contact validity is deliberately NOT enforced here. Q6 is answered "warn,
    // never block" (build plan §10) — an incomplete recall group is more dangerous
    // in a crisis than an imperfectly formatted one. The warning surfaces in the
    // UI and again at Crisis Review before dispatch.
    await saveRecallGroups(stamped);
    return NextResponse.json({ ok: true, count: stamped.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
