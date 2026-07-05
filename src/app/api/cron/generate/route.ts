import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';
import { advanceAllSeries } from '@/lib/seriesEngine';

// Daily lead-window advance. Call this from a scheduler (cron) once a day, or
// hit it manually during testing. Idempotent — running it twice in a day does
// not create duplicate occurrences.
//
// GET and POST both work so it's easy to trigger from a browser or a cron job.
async function run() {
  const db = await getDb();
  const results = advanceAllSeries(db);
  const totalCreated = results.reduce((n, r) => n + r.created, 0);
  if (totalCreated > 0) await saveDb(db);
  return NextResponse.json({
    ranAt: new Date().toISOString(),
    seriesProcessed: results.length,
    occurrencesCreated: totalCreated,
    details: results,
  });
}

export async function GET() {
  try {
    return await run();
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    return await run();
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
