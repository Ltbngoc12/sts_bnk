'use client';

// Broadcast Configuration — admin redesign (2026-07-25, per Kyle + see
// BROADCAST_CONFIG_PAGE_REDESIGN_PLAN.md at repo root for the full gap analysis
// and phased plan this implements).
//
// 5 tabs: Template / Routing Matrix / End-of-Day broadcast timing / Action Prompt
// Rules / Distribution Groups. Everything here reads/writes the REAL backend built
// in src/lib/broadcastStore.ts (Mongo) via the /api/admin/broadcast-* routes — the
// previous version of this page stored everything in localStorage and was fully
// disconnected from the broadcast dispatch logic that actually runs in
// src/app/api/incidents/[...id]/route.ts (`close` action) and
// src/app/api/cron/eod-broadcast/route.ts. No localStorage is used anywhere below.
//
// Delivery Channel *management* (Email/Push gateway settings) is intentionally NOT
// a tab here — Kyle's spec lists exactly the tabs above. Channels are still
// fetched read-only from /api/admin/broadcast-channels to populate the Delivery
// Channel checkboxes on the Routing Matrix tab.
//
// Distribution Groups tab (added 2026-07-27, Kyle — confirmed with client) moved in
// from the old shared /admin/distribution-groups page. Broadcast's recipient groups
// are now a SEPARATE dataset from the Task module's (now the "Task Distribution"
// tab on /admin/task-configuration) — this tab fetches/saves
// /api/admin/broadcast-distribution-groups, its own Mongo collection, not the Task
// module's. See DEFAULT_BROADCAST_DISTRIBUTION_GROUPS in broadcastConfig.ts.

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminGuard } from '@/components/AdminGuard';
import { useRole } from '@/context/RoleContext';
import { hasBroadcastPermission, BROADCAST_RECIPIENT_ROLE_OPTIONS } from '@/lib/permissions';
import {
  BROADCAST_TYPES,
  CRISIS_LEVELS,
  DEFAULT_BROADCAST_CONFIG,
  DEFAULT_BROADCAST_PROMPT_RULES,
} from '@/lib/broadcastConfig';
import type {
  BroadcastTemplate,
  BroadcastMatrixRule,
  BroadcastChannel,
  BroadcastConfig,
  BroadcastActionPromptRule,
  BroadcastPromptTrigger,
} from '@/lib/broadcastConfig';
import { getIncidentTaxonomy } from '@/lib/taxonomy';
import { INCIDENT_CATEGORIES } from '@/lib/incidentCategory';
import type { DistributionGroup } from '@/lib/groups';

type TabKey = 'Template' | 'Matrix' | 'EOD' | 'PromptRules' | 'Groups';
const ANY = 'Any';

const TRIGGER_LABELS: Record<BroadcastPromptTrigger, string> = {
  closure_broadcast_queued: 'Closure Broadcast Queued (Incident closed, broadcast required)',
  eod_broadcast_queued: 'End-of-Day Broadcast Queued (interim queue built)',
  media_present_confirmed: 'Media Presence Confirmed (§10.8 — notify SDC Communications)',
};
const TRIGGER_OPTIONS: BroadcastPromptTrigger[] = ['closure_broadcast_queued', 'eod_broadcast_queued', 'media_present_confirmed'];

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

// Normalize documents fetched from Mongo into the current shape. Needed because
// this page's schema changed twice in the same session (added `status`, then
// converted several fields to arrays for multi-select, 2026-07-25) — any doc
// seeded/saved before those changes lacks the new fields, which would otherwise
// crash the UI (e.g. `.join()` on undefined). Normalizing on read means the page
// never crashes on legacy data, and it self-heals the moment that row is saved
// again (the API always writes the current shape).
function normalizeTemplate(t: any): BroadcastTemplate {
  return { ...t, status: t.status === 'Inactive' ? 'Inactive' : 'Active' };
}

function normalizeMatrixRule(r: any): BroadcastMatrixRule {
  return {
    ...r,
    crisisLevels: Array.isArray(r.crisisLevels) ? r.crisisLevels : r.crisisLevel ? [r.crisisLevel] : [ANY],
    incidentTypes: Array.isArray(r.incidentTypes) ? r.incidentTypes : r.incidentType ? [r.incidentType] : [ANY],
    incidentSubTypes: Array.isArray(r.incidentSubTypes) ? r.incidentSubTypes : r.incidentSubType ? [r.incidentSubType] : [ANY],
    recipientGroups: Array.isArray(r.recipientGroups) ? r.recipientGroups : r.recipientGroup ? [r.recipientGroup] : [],
    deliveryChannels: Array.isArray(r.deliveryChannels) ? r.deliveryChannels : [],
    status: r.status === 'Inactive' ? 'Inactive' : 'Active',
  };
}

function normalizePromptRule(r: any): BroadcastActionPromptRule {
  return {
    ...r,
    recipientRoles: Array.isArray(r.recipientRoles) ? r.recipientRoles : r.recipientRole ? [r.recipientRole] : [],
    status: r.status === 'Inactive' ? 'Inactive' : 'Active',
  };
}

