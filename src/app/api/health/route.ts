import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

/**
 * Liveness probe backing the Dashboard's "SYSTEM MONITORING ACTIVE" pill
 * (Dashboard Enhancement Plan v2 §2).
 *
 * Deliberately pings the Mongo admin command rather than calling getDb(): getDb()
 * loads all 10 collections in full, which is far too heavy to run on a 30s poll.
 * The pill's job is to tell a Controller whether the CMS is reachable, so the
 * check must touch the database — a bare 200 from Next.js would stay green while
 * Mongo is down, which is the exact failure mode this endpoint exists to catch.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    const client = await clientPromise;
    await client.db().command({ ping: 1 });
    return NextResponse.json(
      { ok: true, db: 'up', latencyMs: Date.now() - startedAt, ts: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { ok: false, db: 'down', error: message, latencyMs: Date.now() - startedAt, ts: new Date().toISOString() },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
