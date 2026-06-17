import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const db = await getDb();
    let faults = [...(db.faults || [])];

    if (startDate) {
      const start = new Date(startDate).getTime();
      faults = faults.filter(f => new Date(f.createdAt).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      faults = faults.filter(f => new Date(f.createdAt).getTime() <= end.getTime());
    }

    return NextResponse.json({
      faults,
      stats: {
        total: faults.length,
        unclosed: faults.filter(f => f.status !== 'Closed').length,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
