'use client';

// Broadcast Template detail page (2026-07-25, per discussion with Kyle on the
// Template tab redesign — see BROADCAST_CONFIG_PAGE_REDESIGN_PLAN.md and the
// review thread it came from).
//
// Split out of the Template tab in admin/broadcast-config/page.tsx for three
// reasons Kyle raised:
//  1. Incident Type/Sub-type/Crisis Level were removed from BroadcastTemplate
//     entirely (see comment on that interface in broadcastConfig.ts) — a Routing
//     Matrix Rule is now the sole place that decides when a template applies, so
//     this page only edits pure content (name/subject/body/sensitive fields).
//  2. Multiple templates per Broadcast Type is the normal case, not a special
//     one — this page is deep-linkable (e.g. from an audit log entry or from the
//     "Used By" list on the Routing Matrix tab) instead of only reachable by
//     clicking through the Template tab's in-page state.
//  3. Per-template audit history: filters the shared /api/admin/audit log down to
//     entries whose `entityId` matches this template's id (see AuditLog.entityId
//     in db.ts), instead of only being visible in the page-wide "View Change
//     History" list.
//
// Follows the same route pattern as admin/distribution-groups/[id]/page.tsx.

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminGuard } from '@/components/AdminGuard';
import { useRole } from '@/context/RoleContext';
import { hasBroadcastPermission } from '@/lib/permissions';
import { BROADCAST_TYPES } from '@/lib/broadcastConfig';
import type { BroadcastTemplate, BroadcastMatrixRule } from '@/lib/broadcastConfig';
import { renderTemplate } from '@/lib/broadcast';
import { getFieldsForBroadcastType, sampleVarsForBroadcastType } from '@/lib/broadcastFields';
import type { AuditLog } from '@/lib/db';

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

// Same self-healing normalize as the main page — a legacy Mongo doc may still
// carry the old incidentType/incidentSubType/crisisLevel fields; they're simply
// ignored (spread through but never read) rather than crashing anything.
function normalizeTemplate(t: any): BroadcastTemplate {
  return { ...t, status: t.status === 'Inactive' ? 'Inactive' : 'Active' };
}