export default function BroadcastConfigPage() {
  const { username } = useRole();
  const [activeTab, setActiveTab] = useState<TabKey>('Template');
  const [loading, setLoading] = useState(true);

  const [templates, setTemplates] = useState<BroadcastTemplate[]>([]);
  const [matrix, setMatrix] = useState<BroadcastMatrixRule[]>([]);
  const [channels, setChannels] = useState<BroadcastChannel[]>([]);
  const [config, setConfig] = useState<BroadcastConfig>(DEFAULT_BROADCAST_CONFIG);
  const [promptRules, setPromptRules] = useState<BroadcastActionPromptRule[]>([]);
  const [groups, setGroups] = useState<DistributionGroup[]>([]);
  const [taxonomy, setTaxonomy] = useState<Record<string, string[]>>({});

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isAuditOpen, setIsAuditOpen] = useState(false);

  useEffect(() => {
    // Incident Type/Sub-type: snapshot taxonomy only (decided with Kyle 2026-07-25 —
    // no /api/admin/taxonomy this round; see plan doc §8.3). Read client-side.
    setTaxonomy(getIncidentTaxonomy());

    (async () => {
      try {
        const [t, m, c, cfg, pr, g] = await Promise.all([
          fetch('/api/admin/broadcast-templates').then((r) => r.json()),
          fetch('/api/admin/broadcast-matrix').then((r) => r.json()),
          fetch('/api/admin/broadcast-channels').then((r) => r.json()),
          fetch('/api/admin/broadcast-config').then((r) => r.json()),
          fetch('/api/admin/broadcast-prompt-rules').then((r) => r.json()),
          fetch('/api/admin/broadcast-distribution-groups').then((r) => r.json()),
        ]);
        setTemplates((Array.isArray(t) ? t : []).map(normalizeTemplate));
        setMatrix((Array.isArray(m) ? m : []).map(normalizeMatrixRule));
        setChannels(Array.isArray(c) ? c : []);
        setConfig(cfg && cfg.endOfDayTime ? cfg : DEFAULT_BROADCAST_CONFIG);
        setPromptRules((Array.isArray(pr) ? pr : []).map(normalizePromptRule));
        setGroups(Array.isArray(g) ? g : []);
      } catch (e) {
        console.error('Failed to load broadcast configuration', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadAudit = async () => {
    try {
      const res = await fetch('/api/admin/audit');
      const data = await res.json();
      setAuditLogs(Array.isArray(data) ? data.filter((l: any) => l.module === 'Broadcast Configuration') : []);
    } catch (e) {
      console.error('Failed to load audit log', e);
    }
  };

  const openAudit = () => {
    setIsAuditOpen(true);
    loadAudit();
  };

  const logAudit = async (action: string, before: any, after: any, details: string) => {
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
        }),
      });
    } catch (e) {
      console.error('Audit logging failed:', e);
    }
  };

  const incidentTypeOptions = [ANY, ...Object.keys(taxonomy)];
  // Multi-value variant for the Routing Matrix tab — union of sub-types across all
  // selected incident types.
  const subTypeOptionsForMulti = (incidentTypes: string[] | undefined) => {
    if (!incidentTypes || incidentTypes.length === 0 || incidentTypes.includes(ANY)) return [ANY];
    const set = new Set<string>();
    incidentTypes.forEach((it) => (taxonomy[it] || []).forEach((st) => set.add(st)));
    return [ANY, ...Array.from(set)];
  };
  const activeGroups = groups.filter((g) => g.status === 'Active');

  if (loading) {
    return (
      <AdminGuard pageTitle="Broadcast Configuration" permissionCheck={(r) => hasBroadcastPermission(r, 'broadcast.config')}>
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading broadcast configuration…</div>
      </AdminGuard>
    );
  }

  return (
    <AdminGuard pageTitle="Broadcast Configuration" permissionCheck={(r) => hasBroadcastPermission(r, 'broadcast.config')}>
      <div className="admin-header-bar glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>BROADCAST CONFIGURATION</h1>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Templates, routing matrix, end-of-day timing, action prompt rules and distribution groups for the Broadcast &amp; Notification Framework.</p>
        </div>
        <button onClick={openAudit} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '12.5px' }}>
          View Change History
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '2px' }}>
        {([
          ['Template', 'Template'],
          ['Groups', 'Distribution Groups'],
          ['Matrix', 'Routing Matrix'],
          ['PromptRules', 'Action Prompt Rules'],
          ['EOD', 'End-of-Day Broadcast Timing'],
        ] as [TabKey, string][]).map(([key, label]) => (
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
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'Template' && (
        <TemplateTab templates={templates} matrix={matrix} />
      )}

      {activeTab === 'Matrix' && (
        <MatrixTab
          matrix={matrix}
          setMatrix={setMatrix}
          templates={templates}
          activeGroups={activeGroups}
          channels={channels}
          taxonomy={taxonomy}
          incidentTypeOptions={incidentTypeOptions}
          subTypeOptionsForMulti={subTypeOptionsForMulti}
          logAudit={logAudit}
        />
      )}

      {activeTab === 'EOD' && <EodTimingTab config={config} setConfig={setConfig} logAudit={logAudit} />}

      {activeTab === 'PromptRules' && (
        <PromptRulesTab promptRules={promptRules} setPromptRules={setPromptRules} logAudit={logAudit} />
      )}

      {activeTab === 'Groups' && (
        <GroupsTab groups={groups} setGroups={setGroups} logAudit={logAudit} />
      )}

      {isAuditOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '720px', maxHeight: '80vh', overflowY: 'auto', padding: '24px', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', margin: 0 }}>Broadcast Configuration — Change History</h2>
              <button onClick={() => setIsAuditOpen(false)} className="btn btn-secondary" style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px' }}>Close</button>
            </div>
            {auditLogs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No changes recorded yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {auditLogs.map((log) => (
                  <div key={log.id} style={{ padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <span>{new Date(log.timestamp).toLocaleString()}</span>
                      <span>{log.user}</span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '13px', marginTop: '4px' }}>{log.action}</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-sub)', marginTop: '2px' }}>{log.details}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AdminGuard>
  );
}

// ── Tab 1: Template ────────────────────────────────────────────────────────────

// This tab is now a browsable, grouped list ONLY — editing/preview/history live on
// their own page at /admin/broadcast-config/templates/[id] (2026-07-25, Kyle: (1)
// Incident Type/Sub-type/Crisis Level removed from Template entirely — see
// BroadcastTemplate comment in broadcastConfig.ts; (2) multiple templates per
// Broadcast Type is the normal case, not a special one, so the list groups by
// type instead of implying 1:1; (3) a dedicated route means a template is
// deep-linkable, e.g. from an audit log entry).
function TemplateTab({
  templates,
  matrix,
}: {
  templates: BroadcastTemplate[];
  matrix: BroadcastMatrixRule[];
}) {
  const router = useRouter();
  const usageCount = (templateId: string) => matrix.filter((r) => r.templateId === templateId).length;

  // Single flat table with a Type column (2026-07-25, Kyle feedback — grouped
  // blocks were harder to scan than one table), sorted so templates still cluster
  // by Broadcast Type (in BROADCAST_TYPES order) without needing separate sections.
  const knownTypes: readonly string[] = BROADCAST_TYPES;
  const typeOrder = (category: string) => {
    const i = knownTypes.indexOf(category);
    return i === -1 ? knownTypes.length : i;
  };
  const sortedTemplates = [...templates].sort((a, b) => typeOrder(a.category) - typeOrder(b.category));

  return (
    <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', color: 'var(--text-main)', margin: 0 }}>BROADCAST TEMPLATES</h2>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Multiple templates per Broadcast Type are supported — a Routing Matrix Rule picks the exact one to use.
          </p>
        </div>
        <button
          onClick={() => router.push('/admin/broadcast-config/templates/new')}
          className="btn btn-primary"
          style={{ padding: '6px 12px', borderRadius: '4px', fontSize: '12px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}
        >
          Add new template
        </button>
      </div>

      {templates.length === 0 ? (
        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>No templates yet.</p>
      ) : (
        <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Subject</th>
                <th style={thStyle}>Used By</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, width: '100px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedTemplates.map((tpl) => (
                <tr key={tpl.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{tpl.category}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{tpl.name}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tpl.subject || '(no subject)'}
                  </td>
                  <td style={tdStyle}>{usageCount(tpl.id)} rule{usageCount(tpl.id) !== 1 ? 's' : ''}</td>
                  <td style={tdStyle}>
                    <span className={`badge ${tpl.status === 'Active' ? 'badge-completed' : 'badge-live'}`} style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px' }}>{tpl.status}</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <Link
                      href={`/admin/broadcast-config/templates/${tpl.id}`}
                      className="btn btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '11.5px', borderRadius: '4px', textDecoration: 'none' }}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab 2: Routing Matrix ───────────────────────────────────────────────────────

function MatrixTab({
  matrix,
  setMatrix,
  templates,
  activeGroups,
  channels,
  taxonomy,
  incidentTypeOptions,
  subTypeOptionsForMulti,
  logAudit,
}: {
  matrix: BroadcastMatrixRule[];
  setMatrix: (m: BroadcastMatrixRule[]) => void;
  templates: BroadcastTemplate[];
  activeGroups: DistributionGroup[];
  channels: BroadcastChannel[];
  taxonomy: Record<string, string[]>;
  incidentTypeOptions: string[];
  subTypeOptionsForMulti: (incidentTypes: string[] | undefined) => string[];
  logAudit: (action: string, before: any, after: any, details: string) => Promise<void>;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<BroadcastMatrixRule | null>(null);
  const [form, setForm] = useState<BroadcastMatrixRule | null>(null);

  const persist = async (updated: BroadcastMatrixRule[], action: string, before: any, after: any, details: string) => {
    setMatrix(updated);
    await fetch('/api/admin/broadcast-matrix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    await logAudit(action, before, after, details);
  };

  const openNew = () => {
    setEditing(null);
    const defaultType = BROADCAST_TYPES[0];
    const firstTemplate = templates.find((t) => t.category === defaultType && t.status === 'Active');
    setForm({
      id: genId('mat'),
      crisisLevels: [ANY],
      broadcastType: defaultType,
      incidentTypes: [ANY],
      incidentSubTypes: [ANY],
      recipientGroups: activeGroups[0] ? [activeGroups[0].name] : [],
      deliveryChannels: [],
      templateId: firstTemplate?.id,
      status: 'Active',
    });
    setIsModalOpen(true);
  };

  const openEdit = (rule: BroadcastMatrixRule) => {
    setEditing(rule);
    setForm({ ...rule });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form) return;
    if (!form.templateId) {
      alert('Select a Template for this rule before saving. Every routing rule must name an exact template — there is no auto-select fallback.');
      return;
    }
    const exists = matrix.some((r) => r.id === form.id);
    const updated = exists ? matrix.map((r) => (r.id === form.id ? form : r)) : [...matrix, form];
    const typesLabel = (form.incidentTypes && form.incidentTypes.length ? form.incidentTypes : [ANY]).join(', ');
    const levelsLabel = form.crisisLevels.join(', ');
    const groupsLabel = form.recipientGroups.join(', ') || '(no group)';
    await persist(
      updated,
      exists ? 'Update Matrix Rule' : 'Create Matrix Rule',
      editing,
      form,
      `${exists ? 'Updated' : 'Created'} routing rule: ${form.broadcastType} / ${typesLabel} / ${levelsLabel} → ${groupsLabel}`
    );
    setIsModalOpen(false);
  };

  const handleToggleStatus = async (rule: BroadcastMatrixRule) => {
    const nextStatus = rule.status === 'Active' ? 'Inactive' : 'Active';
    const after = { ...rule, status: nextStatus as 'Active' | 'Inactive' };
    const updated = matrix.map((r) => (r.id === rule.id ? after : r));
    await persist(updated, 'Toggle Matrix Rule Status', rule, after, `Set routing rule ${rule.id} to ${nextStatus}`);
  };

  const toggleChannel = (ch: string) => {
    if (!form) return;
    const has = form.deliveryChannels.includes(ch);
    setForm({ ...form, deliveryChannels: has ? form.deliveryChannels.filter((c) => c !== ch) : [...form.deliveryChannels, ch] });
  };

  const templateOptions = templates.filter((t) => t.category === form?.broadcastType && t.status === 'Active');

  return (
    <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', color: 'var(--text-main)', margin: 0 }}>BROADCAST ROUTING MATRIX</h2>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>Rules can be deactivated but never deleted. All changes are audit-logged.</p>
        </div>
        <button onClick={openNew} className="btn btn-primary" style={{ padding: '6px 12px', borderRadius: '4px', fontSize: '12.5px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>
          + Add Rule
        </button>
      </div>
      <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
        <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={thStyle}>Broadcast Type</th>
              <th style={thStyle}>Incident Type / Sub-type</th>
              <th style={thStyle}>Crisis Level</th>
              <th style={thStyle}>Recipient Group</th>
              <th style={thStyle}>Channels</th>
              <th style={thStyle}>Template</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, width: '100px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((rule) => {
              const tpl = templates.find((t) => t.id === rule.templateId);
              return (
                <tr key={rule.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={tdStyle}>{rule.broadcastType}</td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                      {(rule.incidentTypes && rule.incidentTypes.length ? rule.incidentTypes : [ANY]).join(', ')}
                    </div>
                    {rule.incidentSubTypes && rule.incidentSubTypes.length && !rule.incidentSubTypes.includes(ANY) ? (
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {rule.incidentSubTypes.join(', ')}
                      </div>
                    ) : null}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {rule.crisisLevels.map((lvl) => (
                        <span
                          key={lvl}
                          style={{
                            padding: '2px 7px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: lvl === ANY ? 'var(--bg-inset, #F3F4F6)' : 'rgba(255, 130, 0, 0.1)',
                            color: lvl === ANY ? 'var(--text-muted)' : 'var(--color-primary-dark, #C2410C)',
                            border: '1px solid var(--border-color)',
                          }}
                        >
                          {lvl}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    {rule.recipientGroups && rule.recipientGroups.length > 0 ? (
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {rule.recipientGroups.map((g) => (
                          <span
                            key={g}
                            style={{
                              padding: '3px 9px',
                              borderRadius: '5px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              background: 'var(--sidebar-active-bg, #FFF7ED)',
                              color: 'var(--color-primary-dark, #C2410C)',
                              border: '1px solid rgba(255, 130, 0, 0.25)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              lineHeight: '1.2',
                            }}
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '11.5px', fontStyle: 'italic' }}>—</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {rule.deliveryChannels.map((ch) => (
                        <span key={ch} className="badge badge-onsite" style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>{ch}</span>
                      ))}
                    </div>
                  </td>
                  <td style={tdStyle}>{tpl ? tpl.name : <span style={{ color: 'var(--color-critical)' }}>(no template — click Edit)</span>}</td>
                  <td style={tdStyle}>
                    <span className={`badge ${rule.status === 'Active' ? 'badge-completed' : 'badge-live'}`} style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px' }}>{rule.status}</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button onClick={() => openEdit(rule)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11.5px', borderRadius: '4px' }}>Edit</button>
                  </td>
                </tr>
              );
            })}
            {matrix.length === 0 && (
              <tr><td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No routing rules configured.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && form && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '520px', padding: '24px', background: 'var(--bg-card)' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '20px' }}>{editing ? 'Edit Routing Rule' : 'Add Routing Rule'}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <FormField label="Broadcast Type">
                <select
                  value={form.broadcastType}
                  onChange={(e) => {
                    const nextType = e.target.value;
                    const firstTemplate = templates.find((t) => t.category === nextType && t.status === 'Active');
                    setForm({ ...form, broadcastType: nextType, templateId: firstTemplate?.id });
                  }}
                  style={selectStyle}
                >
                  {BROADCAST_TYPES.map((bt) => <option key={bt} value={bt}>{bt}</option>)}
                </select>
              </FormField>

              <FormField label="Incident Type (select one or more)">
                <DropdownMultiSelect
                  options={incidentTypeOptions}
                  selected={form.incidentTypes && form.incidentTypes.length ? form.incidentTypes : [ANY]}
                  onChange={(next) => setForm({ ...form, incidentTypes: next, incidentSubTypes: [ANY] })}
                  anyValue={ANY}
                  placeholder="Select Incident Types..."
                />
              </FormField>

              <FormField label="Incident Sub-type (select one or more)">
                <DropdownMultiSelect
                  groupedOptions={(() => {
                    const sel = form.incidentTypes;
                    const relevantTypes = (!sel || sel.length === 0 || sel.includes(ANY))
                      ? Object.keys(taxonomy)
                      : sel.filter((it) => it !== ANY);
                    return relevantTypes
                      .filter((it) => taxonomy[it] && taxonomy[it].length > 0)
                      .map((it) => ({ groupName: it, options: taxonomy[it] }));
                  })()}
                  selected={form.incidentSubTypes && form.incidentSubTypes.length ? form.incidentSubTypes : [ANY]}
                  onChange={(next) => setForm({ ...form, incidentSubTypes: next })}
                  anyValue={ANY}
                  disabled={!form.incidentTypes || form.incidentTypes.length === 0}
                  placeholder="Select Sub-types..."
                />
              </FormField>

              <FormField label="Crisis Level (select one or more)">
                <DropdownMultiSelect
                  options={[ANY, ...CRISIS_LEVELS]}
                  selected={form.crisisLevels}
                  onChange={(next) => setForm({ ...form, crisisLevels: next })}
                  anyValue={ANY}
                  placeholder="Select Crisis Levels..."
                />
              </FormField>

              <FormField label="Recipient Group (select one or more)">
                <DropdownMultiSelect
                  options={activeGroups.map((g) => g.name)}
                  selected={form.recipientGroups}
                  onChange={(next) => setForm({ ...form, recipientGroups: next })}
                  placeholder="Select Recipient Groups..."
                />
              </FormField>

              <div>
                <label style={labelStyle}>Delivery Channels</label>
                <div style={{ display: 'flex', gap: '14px', marginTop: '6px', flexWrap: 'wrap' }}>
                  {channels.map((ch) => (
                    <label key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px' }}>
                      <input type="checkbox" checked={form.deliveryChannels.includes(ch.name)} onChange={() => toggleChannel(ch.name)} />
                      {ch.name}
                    </label>
                  ))}
                </div>
              </div>

              <FormField label="Template (required)">
                {templateOptions.length === 0 ? (
                  <p style={{ fontSize: '12px', color: 'var(--color-critical)', margin: 0 }}>
                    No active template exists for {form.broadcastType}. Create one on the Template tab before this rule can be saved.
                  </p>
                ) : (
                  <select value={form.templateId || ''} onChange={(e) => setForm({ ...form, templateId: e.target.value || undefined })} style={selectStyle}>
                    <option value="" disabled>— Select a template —</option>
                    {templateOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
              </FormField>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
              <div>
                {editing && (
                  <button
                    type="button"
                    onClick={async () => {
                      await handleToggleStatus(form);
                      setIsModalOpen(false);
                    }}
                    className={`btn ${form.status === 'Active' ? 'btn-danger' : 'btn-success'}`}
                    style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '12.5px' }}
                  >
                    {form.status === 'Active' ? 'Deactivate Rule' : 'Reactivate Rule'}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                <button type="button" onClick={handleSave} className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Save Rule</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: End-of-Day Broadcast Timing ─────────────────────────────────────────

const EOD_EXCLUDABLE_STATUSES = ['Live', 'Live (Assigned)', 'Pending Endorsement', 'Returned', 'Closed'];

// 2026-07-27 (Kyle) — the eligibility controls below (min crisis level, excluded
// categories/statuses, automatic scheduling) are temporarily hidden from the UI.
// Their state is still loaded from / saved back to config unchanged, so nothing
// is lost — flip this back to true to restore the controls.
const SHOW_EOD_ADVANCED_CONTROLS = false;

// Cutover Time is restricted to whole hours only (no minutes) per Kyle 2026-07-27.
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => {
  const value = `${String(h).padStart(2, '0')}:00`;
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { value, label: `${hour12}:00 ${period}` };
});

// Existing saved times may include minutes (e.g. from before this restriction, or
// legacy/seed data) — round down to the hour so the controlled <select> always has
// a matching option.
function normalizeToHour(t: string): string {
  const h = (t || '').split(':')[0];
  const hh = h && !isNaN(parseInt(h, 10)) ? String(parseInt(h, 10)).padStart(2, '0') : '20';
  return `${hh}:00`;
}

function EodTimingTab({
  config,
  setConfig,
  logAudit,
}: {
  config: BroadcastConfig;
  setConfig: (c: BroadcastConfig) => void;
  logAudit: (action: string, before: any, after: any, details: string) => Promise<void>;
}) {
  const [time, setTime] = useState(normalizeToHour(config.endOfDayTime));
  // 2026-07-26 (Phase 0/3, gap G9/G8) — these three used to be hardcoded
  // (OPEN_STATUSES_EXCLUDED in broadcast.ts) with no admin control at all, so the
  // EOD queue picked up every Informational/Exercise incident and every Level 5
  // false alarm regardless of what anyone wanted. Exposed here so an admin can
  // tune them without a code change. eodSchedulerEnabled backs the lazy-trigger
  // on the End-of-Day Interim tab (no external scheduler in this deployment).
  const [excludedCategories, setExcludedCategories] = useState<string[]>(config.eodExcludedCategories || []);
  const [minLevel, setMinLevel] = useState<number>(config.eodMinCrisisLevel ?? 4);
  const [excludedStatuses, setExcludedStatuses] = useState<string[]>(config.eodExcludedStatuses || []);
  const [schedulerEnabled, setSchedulerEnabled] = useState<boolean>(config.eodSchedulerEnabled ?? true);

  useEffect(() => {
    setTime(normalizeToHour(config.endOfDayTime));
    setExcludedCategories(config.eodExcludedCategories || []);
    setMinLevel(config.eodMinCrisisLevel ?? 4);
    setExcludedStatuses(config.eodExcludedStatuses || []);
    setSchedulerEnabled(config.eodSchedulerEnabled ?? true);
  }, [config]);

  const toggle = (list: string[], value: string, set: (v: string[]) => void) => {
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  const handleSave = async () => {
    const before = config;
    const after: BroadcastConfig = {
      ...config,
      endOfDayTime: time,
      eodExcludedCategories: excludedCategories,
      eodMinCrisisLevel: minLevel,
      eodExcludedStatuses: excludedStatuses,
      eodSchedulerEnabled: schedulerEnabled,
    };
    setConfig(after);
    await fetch('/api/admin/broadcast-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(after),
    });
    await logAudit('Update End-of-Day Timing', before, after, `Set end-of-day broadcast timing to ${time}, min crisis level ${minLevel}, excluded categories [${excludedCategories.join(', ')}], excluded statuses [${excludedStatuses.join(', ')}]`);
  };

  return (
    <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '12px', maxWidth: '560px' }}>
      <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', marginBottom: '8px', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        END-OF-DAY BROADCAST TIMING &amp; ELIGIBILITY
      </h2>
      <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Defines the time at which open Incidents are surfaced in the Duty Manager&apos;s end-of-day interim broadcast queue.
      </p>
      <FormField label="Cutover Time">
        <select value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle}>
          {HOUR_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </FormField>
      {SHOW_EOD_ADVANCED_CONTROLS && (
        <>
          <FormField label="Minimum crisis level queued (1 = most severe, 5 = queue everything)">
            <select value={minLevel} onChange={(e) => setMinLevel(parseInt(e.target.value, 10))} style={inputStyle}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Level {n} and more severe{n < 5 ? ' (excludes less severe levels)' : ' (no level filter)'}</option>)}
            </select>
          </FormField>
          <FormField label="Excluded incident categories">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {INCIDENT_CATEGORIES.map((cat) => (
                <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={excludedCategories.includes(cat)} onChange={() => toggle(excludedCategories, cat, setExcludedCategories)} />
                  {cat}
                </label>
              ))}
            </div>
          </FormField>
          <FormField label="Excluded incident statuses">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
              {EOD_EXCLUDABLE_STATUSES.map((st) => (
                <label key={st} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={excludedStatuses.includes(st)} onChange={() => toggle(excludedStatuses, st, setExcludedStatuses)} />
                  {st}
                </label>
              ))}
            </div>
          </FormField>
          <FormField label="Automatic scheduling">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={schedulerEnabled} onChange={(e) => setSchedulerEnabled(e.target.checked)} />
              Auto-run the check once cutover has passed (lazy-trigger from the End-of-Day Interim tab)
            </label>
          </FormField>
          <div style={{ background: 'var(--bg-inset)', padding: '12px 14px', borderRadius: '8px', borderLeft: '3px solid var(--color-primary)', fontSize: '12px', color: 'var(--text-muted)', marginTop: '14px', lineHeight: 1.5 }}>
            This deployment has no external scheduler (plain Next.js dev/prod server, no Vercel Cron config) — the End-of-Day Interim tab lazy-triggers <code>/api/cron/eod-broadcast</code> once cutover has passed for the day, or it can be run on demand from the &quot;⟳ Re-run check&quot; button there.
          </div>
        </>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button onClick={handleSave} className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Save</button>
      </div>
    </div>
  );
}

// ── Tab 4: Action Prompt Rules ──────────────────────────────────────────────────

function PromptRulesTab({
  promptRules,
  setPromptRules,
  logAudit,
}: {
  promptRules: BroadcastActionPromptRule[];
  setPromptRules: (r: BroadcastActionPromptRule[]) => void;
  logAudit: (action: string, before: any, after: any, details: string) => Promise<void>;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<BroadcastActionPromptRule | null>(null);
  const [form, setForm] = useState<BroadcastActionPromptRule | null>(null);

  // Trigger events are fixed at exactly 3 (see TRIGGER_OPTIONS) — there is no "Add
  // Rule" flow any more (2026-07-27, Kyle). One row per event, always, so the list
  // always shows all 3 regardless of what's persisted. If a rule for a given event
  // hasn't been saved yet (e.g. legacy DBs seeded before the 3rd trigger existed),
  // fall back to its DEFAULT_BROADCAST_PROMPT_RULES entry so the row still renders
  // and can be edited/saved like any other.
  const displayRules: BroadcastActionPromptRule[] = TRIGGER_OPTIONS.map(
    (trigger) =>
      promptRules.find((r) => r.triggerEvent === trigger) ||
      DEFAULT_BROADCAST_PROMPT_RULES.find((d) => d.triggerEvent === trigger)!
  );

  const persist = async (updated: BroadcastActionPromptRule[], action: string, before: any, after: any, details: string) => {
    setPromptRules(updated);
    await fetch('/api/admin/broadcast-prompt-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    await logAudit(action, before, after, details);
  };

  const openEdit = (rule: BroadcastActionPromptRule) => {
    setEditing(rule);
    setForm({ ...rule });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form) return;
    if (!form.recipientRoles || form.recipientRoles.length === 0) { alert('Select at least one recipient role.'); return; }
    const exists = promptRules.some((r) => r.id === form.id);
    const updated = exists ? promptRules.map((r) => (r.id === form.id ? form : r)) : [...promptRules, form];
    await persist(
      updated,
      exists ? 'Update Action Prompt Rule' : 'Create Action Prompt Rule',
      editing,
      form,
      `Set "${TRIGGER_LABELS[form.triggerEvent]}" recipient role(s) to ${form.recipientRoles.join(', ')}`
    );
    setIsModalOpen(false);
  };

  const handleToggleStatus = async (rule: BroadcastActionPromptRule) => {
    const nextStatus = rule.status === 'Active' ? 'Inactive' : 'Active';
    const after = { ...rule, status: nextStatus as 'Active' | 'Inactive' };
    const exists = promptRules.some((r) => r.id === rule.id);
    const updated = exists ? promptRules.map((r) => (r.id === rule.id ? after : r)) : [...promptRules, after];
    await persist(updated, 'Toggle Action Prompt Rule Status', rule, after, `Set "${TRIGGER_LABELS[rule.triggerEvent]}" to ${nextStatus}`);
  };

  return (
    <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '12px' }}>
      <div style={{ marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', color: 'var(--text-main)', margin: 0 }}>BROADCAST ACTION PROMPT RULES</h2>
      </div>
      <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
        <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={thStyle}>Trigger Event</th>
              <th style={thStyle}>Recipient Role</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, width: '100px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayRules.map((rule) => (
              <tr key={rule.triggerEvent} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{TRIGGER_LABELS[rule.triggerEvent]}</td>
                <td style={tdStyle}>
                  {rule.recipientRoles && rule.recipientRoles.length > 0 ? (
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {rule.recipientRoles.map((r) => (
                        <span
                          key={r}
                          style={{
                            padding: '3px 9px',
                            borderRadius: '5px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            background: 'var(--sidebar-active-bg, #FFF7ED)',
                            color: 'var(--color-primary-dark, #C2410C)',
                            border: '1px solid rgba(255, 130, 0, 0.25)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            lineHeight: '1.2',
                          }}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '11.5px', fontStyle: 'italic' }}>—</span>
                  )}
                </td>
                <td style={tdStyle}>
                  <span className={`badge ${rule.status === 'Active' ? 'badge-completed' : 'badge-live'}`} style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px' }}>{rule.status}</span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <button onClick={() => openEdit(rule)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11.5px', borderRadius: '4px' }}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && form && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '480px', padding: '24px', background: 'var(--bg-card)', overflowY: 'visible' }}>
            {/* overflowY: 'visible' overrides the shared .modal-box's overflow-y: auto
                (globals.css) — that auto-scroll clips the Recipient Role dropdown's
                absolutely-positioned popover since it renders past this box's edge.
                Safe here because this modal's content (one static field + one
                dropdown + buttons) always fits within max-height: 90vh, so there's
                nothing to scroll anyway. */}
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '20px' }}>Edit Prompt Rule</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <FormField label="Trigger Event">
                <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', background: 'var(--bg-inset)', color: 'var(--text-muted)' }}>
                  {TRIGGER_LABELS[form.triggerEvent]}
                </div>
              </FormField>
              <FormField label="Recipient Role(s) (select one or more)">
                <DropdownMultiSelect
                  options={BROADCAST_RECIPIENT_ROLE_OPTIONS}
                  selected={form.recipientRoles}
                  onChange={(next) => setForm({ ...form, recipientRoles: next })}
                  placeholder="Select Recipient Roles..."
                />
              </FormField>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
              <button
                type="button"
                onClick={async () => {
                  await handleToggleStatus(form);
                  setIsModalOpen(false);
                }}
                className={`btn ${form.status === 'Active' ? 'btn-danger' : 'btn-success'}`}
                style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '12.5px' }}
              >
                {form.status === 'Active' ? 'Deactivate Rule' : 'Reactivate Rule'}
              </button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                <button type="button" onClick={handleSave} className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Save Rule</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 5: Distribution Groups (Broadcast-only) ─────────────────────────────────
//
// 2026-07-27 (Kyle, confirmed with client) — moved in from the old shared
// /admin/distribution-groups page. Broadcast's recipient groups are now a
// SEPARATE dataset from the Task module's (now the "Task Distribution" tab on
// /admin/task-configuration) — this tab reads/writes only
// /api/admin/broadcast-distribution-groups (its own Mongo collection). Editing a
// group here has zero effect on the Task module, and vice versa.
//
// This tab is list-only — "View Members" (2026-07-27, per Kyle) navigates to its
// own route at admin/broadcast-config/distribution-groups/[id]/page.tsx instead of
// swapping in an inline detail view, matching the Template tab's nested-route
// pattern (admin/broadcast-config/templates/[id]/page.tsx).

function GroupsTab({
  groups,
  setGroups,
  logAudit,
}: {
  groups: DistributionGroup[];
  setGroups: (g: DistributionGroup[]) => void;
  logAudit: (action: string, before: any, after: any, details: string) => Promise<void>;
}) {
  const persist = async (
    updated: DistributionGroup[],
    action: string,
    before: any,
    after: any,
    details: string
  ) => {
    setGroups(updated);
    await fetch('/api/admin/broadcast-distribution-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    await logAudit(action, before, after, details);
  };

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [formGroupName, setFormGroupName] = useState('');
  const [formGroupDesc, setFormGroupDesc] = useState('');

  const openCreateGroup = () => {
    setFormGroupName('');
    setFormGroupDesc('');
    setIsGroupModalOpen(true);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const newGroup: DistributionGroup = {
      id: genId('bgrp'),
      name: formGroupName,
      description: formGroupDesc,
      members: [],
      status: 'Active',
    };
    await persist(
      [...groups, newGroup],
      'Create Broadcast Distribution Group',
      null,
      newGroup,
      `Created broadcast distribution group: ${formGroupName}`
    );
    setIsGroupModalOpen(false);
  };

  return (
    <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', color: 'var(--text-main)', margin: 0 }}>BROADCAST DISTRIBUTION GROUPS</h2>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Recipient groups used only by Broadcast routing — separate from the Task module&apos;s own Distribution Groups.
          </p>
        </div>
        <button onClick={openCreateGroup} className="btn btn-primary" style={{ padding: '6px 12px', borderRadius: '4px', fontSize: '12.5px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>
          + Create Group
        </button>
      </div>

      <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
        <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={thStyle}>Group Name</th>
              <th style={thStyle}>Description</th>
              <th style={{ ...thStyle, width: '110px' }}>Members</th>
              <th style={{ ...thStyle, width: '110px' }}>Status</th>
              <th style={{ ...thStyle, width: '130px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No broadcast distribution groups configured.</td></tr>
            ) : (
              groups.map((group) => (
                <tr key={group.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{group.name}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{group.description}</td>
                  <td style={tdStyle}>{group.members.length}</td>
                  <td style={tdStyle}>
                    <span className={`badge ${group.status === 'Active' ? 'badge-completed' : 'badge-live'}`} style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px' }}>{group.status}</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <Link
                      href={`/admin/broadcast-config/distribution-groups/${encodeURIComponent(group.id)}`}
                      className="btn btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '11.5px', borderRadius: '4px', textDecoration: 'none' }}
                    >
                      View Members
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isGroupModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '480px', padding: '24px', background: 'var(--bg-card)' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '20px' }}>Create Broadcast Distribution Group</h2>
            <form onSubmit={handleCreateGroup} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <FormField label="Group Name">
                <input type="text" required value={formGroupName} onChange={(e) => setFormGroupName(e.target.value)} style={inputStyle} />
              </FormField>
              <FormField label="Description">
                <textarea rows={3} required value={formGroupDesc} onChange={(e) => setFormGroupDesc(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
              </FormField>
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

// ── Shared bits ─────────────────────────────────────────────────────────────────

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ marginTop: '5px' }}>{children}</div>
    </div>
  );
}

export interface DropdownGroup {
  groupName: string;
  options: string[];
}

// Dropdown Multi-Select component with interactive popover menu
// Supports flat options as well as 2-level grouped options (Level 1: Category/Type, Level 2: Subtype)
function DropdownMultiSelect({
  options,
  groupedOptions,
  selected,
  onChange,
  anyValue,
  disabled,
  placeholder = 'Select options...',
}: {
  options?: string[];
  groupedOptions?: DropdownGroup[];
  selected: string[];
  onChange: (next: string[]) => void;
  anyValue?: string;
  disabled?: boolean;
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

  const toggle = (val: string) => {
    if (disabled) return;
    if (anyValue && val === anyValue) {
      onChange(selected.includes(anyValue) ? [] : [anyValue]);
      return;
    }
    const withoutAny = anyValue ? selected.filter((v) => v !== anyValue) : selected;
    const next = withoutAny.includes(val) ? withoutAny.filter((v) => v !== val) : [...withoutAny, val];
    onChange(next);
  };

  const toggleGroup = (groupOpts: string[]) => {
    if (disabled) return;
    const withoutAny = anyValue ? selected.filter((v) => v !== anyValue) : selected;
    const allSelected = groupOpts.every((opt) => withoutAny.includes(opt));
    let next: string[];
    if (allSelected) {
      next = withoutAny.filter((v) => !groupOpts.includes(v));
    } else {
      const set = new Set([...withoutAny, ...groupOpts]);
      next = Array.from(set);
    }
    onChange(next);
  };

  const getDisplayText = () => {
    if (!selected || selected.length === 0) return placeholder;
    if (selected.length <= 2) return selected.join(', ');
    return `${selected.slice(0, 2).join(', ')} (+${selected.length - 2} more)`;
  };

  const hasGroups = groupedOptions && groupedOptions.length > 0;
  const flatOptions = options || [];

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          ...selectStyle,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: 'var(--bg-card, #FFFFFF)',
          opacity: disabled ? 0.5 : 1,
          boxShadow: isOpen ? '0 0 0 2px rgba(255, 130, 0, 0.25)' : 'none',
          borderColor: isOpen ? 'var(--color-primary, #FF8200)' : 'var(--border-color)',
          userSelect: 'none',
        }}
      >
        <span style={{ color: selected && selected.length > 0 ? 'var(--text-main)' : 'var(--text-muted)', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {getDisplayText()}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '8px', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▼
        </span>
      </div>

      {isOpen && !disabled && (
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
            maxHeight: '260px',
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {/* Wildcard Option (Any) at top if provided */}
          {anyValue && (
            <div style={{ borderBottom: hasGroups || flatOptions.length > 0 ? '1px solid var(--border-color)' : 'none', paddingBottom: '2px', marginBottom: '2px' }}>
              <label
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  background: selected.includes(anyValue) ? 'var(--sidebar-active-bg, #FFF7ED)' : 'transparent',
                  color: selected.includes(anyValue) ? 'var(--color-primary-dark, #FF8200)' : 'var(--text-main)',
                  fontWeight: selected.includes(anyValue) ? 600 : 400,
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(anyValue)}
                  onChange={() => toggle(anyValue)}
                  style={{ accentColor: 'var(--color-primary, #FF8200)', cursor: 'pointer' }}
                />
                <span>{anyValue}</span>
              </label>
            </div>
          )}

          {/* Grouped Options (2 Levels: Level 1 = Group Header, Level 2 = Subtype) */}
          {hasGroups ? (
            groupedOptions.map((group) => {
              const allSelected = group.options.length > 0 && group.options.every((opt) => selected.includes(opt));
              return (
                <div key={group.groupName} style={{ marginBottom: '4px' }}>
                  {/* Level 1 Header */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGroup(group.options);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 12px 4px 12px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--color-primary-dark, #FF8200)',
                      background: 'var(--bg-inset, #F9FAFB)',
                      borderTop: '1px solid var(--border-color)',
                      borderBottom: '1px solid var(--border-color)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <span>{group.groupName}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'none' }}>
                      {allSelected ? 'Clear group' : 'Select group'}
                    </span>
                  </div>

                  {/* Level 2 Subtype items (Indented) */}
                  {group.options.map((opt) => {
                    const isChecked = selected.includes(opt);
                    return (
                      <label
                        key={opt}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '7px 12px 7px 24px',
                          fontSize: '12.5px',
                          cursor: 'pointer',
                          background: isChecked ? 'var(--sidebar-active-bg, #FFF7ED)' : 'transparent',
                          color: isChecked ? 'var(--color-primary-dark, #FF8200)' : 'var(--text-main)',
                          fontWeight: isChecked ? 600 : 400,
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          if (!isChecked) (e.currentTarget as HTMLElement).style.background = 'var(--bg-inset, #F9FAFB)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isChecked) (e.currentTarget as HTMLElement).style.background = 'transparent';
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggle(opt)}
                          style={{ accentColor: 'var(--color-primary, #FF8200)', cursor: 'pointer' }}
                        />
                        <span>{opt}</span>
                      </label>
                    );
                  })}
                </div>
              );
            })
          ) : flatOptions.length === 0 && !anyValue ? (
            <div style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>No options available.</div>
          ) : (
            /* Flat Options (Single Level) */
            flatOptions.map((opt) => {
              if (opt === anyValue) return null;
              const isChecked = selected.includes(opt);
              return (
                <label
                  key={opt}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    background: isChecked ? 'var(--sidebar-active-bg, #FFF7ED)' : 'transparent',
                    color: isChecked ? 'var(--color-primary-dark, #FF8200)' : 'var(--text-main)',
                    fontWeight: isChecked ? 600 : 400,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isChecked) (e.currentTarget as HTMLElement).style.background = 'var(--bg-inset, #F9FAFB)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isChecked) (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(opt)}
                    style={{ accentColor: 'var(--color-primary, #FF8200)', cursor: 'pointer' }}
                  />
                  <span>{opt}</span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' };
const selectStyle: React.CSSProperties = { ...inputStyle };
const thStyle: React.CSSProperties = { padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' };
const tdStyle: React.CSSProperties = { padding: '12px 16px', fontSize: '12.5px' };
