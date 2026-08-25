import { NextResponse } from 'next/server';
import {
  getNotifications,
  addNotification,
  markNotificationRead,
  markAllNotificationsRead,
  insertNotifications,
  clearNotifications,
} from '@/lib/broadcastStore';
import type { NotificationRecord } from '@/lib/broadcastConfig';

// FSD §10.5 — server-side System Notifications mailbox.
// Seeded once (mirrors the previous client seed) so the widget has content on first run.
function seed(): NotificationRecord[] {
  const now = Date.now();
  const mk = (
    n: number, minsAgo: number, recipientRole: string, type: string, title: string, message: string, link: string, read = false
  ): NotificationRecord => ({
    id: `notif-seed-${n}`,
    recipientRole,
    type,
    title,
    message,
    link,
    read,
    timestamp: new Date(now - minsAgo * 60000).toISOString(),
  });
  return [
    mk(1, 15, 'Controller', 'incident', 'Responder log submitted', 'Ranger John submitted an incident log for review on Incident SEN/IR/20260614/0001.', '/incidents'),
    mk(2, 120, 'Controller', 'cmms', 'CMMS Fault ID received', 'Fault ID CMMS-89102 linked to Case SEN/CI/20260614/001.', '/faults'),
    mk(3, 300, 'Controller', 'incident', 'Incident returned for revision', 'Incident log SEN/IR/20260614/0002 returned for revision by Duty Manager.', '/incidents', true),
    mk(4, 30, 'Duty Manager', 'nop', 'NOP Status Change', 'NOP-2026-0089: "Siloso Sand Restoration" is pending approval.', '/nops'),
    mk(5, 240, 'Duty Manager', 'ageing', 'Incident ageing alert (12 days)', 'Incident SEN/IR/20260602/0001 has been active for 12 days without closure.', '/incidents'),
    mk(6, 1440, 'Duty Manager', 'ageing', 'Incident ageing alert (14 days)', 'Action required: Incident SEN/IR/20260531/0002 active for 14 days.', '/incidents', true),
    mk(7, 10, 'Duty Officer', 'task', 'Task Assigned', 'Duty Manager assigned task: "Review Siloso Beach Event Safety Plan".', '/tasks'),
    mk(9, 8, 'Responder (Ranger)', 'incident', 'Incident Assigned', 'Incident SEN/IR/20260614/0003 assigned to you.', '/incidents'),
    mk(11, 12, 'Stakeholder', 'nop', 'NOP Approved', 'NOP-2026-0089 status updated to Approved.', '/nops'),
    mk(12, 720, 'System Administrator', 'task', 'Database Auto-Backup Successful', 'IIS CMS database backup completed successfully.', '/'),
  ];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    let all = await getNotifications();
    if (all.length === 0) {
      await insertNotifications(seed());
      all = await getNotifications();
    }
    const filtered = role ? all.filter((n) => n.recipientRole === role || n.recipientRole === 'All') : all;
    const sorted = [...filtered].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    return NextResponse.json(sorted);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.recipientRole || !body.title) {
      return NextResponse.json({ error: 'recipientRole and title are required.' }, { status: 400 });
    }
    const rec = await addNotification({
      userId: body.userId,
      recipientRole: body.recipientRole,
      type: body.type || 'system',
      title: body.title,
      message: body.message || '',
      link: body.link,
    });
    return NextResponse.json(rec, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Mark a single notification (id) or all-for-a-role (markAll + role) as read.
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    if (body.markAll) {
      await markAllNotificationsRead(body.role);
    } else if (body.id) {
      await markNotificationRead(body.id, body.read !== false);
    } else {
      return NextResponse.json({ error: 'Provide id, or markAll:true.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Clear notifications for a role (?role=), or all if omitted.
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role') || undefined;
    await clearNotifications(role);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