export default function TemplateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = decodeURIComponent(String(params.id));
  const isNew = rawId === 'new';
  const { username } = useRole();

  // Stable id generated once for the "new template" flow — used as the draft's
  // id from the start so audit entries and the eventual redirect URL line up.
  const [newId] = useState(() => genId('tpl'));

  const [templates, setTemplates] = useState<BroadcastTemplate[]>([]);
  const [matrix, setMatrix] = useState<BroadcastMatrixRule[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<BroadcastTemplate | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [lastFocused, setLastFocused] = useState<'subject' | 'body'>('body');
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [t, m] = await Promise.all([
          fetch('/api/admin/broadcast-templates').then((r) => r.json()),
          fetch('/api/admin/broadcast-matrix').then((r) => r.json()),
        ]);
        const loadedTemplates = (Array.isArray(t) ? t : []).map(normalizeTemplate);
        setTemplates(loadedTemplates);
        setMatrix(Array.isArray(m) ? m : []);

        if (isNew) {
          setDraft({
            id: newId,
            category: BROADCAST_TYPES[0],
            name: 'New Template',
            subject: '',
            body: '',
            status: 'Active',
          });
        } else {
          const found = loadedTemplates.find((x) => x.id === rawId);
          setDraft(found ? { ...found } : null);
        }
      } catch (e) {
        console.error('Failed to load template', e);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawId]);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const res = await fetch('/api/admin/audit');
        const data = await res.json();
        setAuditLogs(
          Array.isArray(data)
            ? data.filter((l: AuditLog) => l.module === 'Broadcast Configuration' && l.entityId === rawId)
            : []
        );
      } catch (e) {
        console.error('Failed to load template history', e);
      }
    })();
  }, [isNew, rawId]);

  const logAudit = async (action: string, before: any, after: any, details: string, entityId: string) => {
    try {
      await fetch('/api/admin/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: username,
          module: 'Broadcast Configuration',
          action,
          details,
          beforeSnapshot: JSON.stringify(before),
          afterSnapshot: JSON.stringify(after),
          correlationId: `BCS-${Date.now()}`,
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
    const exists = templates.some((t) => t.id === draft.id);
    const before = exists ? templates.find((t) => t.id === draft.id) : null;
    const updated = exists ? templates.map((t) => (t.id === draft.id ? draft : t)) : [...templates, draft];

    setTemplates(updated);
    await fetch('/api/admin/broadcast-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    await logAudit(
      exists ? 'Update Template' : 'Create Template',
      before,
      draft,
      `${exists ? 'Updated' : 'Created'} broadcast template "${draft.name}" (${draft.category})`,
      draft.id
    );

    if (isNew) {
      router.replace(`/admin/broadcast-config/templates/${draft.id}`);
    } else {
      alert('Template saved.');
    }
  };

  const handleToggleStatus = async () => {
    if (!draft || isNew) return;
    const nextStatus = draft.status === 'Active' ? 'Inactive' : 'Active';
    const before = draft;
    const after = { ...draft, status: nextStatus as 'Active' | 'Inactive' };
    setDraft(after);
    const updated = templates.map((t) => (t.id === draft.id ? after : t));
    setTemplates(updated);
    await fetch('/api/admin/broadcast-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    await logAudit('Toggle Template Status', before, after, `Set template "${draft.name}" to ${nextStatus}`, draft.id);
  };

  const insertField = (key: string) => {
    if (!draft) return;
    const token = `{${key}}`;
    if (lastFocused === 'subject') {
      const el = subjectRef.current;
      const current = draft.subject;
      const start = el?.selectionStart ?? current.length;
      const end = el?.selectionEnd ?? current.length;
      const next = current.slice(0, start) + token + current.slice(end);
      setDraft({ ...draft, subject: next });
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(start + token.length, start + token.length);
      });
    } else {
      const el = bodyRef.current;
      const current = draft.body;
      const start = el?.selectionStart ?? current.length;
      const end = el?.selectionEnd ?? current.length;
      const next = current.slice(0, start) + token + current.slice(end);
      setDraft({ ...draft, body: next });
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(start + token.length, start + token.length);
      });
    }
  };

  const fieldCatalog = getFieldsForBroadcastType(draft?.category);
  const usageRules = draft ? matrix.filter((r) => r.templateId === draft.id) : [];

  if (loading) {
    return (
      <AdminGuard pageTitle="Broadcast Configuration" permissionCheck={(r) => hasBroadcastPermission(r, 'broadcast.config')}>
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading template…</div>
      </AdminGuard>
    );
  }

  if (!draft) {
    return (
      <AdminGuard pageTitle="Broadcast Configuration" permissionCheck={(r) => hasBroadcastPermission(r, 'broadcast.config')}>
        <div className="glass" style={{ padding: '40px', textAlign: 'center', color: 'var(--color-critical)' }}>
          <p>Template not found.</p>
          <Link href="/admin/broadcast-config" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontSize: '13px' }}>
            ← Back to Broadcast Configuration
          </Link>
        </div>
      </AdminGuard>
    );
  }

  return (
    <AdminGuard pageTitle="Broadcast Configuration" permissionCheck={(r) => hasBroadcastPermission(r, 'broadcast.config')}>
      <div className="admin-header-bar glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <Link href="/admin/broadcast-config" style={{ color: 'var(--text-faint)', fontSize: '12px', textDecoration: 'none' }}>
              ← Broadcast Configuration
            </Link>
            <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>/</span>
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-primary-dark)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {isNew ? 'New Template' : 'Template'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>{draft.name || 'New Template'}</h1>
            {!isNew && (
              <span className={`badge ${draft.status === 'Active' ? 'badge-completed' : 'badge-live'}`} style={{ padding: '2px 8px', borderRadius: '4px' }}>
                {draft.status}
              </span>
            )}
          </div>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {draft.category} · Used by {usageRules.length} routing rule{usageRules.length !== 1 ? 's' : ''}
          </p>
        </div>
        {!isNew && (
          <button
            onClick={handleToggleStatus}
            className={`btn ${draft.status === 'Active' ? 'btn-danger' : 'btn-success'}`}
            style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}
          >
            {draft.status === 'Active' ? 'Deactivate' : 'Reactivate'}
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginTop: '20px', alignItems: 'start' }}>
        <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)' }}>
          <FormField label="Broadcast Type">
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} style={selectStyle}>
              {BROADCAST_TYPES.map((bt) => (
                <option key={bt} value={bt}>{bt}</option>
              ))}
            </select>
          </FormField>

          <div style={{ marginTop: '12px' }}>
            <FormField label="Template Name">
              <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={inputStyle} />
            </FormField>
          </div>

          <div style={{ marginTop: '12px' }}>
            <FormField label="Subject Header">
              <input
                ref={subjectRef}
                type="text"
                value={draft.subject}
                onFocus={() => setLastFocused('subject')}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                style={inputStyle}
              />
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
            <label style={labelStyle}>Insert Field (click to insert into {lastFocused === 'subject' ? 'Subject' : 'Body'})</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
              {fieldCatalog.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => insertField(f.key)}
                  title={`Insert {${f.key}}`}
                  style={{ padding: '5px 10px', borderRadius: '14px', border: '1px solid var(--border-color)', background: 'var(--bg-inset)', fontSize: '11.5px', cursor: 'pointer', color: 'var(--text-main)' }}
                >
                  + {f.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ background: 'var(--bg-inset)', padding: '10px 12px', borderRadius: '8px', fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '14px', lineHeight: 1.5 }}>
            Don&apos;t write operationally sensitive, under-investigation, or restricted detail into the default content above — the reviewer will be asked to confirm at dispatch only if they edit the content beyond what this template auto-fills.
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button type="button" onClick={() => setIsPreviewOpen(true)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>
              Preview
            </button>
            <button type="button" onClick={handleSave} className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>
              {isNew ? 'Create Template' : 'Save changes'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {usageRules.length > 0 && (
            <div className="glass" style={{ padding: '16px', background: 'var(--bg-card)' }}>
              <h3 style={{ fontFamily: 'var(--font-headline)', fontSize: '13px', color: 'var(--text-main)', margin: '0 0 10px' }}>Used By</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {usageRules.map((r) => (
                  <div key={r.id} style={{ fontSize: '11.5px', color: 'var(--text-sub)', padding: '8px 10px', background: 'var(--bg-inset)', borderRadius: '6px' }}>
                    {r.broadcastType} · {(r.incidentTypes && r.incidentTypes.length ? r.incidentTypes : ['Any']).join(', ')} · {r.crisisLevels.join(', ')}
                    <span style={{ marginLeft: '6px', color: r.status === 'Active' ? 'var(--color-primary-dark)' : 'var(--text-muted)' }}>({r.status})</span>
                  </div>
                ))}
              </div>
              <Link href="/admin/broadcast-config" style={{ display: 'inline-block', marginTop: '10px', fontSize: '11.5px', color: 'var(--color-primary)', textDecoration: 'none' }}>
                View Routing Matrix →
              </Link>
            </div>
          )}

          {!isNew && (
            <div className="glass" style={{ padding: '16px', background: 'var(--bg-card)' }}>
              <h3 style={{ fontFamily: 'var(--font-headline)', fontSize: '13px', color: 'var(--text-main)', margin: '0 0 10px' }}>Change History</h3>
              {auditLogs.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>No changes recorded yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
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

      {isPreviewOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '600px', padding: '24px', background: 'var(--bg-card)' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              Preview — {draft.name}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <strong style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Subject</strong>
                <div style={{ padding: '10px', background: 'var(--bg-inset)', borderRadius: '6px', border: '1px solid var(--border-color)', fontWeight: 600 }}>
                  {renderTemplate(draft.subject, sampleVarsForBroadcastType(draft.category))}
                </div>
              </div>
              <div>
                <strong style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Body</strong>
                <div style={{ padding: '12px', background: 'var(--bg-inset)', borderRadius: '6px', border: '1px solid var(--border-color)', fontFamily: 'var(--font-mono)', fontSize: '12px', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                  {renderTemplate(draft.body, sampleVarsForBroadcastType(draft.category))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setIsPreviewOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
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
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' };
const selectStyle: React.CSSProperties = { ...inputStyle };
