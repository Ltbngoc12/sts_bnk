'use client';

// Crisis Message Template — standalone create / edit page.
// Synchronized UX & design with Broadcast template detail page
// (admin/broadcast-config/templates/[id]/page.tsx).

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminGuard } from '@/components/AdminGuard';
import { useRole } from '@/context/RoleContext';
import { hasCrisisPermission } from '@/lib/permissions';
import {
  RECALL_CHANNELS,
  RECALL_PLACEHOLDERS,
  smsSegmentInfo,
  renderPlaceholders,
} from '@/lib/crisisConfig';
import type {
  RecallMessageTemplate,
  RecallRoutingRule,
  RecallChannel,
} from '@/lib/crisisConfig';
import type { AuditLog } from '@/lib/db';

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export default function CrisisTemplateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = decodeURIComponent(String(params.id));
  const isNew = rawId === 'new';
  const { username } = useRole();

  const [newId] = useState(() => genId('rt'));
  const [templates, setTemplates] = useState<RecallMessageTemplate[]>([]);
  const [rules, setRules] = useState<RecallRoutingRule[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<RecallMessageTemplate | null>(null);
  const [lastFocused, setLastFocused] = useState<'subject' | 'body'>('body');

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [tRes, rRes] = await Promise.all([
          fetch('/api/admin/crisis-config/templates').then((r) => r.json()),
          fetch('/api/admin/crisis-config/routing-rules').then((r) => r.json()),
        ]);
        const loadedTemplates = Array.isArray(tRes) ? tRes : [];
        setTemplates(loadedTemplates);
        setRules(Array.isArray(rRes) ? rRes : []);

        if (isNew) {
          setDraft({
            id: newId,
            name: '',
            channel: 'SMS',
            subject: '',
            body: '',
            applicableLevels: [],
            status: 'Active',
          });
        } else {
          const found = loadedTemplates.find((x: RecallMessageTemplate) => x.id === rawId);
          setDraft(found ? { ...found, channel: 'SMS' } : null);
        }
      } catch (e) {
        console.error('Failed to load template', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [isNew, newId, rawId]);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const res = await fetch('/api/admin/audit');
        const data = await res.json();
        setAuditLogs(
          Array.isArray(data)
            ? data.filter((l: AuditLog) => l.module === 'Crisis Configuration' && l.entityId === rawId)
            : []
        );
      } catch (e) {
        console.error('Failed to load template history', e);
      }
    })();
  }, [isNew, rawId]);

  const logAudit = async (action: string, before: any, after: any, details: string, entityId?: string) => {
    try {
      await fetch('/api/admin/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: username,
          module: 'Crisis Configuration',
          action,
          details,
          beforeSnapshot: JSON.stringify(before),
          afterSnapshot: JSON.stringify(after),
          correlationId: `CRS-${Date.now()}`,
          entityId,
        }),
      });
    } catch (e) {
      console.error('Audit logging failed:', e);
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      alert('Template Name is required.');
      return;
    }
    if (!draft.body.trim()) {
      alert('Message body is required.');
      return;
    }

    setSaving(true);
    try {
      const exists = templates.some((t) => t.id === draft.id);
      const before = exists ? templates.find((t) => t.id === draft.id) : null;
      const updated = exists ? templates.map((t) => (t.id === draft.id ? draft : t)) : [...templates, draft];

      const res = await fetch('/api/admin/crisis-config/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates: updated }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');

      await logAudit(
        exists ? 'Edit Crisis Template' : 'Create Crisis Template',
        before,
        draft,
        `Template "${draft.name}" (${draft.channel}) saved.`,
        draft.id
      );

      router.push('/admin/crisis-config');
    } catch (e: any) {
      alert(`Could not save template: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!draft || isNew) return;
    const nextStatus: 'Active' | 'Inactive' = draft.status === 'Active' ? 'Inactive' : 'Active';
    const before = draft;
    const after = { ...draft, status: nextStatus };
    setDraft(after);
    const updated = templates.map((t) => (t.id === draft.id ? after : t));
    setTemplates(updated);
    await fetch('/api/admin/crisis-config/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templates: updated }),
    });
    await logAudit(
      'Toggle Crisis Template Status',
      before,
      after,
      `Set crisis template "${draft.name}" to ${nextStatus}`,
      draft.id
    );
  };

  const insertPlaceholder = (placeholderToken: string) => {
    if (!draft) return;
    if (lastFocused === 'subject' && draft.channel === 'Email') {
      const el = subjectRef.current;
      const current = draft.subject || '';
      const start = el?.selectionStart ?? current.length;
      const end = el?.selectionEnd ?? current.length;
      const next = current.slice(0, start) + placeholderToken + current.slice(end);
      setDraft({ ...draft, subject: next });
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(start + placeholderToken.length, start + placeholderToken.length);
      });
    } else {
      const el = bodyRef.current;
      const current = draft.body;
      const start = el?.selectionStart ?? current.length;
      const end = el?.selectionEnd ?? current.length;
      const next = current.slice(0, start) + placeholderToken + current.slice(end);
      setDraft({ ...draft, body: next });
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(start + placeholderToken.length, start + placeholderToken.length);
      });
    }
  };

  if (loading) {
    return (
      <AdminGuard pageTitle="Crisis Configuration" permissionCheck={(r) => hasCrisisPermission(r, 'crisis.config')}>
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading crisis message template…</div>
      </AdminGuard>
    );
  }

  if (!draft) {
    return (
      <AdminGuard pageTitle="Crisis Configuration" permissionCheck={(r) => hasCrisisPermission(r, 'crisis.config')}>
        <div className="glass" style={{ padding: '40px', textAlign: 'center', color: 'var(--color-critical)' }}>
          <p>Crisis message template not found.</p>
          <Link href="/admin/crisis-config" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontSize: '13px' }}>
            ← Back to Crisis Configuration
          </Link>
        </div>
      </AdminGuard>
    );
  }

  const rendered = renderPlaceholders(draft.body);
  const seg = smsSegmentInfo(rendered);
  const usageRules = rules.filter((r) => r.templateId === draft.id);

  return (
    <AdminGuard pageTitle="Crisis Configuration" permissionCheck={(r) => hasCrisisPermission(r, 'crisis.config')}>
      {/* Header bar */}
      <div className="admin-header-bar glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <Link href="/admin/crisis-config" style={{ color: 'var(--text-faint)', fontSize: '12px', textDecoration: 'none' }}>
              ← Crisis Configuration
            </Link>
            <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>/</span>
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-primary-dark)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {isNew ? 'New Template' : 'Crisis Template'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>
              {draft.name || 'New Template'}
            </h1>
            {!isNew && (
              <span className={`badge ${draft.status === 'Active' ? 'badge-completed' : 'badge-live'}`} style={{ padding: '2px 8px', borderRadius: '4px' }}>
                {draft.status}
              </span>
            )}
          </div>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Used by {usageRules.length} routing rule{usageRules.length !== 1 ? 's' : ''}
          </p>
        </div>
        {!isNew && (
          <button
            onClick={handleToggleStatus}
            disabled={saving}
            className={`btn ${draft.status === 'Active' ? 'btn-secondary' : 'btn-primary'}`}
            style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}
          >
            {draft.status === 'Active' ? 'Deactivate' : 'Reactivate'}
          </button>
        )}
      </div>

      {/* Main Grid Layout (2fr 1fr) */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginTop: '20px', alignItems: 'start' }}>
        {/* Left Column: Main Form */}
        <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)' }}>
          <FormField label="Template Name">
            <input
              type="text"
              placeholder="e.g. Standard SMS Recall"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              style={inputStyle}
            />
          </FormField>

          <div style={{ marginTop: '12px' }}>
            <FormField label="Status">
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as 'Active' | 'Inactive' })}
                style={selectStyle}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </FormField>
          </div>

          <div style={{ marginTop: '12px' }}>
            <FormField label="Message Body">
              <textarea
                ref={bodyRef}
                rows={10}
                value={draft.body}
                onFocus={() => setLastFocused('body')}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: '12.5px', resize: 'vertical', lineHeight: '1.4' }}
              />
            </FormField>
          </div>

          <div style={{ marginTop: '14px' }}>
            <label style={labelStyle}>
              Insert Field (click to insert into Body)
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
              {RECALL_PLACEHOLDERS.map((p) => (
                <button
                  key={p.token}
                  type="button"
                  onClick={() => insertPlaceholder(p.token)}
                  title={`Insert ${p.token}`}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '14px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-inset)',
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    color: 'var(--text-main)',
                  }}
                >
                  + {p.label}
                </button>
              ))}
            </div>
          </div>



          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button
              type="button"
              onClick={() => router.push('/admin/crisis-config')}
              className="btn btn-secondary"
              style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary"
              style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 600 }}
            >
              {isNew ? 'Create Template' : 'Save changes'}
            </button>
          </div>
        </div>

        {/* Right Column: Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Live Preview Card */}
          <div className="glass" style={{ padding: '16px', background: 'var(--bg-card)' }}>
            <h3 style={{ fontFamily: 'var(--font-headline)', fontSize: '13px', color: 'var(--text-main)', margin: '0 0 10px' }}>
              Preview — Exactly What Recipient Reads
            </h3>
            <div
              style={{
                background: 'var(--bg-inset)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '12px',
                minHeight: '100px',
                fontSize: '12px',
                lineHeight: 1.5,
                color: rendered ? 'var(--text-main)' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {rendered || 'Nothing to preview yet.'}
            </div>

            {draft.channel === 'SMS' && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginTop: '12px' }}>
                <span className="badge" style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)' }}>
                  {seg.length} CHARACTERS
                </span>
                <span className={`badge ${seg.segments > 2 ? 'badge-critical' : 'badge-completed'}`} style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px' }}>
                  {seg.segments} SEGMENT{seg.segments !== 1 ? 'S' : ''}
                </span>
                <span className="badge" style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)' }}>
                  {seg.encoding}
                </span>
                <span className="badge" style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)' }}>
                  {seg.remaining} LEFT IN SEGMENT
                </span>
              </div>
            )}

            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.45 }}>
              Preview uses sample values. Real values are substituted at dispatch and shown again on Crisis Review.
            </p>
          </div>

          {/* Used By Card */}
          {!isNew && (
            <div className="glass" style={{ padding: '16px', background: 'var(--bg-card)' }}>
              <h3 style={{ fontFamily: 'var(--font-headline)', fontSize: '13px', color: 'var(--text-main)', margin: '0 0 10px' }}>Used By</h3>
              {usageRules.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Not used by any routing rule yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {usageRules.map((r) => (
                    <div key={r.id} style={{ fontSize: '11.5px', color: 'var(--text-sub)', padding: '8px 10px', background: 'var(--bg-inset)', borderRadius: '6px' }}>
                      {r.name} · {r.crisisLevels.join(', ')}
                      <span style={{ marginLeft: '6px', color: r.status === 'Active' ? 'var(--color-primary-dark)' : 'var(--text-muted)' }}>({r.status})</span>
                    </div>
                  ))}
                </div>
              )}
              <Link href="/admin/crisis-config" style={{ display: 'inline-block', marginTop: '10px', fontSize: '11.5px', color: 'var(--color-primary)', textDecoration: 'none' }}>
                View Routing Matrix →
              </Link>
            </div>
          )}

          {/* Change History Card */}
          {!isNew && (
            <div className="glass" style={{ padding: '16px', background: 'var(--bg-card)' }}>
              <h3 style={{ fontFamily: 'var(--font-headline)', fontSize: '13px', color: 'var(--text-main)', margin: '0 0 10px' }}>Change History</h3>
              {auditLogs.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>No changes recorded yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto' }}>
                  {auditLogs.map((log) => (
                    <div key={log.id} style={{ padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                        <span>{log.user}</span>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '12px', marginTop: '3px' }}>{log.action}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-sub)', marginTop: '2px' }}>{log.details}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminGuard>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ marginTop: '5px' }}>{children}</div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', background: 'var(--bg-inset)', color: 'var(--text-main)' };
const selectStyle: React.CSSProperties = { ...inputStyle };
