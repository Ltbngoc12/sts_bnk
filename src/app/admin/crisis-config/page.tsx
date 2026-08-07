'use client';

// Crisis Configuration — Module M1 / Epic 1 of
// Crisis-Management-Emergency-Recall-Build-Plan.md (v1.1) at repo root. FSD §11.5.
//
// 5 tabs: Recall Groups / Message Templates / Routing Rules / Messaging Service /
// Acknowledgement & Escalation. Everything reads and writes the real Mongo-backed
// store in src/lib/crisisStore.ts via /api/admin/crisis-config/*. No localStorage,
// consistent with the 2026-07-27 decision on Broadcast Configuration.
//
// Covers stories 1, 2, 4, 5, 6, 7, 8. NOT covered here: story 3 (bulk import,
// phase 1c) and everything in M2–M5 (crisis queue, review, dispatch, dashboard,
// closure) which have no UI yet.
//
// ── WHAT THIS PAGE IS FOR ─────────────────────────────────────────────────────
// Build plan §6.3: "Crisis Review must be fast. Two clicks to dispatch. Everything
// else is pre-configured in System Configuration." This page IS that everything
// else. Any field an admin can set here is a field the Duty Manager does not have
// to think about at 3am with a fire alarm going off. That trade-off is the reason
// this page is allowed to be dense and the Crisis Review screen is not.

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminGuard } from '@/components/AdminGuard';
import { useRole } from '@/context/RoleContext';
import { hasCrisisPermission } from '@/lib/permissions';
import { getIncidentTaxonomy } from '@/lib/taxonomy';
import {
  CRISIS_LEVELS,
  CRISIS_TRIGGER_LEVELS,
  RECALL_CHANNELS,
  MEMBER_TIERS,
  RECALL_PLACEHOLDERS,
  smsSegmentInfo,
  renderPlaceholders,
  mobileWarning,
  isValidSgMobile,
  senderIdIsAlphanumeric,
} from '@/lib/crisisConfig';
import type {
  RecallGroup,
  RecallMessageTemplate,
  RecallRoutingRule,
  MessagingServiceConfig,
  AckEscalationRule,
  EscalationStep,
} from '@/lib/crisisConfig';

type TabKey = 'Groups' | 'Templates' | 'Routing' | 'Provider' | 'Ack';

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

const card: React.CSSProperties = { padding: '20px', background: 'var(--bg-card)', marginTop: '12px' };
const sectionHead: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '15px',
  borderBottom: '1px solid var(--border-color)',
  paddingBottom: '8px',
};
const h2: React.CSSProperties = { fontFamily: 'var(--font-headline)', fontSize: '14px', color: 'var(--text-main)', margin: 0 };
const sub: React.CSSProperties = { fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' };
const label: React.CSSProperties = { display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-sub)', marginBottom: '4px' };
const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border-color)',
  borderRadius: '6px',
  fontSize: '13px',
  background: 'var(--bg-inset)',
  color: 'var(--text-main)',
};

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const tdStyle: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: '13px',
  color: 'var(--text-main)',
  borderBottom: '1px solid var(--border-color)',
};

// A callout used for the design decisions that are load-bearing but invisible in
// the UI (accumulate-all routing, warn-don't-block contacts, delivery ≠ ack). An
// admin who does not know these rules will misconfigure the module in ways that
// only show up during a real crisis.
function Note({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: React.ReactNode }) {
  const c = tone === 'warn' ? 'var(--color-critical)' : 'var(--color-primary)';
  return (
    <div
      style={{
        background: 'var(--bg-inset)',
        borderLeft: `4px solid ${c}`,
        padding: '10px 14px',
        borderRadius: '6px',
        fontSize: '12px',
        color: 'var(--text-sub)',
        lineHeight: 1.55,
        marginBottom: '14px',
      }}
    >
      {children}
    </div>
  );
}

