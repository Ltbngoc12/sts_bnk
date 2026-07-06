import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const subType = searchParams.get('subType');
    const dateStr = searchParams.get('date');

    if (!type || !dateStr) {
      return NextResponse.json({ error: 'type and date are required' }, { status: 400 });
    }

    const refDate = new Date(dateStr);
    if (isNaN(refDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }
    const TWO_HOURS = 2 * 60 * 60 * 1000;

    const db = await getDb();
    const openStatuses = ['Live', 'Live (Assigned)', 'Pending Endorsement', 'Returned'];

    const candidates = db.cases
      .filter(c => c.incident && openStatuses.includes(c.incident.status))
      .filter(c => {
        const inc = c.incident!;
        if (inc.type !== type) return false;
        if (subType && inc.subType !== subType) return false;
        const incDate = new Date(inc.dateTime);
        return Math.abs(incDate.getTime() - refDate.getTime()) <= TWO_HOURS;
      })
      .map(c => ({
        caseId: c.id,
        incidentId: c.incident!.id,
        title: c.title,
        type: c.incident!.type,
        subType: c.incident!.subType,
        status: c.incident!.status,
        dateTime: c.incident!.dateTime,
        location: c.incident!.location,
        assignedTo: c.incident!.assignedTo
      }));

    return NextResponse.json({ candidates, count: candidates.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
