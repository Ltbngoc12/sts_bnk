import { NextResponse } from 'next/server';
import { getDb, saveDb, AuditLog } from '@/lib/db';

const SEED_AUDITS: AuditLog[] = [
  {
    id: 'AUD-seed-1',
    timestamp: '2026-06-13T10:15:00.000Z',
    user: 'Admin Root',
    module: 'User Management',
    action: 'Create User',
    details: 'Provisioned WOG SSO account for DO Shin Feng (shin.feng@sdc.gov.sg)',
    beforeSnapshot: '',
    afterSnapshot: '{"name":"DO Shin Feng","email":"shin.feng@sdc.gov.sg","role":"Duty Officer","status":"Active","authSource":"WOG SSO"}',
    correlationId: 'CORR-seed-1',
    ipAddress: '192.168.1.10'
  },
  {
    id: 'AUD-seed-2',
    timestamp: '2026-06-13T11:20:00.000Z',
    user: 'Admin Root',
    module: 'Taxonomy',
    action: 'Create Taxonomy',
    details: 'Added new Incident Type taxonomy item: Transport (subtypes: Cable Car Stoppage, Tram Incident, Road Obstruction)',
    beforeSnapshot: '',
    afterSnapshot: '{"name":"Transport","subTypes":["Cable Car Stoppage","Tram Incident","Road Obstruction"],"category":"Incident"}',
    correlationId: 'CORR-seed-2',
    ipAddress: '192.168.1.10'
  },
  {
    id: 'AUD-seed-3',
    timestamp: '2026-06-13T12:05:00.000Z',
    user: 'Admin Root',
    module: 'Routing Matrix',
    action: 'Disable Routing Rule',
    details: 'Disabled Fault Routing rule targeting Civil Works Express Crew for Structural defects',
    beforeSnapshot: '{"condition":"Fault Type = \\"Structural\\" AND Severity = \\"High\\"","destinationTeam":"Civil Works Express Crew","status":"Active"}',
    afterSnapshot: '{"condition":"Fault Type = \\"Structural\\" AND Severity = \\"High\\"","destinationTeam":"Civil Works Express Crew","status":"Disabled"}',
    correlationId: 'CORR-seed-3',
    ipAddress: '192.168.1.10'
  },
  {
    id: 'AUD-seed-4',
    timestamp: '2026-06-13T14:40:00.000Z',
    user: 'Admin Root',
    module: 'System Settings',
    action: 'Update System Settings',
    details: 'Modified operational timeout constants: Auto Save Interval set to 30s, Record Lock Timeout set to 15m',
    beforeSnapshot: '{"autoSaveInterval":"60s","recordLockTimeout":"10m"}',
    afterSnapshot: '{"autoSaveInterval":"30s","recordLockTimeout":"15m"}',
    correlationId: 'CORR-seed-4',
    ipAddress: '192.168.1.10'
  },
  {
    id: 'AUD-seed-5',
    timestamp: '2026-06-13T15:10:00.000Z',
    user: 'Admin Root',
    module: 'Broadcast Configuration',
    action: 'Update Template',
    details: 'Modified subject header string for Standard Incident Notification template',
    beforeSnapshot: '{"name":"Standard Incident Notification","subject":"[ALERT] Incident Reported","body":"..."}',
    afterSnapshot: '{"name":"Standard Incident Notification","subject":"[ALERT] SDC Operational Alert: {incident_title}","body":"..."}',
    correlationId: 'CORR-seed-5',
    ipAddress: '192.168.1.10'
  }
];

export async function GET() {
  try {
    const db = await getDb();
    if (!db.auditLogs || db.auditLogs.length === 0) {
      db.auditLogs = SEED_AUDITS;
      await saveDb(db);
    }
    
    const logs = db.auditLogs;
    // Sort descending by timestamp
    const sortedLogs = [...logs].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return NextResponse.json(sortedLogs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = await getDb();

    if (!body.action || !body.module || !body.user) {
      return NextResponse.json({ error: 'Missing required audit fields: action, module, user' }, { status: 400 });
    }

    const newLog: AuditLog = {
      id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      user: body.user,
      action: body.action,
      module: body.module,
      details: body.details || '',
      beforeSnapshot: body.beforeSnapshot || '',
      afterSnapshot: body.afterSnapshot || '',
      correlationId: body.correlationId || `CORR-${Date.now()}`,
      ipAddress: body.ipAddress || '127.0.0.1',
      entityId: body.entityId || undefined
    };

    if (!db.auditLogs) {
      db.auditLogs = [];
    }

    db.auditLogs.push(newLog);
    saveDb(db);

    return NextResponse.json(newLog, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