function Pill({ text, tone }: { text: string; tone: 'ok' | 'warn' | 'muted' }) {
  const map = {
    ok: { bg: 'var(--color-success-bg, #e8f5e9)', fg: 'var(--color-success, #2e7d32)' },
    warn: { bg: 'var(--color-critical-bg)', fg: 'var(--color-critical)' },
    muted: { bg: 'var(--bg-inset)', fg: 'var(--text-muted)' },
  }[tone];
  return (
    <span style={{ background: map.bg, color: map.fg, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}

export default function CrisisConfigPage() {
  const { username, role } = useRole();
  const [activeTab, setActiveTab] = useState<TabKey>('Groups');
  const [loading, setLoading] = useState(true);

  const [groups, setGroups] = useState<RecallGroup[]>([]);
  const [templates, setTemplates] = useState<RecallMessageTemplate[]>([]);
  const [rules, setRules] = useState<RecallRoutingRule[]>([]);
  const [provider, setProvider] = useState<MessagingServiceConfig | null>(null);
  const [ack, setAck] = useState<AckEscalationRule | null>(null);
  const [taxonomy, setTaxonomy] = useState<Record<string, string[]>>({});

  useEffect(() => {
    (async () => {
      try {
        const [g, t, r, p, a] = await Promise.all([
          fetch('/api/admin/crisis-config/recall-groups').then((x) => x.json()),
          fetch('/api/admin/crisis-config/templates').then((x) => x.json()),
          fetch('/api/admin/crisis-config/routing-rules').then((x) => x.json()),
          fetch('/api/admin/crisis-config/messaging-service').then((x) => x.json()),
          fetch('/api/admin/crisis-config/ack-escalation').then((x) => x.json()),
        ]);
        setGroups(Array.isArray(g) ? g : []);
        setTemplates(Array.isArray(t) ? t : []);
        setRules(Array.isArray(r) ? r : []);
        setProvider(p);
        setAck(a);
        setTaxonomy(getIncidentTaxonomy());
      } catch (e) {
        console.error('Failed to load crisis configuration', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const logAudit = async (action: string, before: any, after: any, details: string) => {
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
        }),
      });
    } catch (e) {
      console.error('Audit logging failed:', e);
    }
  };

  if (loading) {
    return (
      <AdminGuard pageTitle="Crisis Configuration" permissionCheck={(r) => hasCrisisPermission(r, 'crisis.config')}>
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading crisis configuration…</div>
      </AdminGuard>
    );
  }

  return (
    <AdminGuard pageTitle="Crisis Configuration" permissionCheck={(r) => hasCrisisPermission(r, 'crisis.config')}>
      <div
        className="admin-header-bar glass"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
      >
        <div>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>CRISIS CONFIGURATION</h1>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Recall groups, message templates, routing rules, messaging provider and acknowledgement rules for Crisis Management &amp; Emergency Recall (FSD §11.5).
          </p>
        </div>
        <Pill text={`Signed in as ${role}`} tone="muted" />
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '2px' }}>
        {([
          ['Groups', 'Recall Groups'],
          ['Templates', 'Message Templates'],
          ['Routing', 'Routing Rules'],
          ['Provider', 'Messaging Service'],
          ['Ack', 'Acknowledgement & Escalation'],
        ] as [TabKey, string][]).map(([key, text]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === key ? '3px solid var(--color-primary)' : '3px solid transparent',
              color: activeTab === key ? 'var(--color-primary-dark)' : 'var(--text-muted)',
              fontWeight: activeTab === key ? 700 : 500,
              fontSize: '13.5px',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.15s',
            }}
          >
            {text}
          </button>
        ))}
      </div>

      {activeTab === 'Groups' && <GroupsTab groups={groups} setGroups={setGroups} logAudit={logAudit} username={username} />}
      {activeTab === 'Templates' && <TemplatesTab templates={templates} setTemplates={setTemplates} rules={rules} logAudit={logAudit} />}
      {activeTab === 'Routing' && (
        <RoutingTab rules={rules} setRules={setRules} groups={groups} templates={templates} taxonomy={taxonomy} logAudit={logAudit} />
      )}
      {activeTab === 'Provider' && provider && <ProviderTab cfg={provider} setCfg={setProvider} templates={templates} logAudit={logAudit} />}
      {activeTab === 'Ack' && ack && <AckTab rule={ack} setRule={setAck} provider={provider} logAudit={logAudit} />}
    </AdminGuard>
  );
}

// ── Tab 1: Recall Groups (stories 1, 2) ───────────────────────────────────────

