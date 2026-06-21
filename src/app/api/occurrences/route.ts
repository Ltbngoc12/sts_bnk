import { NextResponse } from 'next/server';
import { getDb, saveDb, generateOccurrenceId, generateCaseId, Occurrence } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStart = searchParams.get('dateStart');
    const dateEnd   = searchParams.get('dateEnd');
    const user      = searchParams.get('user');

    const db = await getDb();
    let results = [...db.occurrences];

    if (dateStart) {
      const start = new Date(dateStart).getTime();
      results = results.filter(o => new Date(o.dateTime).getTime() >= start);
    }
    if (dateEnd) {
      const end = new Date(dateEnd);
      end.setHours(23, 59, 59, 999);
      results = results.filter(o => new Date(o.dateTime).getTime() <= end.getTime());
    }
    if (user && user !== 'All') {
      results = results.filter(o => o.user === user);
    }

    results.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = await getDb();

    if (!body.co