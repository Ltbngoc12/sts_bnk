import { NextResponse } from 'next/server';
import { NOPRecord } from '@/lib/db';

const MOCK_NOPS: NOPRecord[] = [
  {
    id: 'NOP-2026-0001',
    applicantName: 'Ahmad Razif',
    companyName: 'SenTech Utilities Pte Ltd',
    workDescription: 'Cable laying works along Siloso Road',
    startDateTime: '2026-06-12T08:00:00.000Z',
    endDateTime: '2026-06-20T18:00:00.000Z',
    status: 'Active',
    boundaryCoordinates: [
      { lat: 1.2494, lng: 103.8175 },
      { lat: 1.2498, lng: 103.8180 },
    ],
    documents: [
      { name: 'Method Statement', type: 'PDF', fileUrl: '#' },
    ],
  },
  {
    id: 'NOP-2026-0002',
    applicantName: 'Lim Wei Ling',
    companyName: 'Coastal Facade Works Pte Ltd',
    workDescription: 'Facade repainting at Palawan View Building',
    startDateTime: '2026-06-17T07:00:00.000Z',
    endDateTime: '2026-06-22T18:00:00.000Z',
    status: 'Approved',
    boundaryCoordinates: [
      { lat: 1.2508, lng: 103.8210 },
    ],
    documents: [],
  },
  {
    id: 'NOP-2026-0003',
    applicantName: 'Priya Nair',
    companyName: 'SecureVision Systems',
    workDescription: 'CCTV camera installation at Beach Station',
    startDateTime: '2026-06-25T08:00:00.000Z',
    endDateTime: '2026-06-27T18:00:00.000Z',
    status: 'Pending Review',
    boundaryCoordinates: [],
    documents: [],
  },
  {
    id: 'NOP-2026-0004',
    applicantName: 'Tan Boon Huat',
    companyName: 'GreenScape Contractors',
    workDescription: 'Landscaping and turf replacement at Imbiah',
    startDateTime: '2026-06-01T08:00:00.000Z',
    endDateTime: '2026-06-10T18:00:00.000Z',
    status: 'Expired',
    boundaryCoordinates: [],
    documents: [],
  },
];

export async function GET() {
  const now = new Date();
  const activeNops = MOCK_NOPS.filter(n => {
    if (n.status === 'Active') return true;
    if (n.status === 'Approved') {
      const start = new Date(n.startDateTime);
      const end = new Date(n.endDateTime);
      return start <= now && now <= end;
    }
    return false;
  });

  return NextResponse.json({
    nops: MOCK_NOPS,
    stats: { active: activeNops.length },
  });
}
