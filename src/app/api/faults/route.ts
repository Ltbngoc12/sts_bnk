import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, Fault, generateFaultId, generateCaseId } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const caseId = searchParams.get('caseId');
    const status = searchParams.get('status');
    const faultType = searchParams.get('faultType');

    const db = await getDb();
    let faults = [...(db.faults || [])];

    if (caseId) {
      faults = faults.filter(f => f.caseId === caseId);
    }
    if (status) {
      faults = faults.filter(f => f.status === status);
    }
    if (faultType) {
      faults = faults.filter(f => f.faultType === faultType);
    }
    if (startDate) {
      const start = new Date(startDate).getTime();
      faults = faults.filter(f => new Date(f.createdAt).getTime() >= start);