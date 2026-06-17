import { NextResponse } from 'next/server';
import { EventRecord } from '@/lib/db';

const MOCK_EVENTS: EventRecord[] = [
  {
    id: 'EVT-2026-0001',
    name: 'Beach Volleyball Open',
    startDateTime: '2026-06-15T08:00:00.000Z',
    endDateTime: '2026-06-18T20:00:00.000Z',
    location: 'Siloso Beach',
    type: 'Sports & Recreation',
    description: 'Annual beach volleyball tournament open to public.',
    createdBy: 'System',
    createdAt: '2026-06-01T09:00:00.000Z',
  },
  {
    id: 'EVT-2026-0002',
    name: 'Sentosa GrillFest',
    startDateTime: '2026-06-17T10:00:00.000Z',
    endDateTime: '2026-06-17T22:00:00.000Z',
    location: 'Palawan Green',
    type: 'F&B',
    description: 'Food and beverages festival with live music.',
    createdBy: 'System',
    createdAt: '2026-06-01T09:00:00.000Z',
  },
  {
    id: 'EVT-2026-0003',
    name: 'Crane Works – Palawan Beach',
    startDateTime: '2026-06-20T07:00:00.000Z',
    endDateTime: '2026-06-25T18:00:00.000Z',
    location: 'Palawan Beach',
    type: 'Works',
    description: 'Scheduled construction crane operation for cable bridge inspection.',
    createdBy: 'System',
    createdAt: '2026-06-05T09:00:00.000Z',
  },
  {
    id: 'EVT-2026-0004',
    name: 'Staff Training Run',
    startDateTime: '2026-06-10T06:00:00.000Z',
    endDateTime: '2026-06-12T09:00:00.000Z',
    location: 'Sentosa Gateway',
    type: 'Internal',
    description: 'Quarterly emergency response staff training.',
    createdBy: 'System',
    createdAt: '2026-05-20T09:00:00.000Z',
  },
];

export async function GET() {
  const now = new Date();
  const eventsToday = MOCK_EVENTS.filter(e => {
    const start = new Date(e.startDateTime);
    const end = new Date(e.endDateTime);
    return start <= now && now <= end;
  });

  return NextResponse.json({
    events: MOCK_EVENTS,
    stats: { today: eventsToday.length },
  });
}