function GroupsTab({
  groups,
  setGroups,
  logAudit,
  username,
}: {
  groups: RecallGroup[];
  setGroups: (g: RecallGroup[]) => void;
  logAudit: (a: string, b: any, c: any, d: string) => Promise<void>;
  username: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [formGroupName, setFormGroupName] = useState('');
  const [formGroupDesc, setFormGroupDesc] = useState('');

  const persist = async (next: RecallGroup[], action: string, details: string, before: any) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/crisis-config/recall-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups: next, actor: username }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      setGroups(next);
      await logAudit(action, before, next, details);
    } catch (e: any) {
      alert(`Could not save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const openCreateGroup = () => {
    setFormGroupName('');
    setFormGroupDesc('');
    setIsGroupModalOpen(true);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formGroupName.trim()) return;
    const g: RecallGroup = {
      id: genId('rg'),
      name: formGroupName.trim(),
      description: formGroupDesc.trim(),
      status: 'Active',
      members: [],
    };
    await persist([...groups, g], 'Create Recall Group', `Created recall group "${g.name}".`, groups);
    setIsGroupModalOpen(false);
  };

  const toggleStatus = (g: RecallGroup) => {
    const next = groups.map((x) => (x.id === g.id ? { ...x, status: x.status === 'Active' ? ('Inactive' as const) : ('Active' as const) } : x));
    persist(next, 'Change Recall Group Status', `Recall group "${g.name}" set to ${g.status === 'Active' ? 'Inactive' : 'Active'}.`, groups);
  };

  // Contact-quality summary per group. This is the number that actually matters:
  // a recall group with 12 members and 4 bad numbers is a 8-person recall, and the
  // only moment anyone finds out is normally the crisis itself.
  const contactability = (g: RecallGroup) => {
    const active = g.members.filter((m) => m.membershipStatus === 'Active');
    const reachable = active.filter((m) => isValidSgMobile(m.mobile));
    return { total: active.length, reachable: reachable.length, bad: active.length - reachable.length };
  };

  return (
    <div className="glass" style={card}>
      <div style={sectionHead}>
        <div>
          <h2 style={h2}>RECALL GROUPS</h2>
          <p style={sub}>Who gets recalled in a crisis. Separate from Broadcast distribution groups (FSD §11.5.d) — this is master data, snapshotted at crisis trigger.</p>
        </div>
        <button
          onClick={openCreateGroup}
          disabled={saving}
          className="btn btn-primary"
          style={{ padding: '6px 12px', borderRadius: '4px', fontSize: '12.5px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}
        >
          + Create Group
        </button>
      </div>

      <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
        <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={thStyle}>Group Name</th>
              <th style={thStyle}>Description</th>
              <th style={{ ...thStyle, width: '100px' }}>Members</th>
              <th style={{ ...thStyle, width: '110px' }}>Status</th>
              <th style={{ ...thStyle, width: '160px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No recall groups configured. Nobody would be recalled by a crisis today.
                </td>
              </tr>
            ) : (
              groups.map((g) => {
                const totalActiveMembers = g.members.filter((m) => m.membershipStatus === 'Active').length;
                return (
                  <tr key={g.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{g.name}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{g.description || '—'}</td>
                    <td style={tdStyle}>{totalActiveMembers}</td>
                    <td style={tdStyle}>
                      <span className={`badge ${g.status === 'Active' ? 'badge-completed' : 'badge-live'}`} style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px' }}>
                        {g.status}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <Link
                        href={`/admin/crisis-config/recall-groups/${encodeURIComponent(g.id)}`}
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '11.5px', borderRadius: '4px', textDecoration: 'none', display: 'inline-block' }}
                      >
                        Manage Members
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p style={{ ...sub, marginTop: '14px' }}>
        Recall groups are deactivated, never deleted — an after-action report for a past crisis must still be able to name the group a responder was
        recalled from. Bulk member import (story 3) is phase 1c and is not built.
      </p>

      {isGroupModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '480px', padding: '24px', background: 'var(--bg-card)' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '20px' }}>Create Recall Group</h2>
            <form onSubmit={handleCreateGroup} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-sub)', marginBottom: '4px' }}>Group Name</label>
                <input type="text" required value={formGroupName} onChange={(e) => setFormGroupName(e.target.value)} style={input} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-sub)', marginBottom: '4px' }}>Description</label>
                <textarea rows={3} required value={formGroupDesc} onChange={(e) => setFormGroupDesc(e.target.value)} style={{ ...input, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsGroupModalOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Save Group</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 2: Message Templates (story 4) ────────────────────────────────────────

function TemplatesTab({
  templates,
  rules,
}: {
  templates: RecallMessageTemplate[];
  setTemplates: (t: RecallMessageTemplate[]) => void;
  rules: RecallRoutingRule[];
  logAudit: (a: string, b: any, c: any, d: string) => Promise<void>;
}) {
  const usage = (id: string) => rules.filter((r) => r.templateId === id).length;

  return (
    <div className="glass" style={card}>
      <div style={sectionHead}>
        <div>
          <h2 style={h2}>CRISIS MESSAGE TEMPLATES</h2>
          <p style={sub}>The exact words a recipient reads. A routing rule names the template to use.</p>
        </div>
        <Link
          href="/admin/crisis-config/templates/new"
          className="btn btn-primary"
          style={{ padding: '6px 12px', borderRadius: '4px', fontSize: '12.5px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff', textDecoration: 'none' }}
        >
          + New Template
        </Link>
      </div>

      <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
        <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={thStyle}>Template</th>
              <th style={thStyle}>Rendered size</th>
              <th style={{ ...thStyle, width: '110px' }}>Used by</th>
              <th style={{ ...thStyle, width: '110px' }}>Status</th>
              <th style={{ ...thStyle, width: '100px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No crisis message templates configured.
                </td>
              </tr>
            ) : (
              templates.map((t) => {
                const seg = smsSegmentInfo(renderPlaceholders(t.body));
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{t.name}</td>
                    <td style={tdStyle}>
                      <span className={`badge ${seg.segments > 2 ? 'badge-critical' : 'badge-completed'}`} style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px' }}>
                        {seg.length} chars · {seg.segments} seg · {seg.encoding}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-sub)' }}>{usage(t.id)} rule(s)</td>
                    <td style={tdStyle}>
                      <span className={`badge ${t.status === 'Active' ? 'badge-completed' : 'badge-live'}`} style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px' }}>
                        {t.status}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <Link
                        href={`/admin/crisis-config/templates/${encodeURIComponent(t.id)}`}
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '11.5px', borderRadius: '4px', textDecoration: 'none' }}
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface MultiSelectOption {
  value: string;
  label: string;
  badge?: string;
}

function DropdownMultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Select options...',
}: {
  options: (string | MultiSelectOption)[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const normalizedOptions: MultiSelectOption[] = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  const toggle = (val: string) => {
    const next = selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val];
    onChange(next);
  };

  const getDisplayText = () => {
    if (!selected || selected.length === 0) return placeholder;
    const selectedLabels = selected.map(
      (val) => normalizedOptions.find((o) => o.value === val)?.label || val
    );
    if (selectedLabels.length <= 2) return selectedLabels.join(', ');
    return `${selectedLabels.slice(0, 2).join(', ')} (+${selectedLabels.length - 2} more)`;
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          ...input,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          background: 'var(--bg-inset)',
          boxShadow: isOpen ? '0 0 0 2px rgba(255, 130, 0, 0.25)' : 'none',
          borderColor: isOpen ? 'var(--color-primary, #FF8200)' : 'var(--border-color)',
          userSelect: 'none',
        }}
      >
        <span
          style={{
            color: selected && selected.length > 0 ? 'var(--text-main)' : 'var(--text-muted)',
            fontSize: '13px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {getDisplayText()}
        </span>
        <span
          style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            marginLeft: '8px',
            transition: 'transform 0.2s',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          ▼
        </span>
      </div>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 1100,
            background: 'var(--bg-card, #FFFFFF)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
            maxHeight: '220px',
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {normalizedOptions.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: '12.5px', color: 'var(--text-muted)' }}>
              No options available
            </div>
          ) : (
            normalizedOptions.map((opt) => {
              const isChecked = selected.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    padding: '8px 12px',
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    background: isChecked ? 'var(--sidebar-active-bg, #FFF7ED)' : 'transparent',
                    color: isChecked ? 'var(--color-primary-dark, #FF8200)' : 'var(--text-main)',
                    fontWeight: isChecked ? 600 : 400,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(opt.value)}
                      style={{ accentColor: 'var(--color-primary, #FF8200)', cursor: 'pointer' }}
                    />
                    <span>{opt.label}</span>
                  </div>
                  {opt.badge && (
                    <span style={{ fontSize: '11px', color: 'var(--color-critical)', opacity: 0.85 }}>
                      {opt.badge}
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Routing Rules (story 5, includes "test rule") ──────────────────────

function RoutingTab({
  rules,
  setRules,
  groups,
  templates,
  taxonomy,
  logAudit,
}: {
  rules: RecallRoutingRule[];
  setRules: (r: RecallRoutingRule[]) => void;
  groups: RecallGroup[];
  templates: RecallMessageTemplate[];
  taxonomy: Record<string, string[]>;
  logAudit: (a: string, b: any, c: any, d: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<RecallRoutingRule | null>(null);
  const [saving, setSaving] = useState(false);


  const incidentTypes = Object.keys(taxonomy);

  const persist = async (next: RecallRoutingRule[], action: string, details: string, before: any) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/crisis-config/routing-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      setRules(next);
      await logAudit(action, before, next, details);
    } catch (e: any) {
      alert(`Could not save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const startNew = () =>
    setEditing({
      id: genId('rr'),
      name: '',
      crisisLevels: [],
      incidentTypes: [],
      incidentSubTypes: [],
      zones: [],
      timeOfDay: 'Any',
      targetGroupIds: [],
      templateId: undefined,
      status: 'Active',
    });

  const save = () => {
    if (!editing) return;
    if (!editing.name.trim()) return alert('Rule name is required.');
    if (editing.targetGroupIds.length === 0) return alert('A rule with no target recall group would recall nobody.');
    const exists = rules.some((r) => r.id === editing.id);
    const next = exists ? rules.map((r) => (r.id === editing.id ? editing : r)) : [...rules, editing];
    persist(next, exists ? 'Edit Recall Routing Rule' : 'Create Recall Routing Rule', `Routing rule "${editing.name}" saved.`, rules);
    setEditing(null);
  };

  const groupName = (id: string) => groups.find((g) => g.id === id)?.name || id;

  const availableSubTypes = editing
    ? Array.from(
        new Set(
          editing.incidentTypes && editing.incidentTypes.length > 0
            ? editing.incidentTypes.flatMap((it) => taxonomy[it] || [])
            : Object.values(taxonomy).flat()
        )
      )
    : [];

  return (
    <div className="glass" style={card}>
      <div style={sectionHead}>
        <div>
          <h2 style={h2}>RECALL ROUTING RULES</h2>
          <p style={sub}>Which recall groups are contacted for which crises, and with which template.</p>
        </div>
        <button onClick={startNew} className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '12.5px' }}>
          + New Rule
        </button>
      </div>

      <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr>
            <th>Rule</th>
            <th>Conditions</th>
            <th>Recalls</th>
            <th>Template</th>
            <th>Status</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rules.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No routing rules. Every crisis would be created with an empty recipient list.
              </td>
            </tr>
          )}
          {rules.map((r) => (
            <tr key={r.id}>
              <td style={{ fontWeight: 600, fontSize: '13px' }}>{r.name}</td>
              <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {r.crisisLevels.length ? r.crisisLevels.join(', ') : 'Any level'} · {r.incidentTypes.length ? r.incidentTypes.join(', ') : 'Any type'}
                {r.incidentSubTypes && r.incidentSubTypes.length ? ` (${r.incidentSubTypes.join(', ')})` : ''}
              </td>
              <td style={{ fontSize: '12.5px' }}>{r.targetGroupIds.map(groupName).join(', ') || '—'}</td>
              <td style={{ fontSize: '12.5px' }}>{templates.find((t) => t.id === r.templateId)?.name || <Pill text="none" tone="warn" />}</td>
              <td>
                <Pill text={r.status} tone={r.status === 'Active' ? 'ok' : 'muted'} />
              </td>
              <td style={{ textAlign: 'right' }}>
                <button onClick={() => setEditing({ ...r })} className="btn btn-secondary" style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '12px' }}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '640px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', padding: 0, overflow: 'hidden', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', border: '1px solid var(--border-color)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-inset)' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-main)', fontFamily: 'var(--font-headline)' }}>
                {rules.some((r) => r.id === editing.id) ? 'Edit Recall Routing Rule' : 'New Recall Routing Rule'}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
              <div>
                <label style={label}>Rule name</label>
                <input style={input} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Level 1 — recall Crisis Command" />
              </div>

              <div>
                <label style={label}>Crisis levels — none selected means any level</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {CRISIS_LEVELS.map((lv) => (
                    <label key={lv} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editing.crisisLevels.includes(lv)}
                        onChange={(e) =>
                          setEditing({ ...editing, crisisLevels: e.target.checked ? [...editing.crisisLevels, lv] : editing.crisisLevels.filter((x) => x !== lv) })
                        }
                      />
                      {lv}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={label}>Incident types — none selected means any type</label>
                <DropdownMultiSelect
                  options={incidentTypes}
                  selected={editing.incidentTypes}
                  onChange={(next) =>
                    setEditing({
                      ...editing,
                      incidentTypes: next,
                      incidentSubTypes: (editing.incidentSubTypes || []).filter((st) => {
                        if (next.length === 0) return true;
                        const validForNext = next.flatMap((it) => taxonomy[it] || []);
                        return validForNext.includes(st);
                      }),
                    })
                  }
                  placeholder="Select incident types (none = any type)"
                />
              </div>

              <div>
                <label style={label}>Incident sub-types — none selected means any sub-type</label>
                <DropdownMultiSelect
                  options={availableSubTypes}
                  selected={editing.incidentSubTypes || []}
                  onChange={(next) => setEditing({ ...editing, incidentSubTypes: next })}
                  placeholder="Select incident sub-types (none = any sub-type)"
                />
              </div>

              <div>
                <label style={label}>Template</label>
                <select style={input} value={editing.templateId || ''} onChange={(e) => setEditing({ ...editing, templateId: e.target.value || undefined })}>
                  <option value="">None</option>
                  {templates
                    .filter((t) => t.status === 'Active')
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label style={label}>Recall these groups</label>
                <DropdownMultiSelect
                  options={groups.map((g) => ({
                    value: g.id,
                    label: g.name,
                    badge: g.status === 'Inactive' ? 'Inactive' : undefined,
                  }))}
                  selected={editing.targetGroupIds}
                  onChange={(next) => setEditing({ ...editing, targetGroupIds: next })}
                  placeholder="Select recall groups..."
                />
              </div>

              <div>
                <label style={label}>Status</label>
                <select style={{ ...input, maxWidth: '200px' }} value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as any })}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: 'var(--bg-inset)' }}>
              <button onClick={() => setEditing(null)} className="btn btn-secondary" style={{ padding: '8px 18px', borderRadius: '6px', fontSize: '12.5px' }}>
                Cancel
              </button>
              <button onClick={save} disabled={saving} className="btn btn-primary" style={{ padding: '8px 18px', borderRadius: '6px', fontSize: '12.5px' }}>
                {saving ? 'Saving…' : 'Save Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 4: Messaging Service (stories 6, 7) ───────────────────────────────────

function ProviderTab({
  cfg,
  setCfg,
  templates,
  logAudit,
}: {
  cfg: MessagingServiceConfig;
  setCfg: (c: MessagingServiceConfig) => void;
  templates: RecallMessageTemplate[];
  logAudit: (a: string, b: any, c: any, d: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<MessagingServiceConfig>(cfg);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testTpl, setTestTpl] = useState('');
  const [testOut, setTestOut] = useState<any>(null);
  const [sending, setSending] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/crisis-config/messaging-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      setCfg(json.config);
      setDraft(json.config);
      await logAudit('Edit Messaging Service Settings', cfg, json.config, `Provider "${draft.provider}", sender "${draft.senderId}".`);
    } catch (e: any) {
      alert(`Could not save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setSending(true);
    setTestOut(null);
    try {
      const res = await fetch('/api/admin/crisis-config/test-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: testTo, templateId: testTpl || undefined, message: testTpl ? undefined : 'Sentosa CMS crisis config test message.' }),
      });
      setTestOut(await res.json());
    } catch (e: any) {
      setTestOut({ error: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="glass" style={card}>
      <div style={sectionHead}>
        <div>
          <h2 style={h2}>MESSAGING SERVICE</h2>
          <p style={sub}>SMS provider, sender identity, retry and failover. Admin / IT only.</p>
        </div>
      </div>

      <Note tone="warn">
        <strong>No provider is selected yet and this is the module&apos;s longest-lead dependency.</strong> Provider selection, credentials and sandbox
        access block Epic 4 entirely and are measured in weeks, not days (build plan §9 — owner: Shin Feng / IT). Until then this page writes
        configuration only, and the test message below goes to the prototype mock gateway.
      </Note>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', maxWidth: '820px' }}>
        <div>
          <label style={label}>Provider</label>
          <input style={input} value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value })} placeholder="e.g. Twilio, Wavecell" />
        </div>
        <div>
          <label style={label}>Sender ID</label>
          <input style={input} value={draft.senderId} onChange={(e) => setDraft({ ...draft, senderId: e.target.value })} />
          {senderIdIsAlphanumeric(draft.senderId) && (
            <p style={{ fontSize: '11.5px', color: 'var(--color-critical)', marginTop: '4px' }}>
              Alphanumeric sender IDs are <strong>send-only</strong>. Reply-keyword acknowledgement cannot work with this sender — replies are silently
              discarded by the network. A two-way long or short code is required (build plan §9).
            </p>
          )}
        </div>
        <div>
          <label style={label}>API credentials reference</label>
          <input
            style={input}
            type="password"
            value={draft.apiKeyRef}
            onChange={(e) => setDraft({ ...draft, apiKeyRef: e.target.value })}
            placeholder="Leave masked to keep the stored value"
          />
          <p style={{ ...sub, marginTop: '4px' }}>Stored server-side and never returned in full. Leave untouched to keep the existing value.</p>
        </div>
        <div>
          <label style={label}>Failover provider</label>
          <input style={input} value={draft.failoverProvider} onChange={(e) => setDraft({ ...draft, failoverProvider: e.target.value })} />
        </div>
        <div>
          <label style={label}>Retry attempts</label>
          <input style={input} type="number" value={draft.retryAttempts} onChange={(e) => setDraft({ ...draft, retryAttempts: Number(e.target.value) })} />
        </div>
        <div>
          <label style={label}>Retry interval (seconds)</label>
          <input style={input} type="number" value={draft.retryIntervalSeconds} onChange={(e) => setDraft({ ...draft, retryIntervalSeconds: Number(e.target.value) })} />
        </div>
        <div>
          <label style={label}>Rate limit (messages / minute)</label>
          <input style={input} type="number" value={draft.rateLimitPerMinute} onChange={(e) => setDraft({ ...draft, rateLimitPerMinute: Number(e.target.value) })} />
          <p style={{ ...sub, marginTop: '4px' }}>
            Dispatch target is 500 recipients within 60 seconds (build plan §10) — a rate limit below that silently stretches a recall past its SLA.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'flex-end' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px' }}>
            <input type="checkbox" checked={draft.quietHoursOverride} onChange={(e) => setDraft({ ...draft, quietHoursOverride: e.target.checked })} />
            Override quiet hours for crisis recalls
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px' }}>
            <input type="checkbox" checked={draft.simulationMode} onChange={(e) => setDraft({ ...draft, simulationMode: e.target.checked })} />
            Simulation mode — restrict all sending to the test numbers below
          </label>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={label}>Test numbers (comma or newline separated)</label>
          <textarea style={{ ...input, minHeight: '60px' }} value={draft.testNumbers} onChange={(e) => setDraft({ ...draft, testNumbers: e.target.value })} placeholder="+6591234567, +6598765432" />
        </div>
      </div>

      <Note>
        <strong>Leave simulation mode on until the provider is live.</strong> Crisis features are otherwise untestable outside a real incident (build
        plan §10, Testability) — and the failure mode of testing without it is recalling live responders for a configuration check.
      </Note>

      <button onClick={save} disabled={saving} className="btn btn-primary" style={{ padding: '8px 18px', borderRadius: '6px', fontSize: '12.5px' }}>
        {saving ? 'Saving…' : 'Save Messaging Settings'}
      </button>

      {/* Story 7 — send test message */}
      <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
        <h3 style={{ ...h2, fontSize: '13px', marginBottom: '4px' }}>SEND TEST MESSAGE</h3>
        <p style={{ ...sub, marginBottom: '12px' }}>Sends to one explicitly typed number. There is deliberately no &quot;send to group&quot; option here.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', alignItems: 'end', maxWidth: '700px' }}>
          <div>
            <label style={label}>Test mobile</label>
            <input style={input} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="+6591234567" />
          </div>
          <div>
            <label style={label}>Template (optional)</label>
            <select style={input} value={testTpl} onChange={(e) => setTestTpl(e.target.value)}>
              <option value="">Plain test message</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <button onClick={sendTest} disabled={sending || !testTo} className="btn btn-secondary" style={{ padding: '9px 18px', borderRadius: '6px', fontSize: '12.5px' }}>
            {sending ? 'Sending…' : 'Send Test'}
          </button>
        </div>

        {testOut && (
          <div style={{ marginTop: '12px', background: 'var(--bg-inset)', borderRadius: '8px', padding: '12px', fontSize: '12.5px' }}>
            {testOut.error ? (
              <p style={{ color: 'var(--color-critical)', margin: 0 }}>{testOut.error}</p>
            ) : (
              <>
                <p style={{ margin: '0 0 6px' }}>
                  <Pill text="Sent to mock gateway" tone="ok" /> <strong>{testOut.to}</strong>
                </p>
                <p style={{ margin: '0 0 6px', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{testOut.sent}</p>
                {(testOut.warnings || []).map((w: string, i: number) => (
                  <p key={i} style={{ color: 'var(--color-critical)', margin: '0 0 4px' }}>
                    {w}
                  </p>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab 5: Acknowledgement & Escalation (story 8) ─────────────────────────────

function AckTab({
  rule,
  setRule,
  provider,
  logAudit,
}: {
  rule: AckEscalationRule;
  setRule: (r: AckEscalationRule) => void;
  provider: MessagingServiceConfig | null;
  logAudit: (a: string, b: any, c: any, d: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AckEscalationRule>(rule);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/crisis-config/ack-escalation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      setRule(json.rule);
      setDraft(json.rule);
      await logAudit(
        'Edit Acknowledgement & Escalation Rules',
        rule,
        json.rule,
        `Ack window ${draft.ackWindowMinutes}m, ${draft.ladder.length} escalation step(s).`
      );
    } catch (e: any) {
      alert(`Could not save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const updateStep = (id: string, patch: Partial<EscalationStep>) =>
    setDraft({ ...draft, ladder: draft.ladder.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const addStep = () =>
    setDraft({
      ...draft,
      ladder: [...draft.ladder, { id: genId('esc'), afterMinutes: (draft.ladder.at(-1)?.afterMinutes || 0) + 5, action: 'Resend SMS' }],
    });

  const removeStep = (id: string) => setDraft({ ...draft, ladder: draft.ladder.filter((s) => s.id !== id) });

  return (
    <div className="glass" style={card}>
      <div style={sectionHead}>
        <div>
          <h2 style={h2}>ACKNOWLEDGEMENT &amp; ESCALATION</h2>
          <p style={sub}>Configure acknowledgement requirements, reminder rules, and escalation ladder for crisis recall.</p>
        </div>
      </div>

      <Note tone="warn">
        <strong>Every value on this tab is a placeholder.</strong> Ack window, reminder timings and escalation ladder have not been agreed by Ops — the workshop
        to set them is a build plan §9 dependency and must happen before Phase 1b. Do not present these numbers to stakeholders as confirmed rules.
      </Note>

      {/* ── Block 1: Acknowledgement Requirements ── */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ ...sectionHead, marginBottom: '10px' }}>
          <div>
            <h3 style={{ ...h2, fontSize: '13px', color: 'var(--color-primary)' }}>1 · ACKNOWLEDGEMENT REQUIREMENTS</h3>
            <p style={sub}>Rules governing how responders acknowledge or decline recall dispatches.</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px', fontSize: '12px', color: 'var(--text-muted)' }}>
          <div style={{ padding: '8px 12px', background: 'var(--bg-inset)', borderRadius: '6px', borderLeft: '3px solid var(--border-color)' }}>
            <strong>Scope:</strong> Applies globally to all crisis levels (Level 1 and Level 2).
          </div>
          <div style={{ padding: '8px 12px', background: 'var(--bg-inset)', borderRadius: '6px', borderLeft: '3px solid var(--border-color)' }}>
            <strong>Rule Enforcement:</strong> Acknowledgement is mandatory for all recall messages. Stand-down messages do not require acknowledgement.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', maxWidth: '820px' }}>
          <div>
            <label style={label}>Acknowledgement window (minutes)</label>
            <input style={input} type="number" min={1} value={draft.ackWindowMinutes} onChange={(e) => setDraft({ ...draft, ackWindowMinutes: Number(e.target.value) })} />
          </div>
          <div>
            <label style={label}>Acknowledge keywords</label>
            <input style={input} value={draft.ackKeywords} onChange={(e) => setDraft({ ...draft, ackKeywords: e.target.value })} disabled={!draft.ackMethodKeyword} />
          </div>
        </div>

        <div style={{ marginTop: '16px' }}>
          <label style={label}>Acknowledgement methods</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px' }}>
              <input type="checkbox" checked={draft.ackMethodKeyword} onChange={(e) => setDraft({ ...draft, ackMethodKeyword: e.target.checked })} style={{ marginTop: '3px' }} />
              <span>
                <strong>SMS reply keyword</strong> — recipient replies YES or NO. Works on any handset with no internet, but requires a two-way number.
              </span>
            </label>
          </div>
          {draft.ackMethodKeyword && provider && senderIdIsAlphanumeric(provider.senderId) && (
            <p style={{ fontSize: '12px', color: 'var(--color-critical)', marginTop: '8px' }}>
              Reply-keyword acknowledgement is enabled, but the configured sender ID &quot;{provider.senderId}&quot; is alphanumeric and cannot receive
              inbound SMS. Every reply would be silently discarded. Either obtain a two-way number or leave this method off.
            </p>
          )}
          {!draft.ackMethodKeyword && (
            <p style={{ fontSize: '12px', color: 'var(--color-critical)', marginTop: '8px' }}>
              No acknowledgement method is enabled. The system will prevent saving this configuration.
            </p>
          )}
        </div>
      </div>

      {/* ── Block 2: Escalation Ladder ── */}
      <div style={{ marginTop: '22px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
        <div style={sectionHead}>
          <div>
            <h3 style={{ ...h2, fontSize: '13px', color: 'var(--color-primary)' }}>2 · ESCALATION LADDER</h3>
            <p style={sub}>Actions taken automatically when non-responders remain silent. Timings measured from initial dispatch.</p>
          </div>
          <button onClick={addStep} className="btn btn-secondary" style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px' }}>
            + Add Step
          </button>
        </div>

        <div style={{ padding: '8px 12px', background: 'var(--bg-inset)', borderRadius: '6px', marginBottom: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
          <strong>Time Base:</strong> All ladder step timings are measured from initial dispatch (firstSentAt). Timing is fixed and never resets on re-sends or reminders.
        </div>

        <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              <th style={{ width: '140px' }}>After (minutes)</th>
              <th style={{ width: '240px' }}>Action</th>
              <th>Note</th>
              <th style={{ textAlign: 'right', width: '90px' }} />
            </tr>
          </thead>
          <tbody>
            {draft.ladder.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '16px', fontSize: '12.5px', color: 'var(--text-muted)' }}>
                  No escalation steps configured.
                </td>
              </tr>
            )}
            {draft.ladder.map((s) => (
              <tr key={s.id}>
                <td>
                  <input style={input} type="number" min={1} value={s.afterMinutes} onChange={(e) => updateStep(s.id, { afterMinutes: Number(e.target.value) })} />
                </td>
                <td>
                  <select style={input} value={s.action} onChange={(e) => updateStep(s.id, { action: e.target.value as EscalationStep['action'] })}>
                    <option>Resend SMS</option>
                    <option>Notify Duty Manager</option>
                  </select>
                </td>
                <td>
                  <input style={input} value={s.note || ''} onChange={(e) => updateStep(s.id, { note: e.target.value })} />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button onClick={() => removeStep(s.id)} className="btn btn-secondary" style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '12px' }}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={save} disabled={saving} className="btn btn-primary" style={{ padding: '8px 18px', borderRadius: '6px', fontSize: '12.5px', marginTop: '24px' }}>
        {saving ? 'Saving…' : 'Save Acknowledgement & Escalation Rules'}
      </button>
    </div>
  );
}
