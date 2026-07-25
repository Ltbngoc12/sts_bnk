'use client';

import React, { useState, useEffect } from 'react';
import { AdminGuard } from '@/components/AdminGuard';
import { useRole } from '@/context/RoleContext';
import { getUsers, saveUsers } from '@/lib/users';

export interface RoleDefinition {
  id: string; name: string; description: string; scope: string; modules: string[];
  status: 'Active' | 'Inactive'; isSystem: boolean;
}
interface ModulePermission {
  module: string;
  permissions: Record<string, { view: boolean; create: boolean; edit: boolean; approve: boolean; close: boolean }>;
}

const DEFAULT_ROLES: RoleDefinition[] = [
  { id: 'system-administrator', name: 'System Administrator', description: 'Full system configuration, security, user onboarding and taxonomies setup.', scope: 'Global Administration & Settings', modules: ['All Modules'], status: 'Active', isSystem: true },
  { id: 'duty-manager', name: 'Duty Manager', description: 'Shift commander. Endorses incident completions, handles escalations, and approves NOP reviews.', scope: 'Full operations, management endorsement', modules: ['Incident Management', 'Case Log', 'Fault Log', 'Task Board', 'e-Diary', 'Events Masterlist', 'Broadcast & Notification', 'Crisis Management', 'No Objection Permit (NOP)', 'Dashboard'], status: 'Active', isSystem: true },
  { id: 'duty-officer', name: 'Duty Officer', description: 'Assisting shift officer. Eligible to elevate role to Duty Manager during shift changes or DM absence.', scope: 'Full operations, standard triage control', modules: ['Incident Management', 'Case Log', 'Fault Log', 'Task Board', 'e-Diary', 'Events Masterlist', 'Broadcast & Notification', 'Crisis Management', 'No Objection Permit (NOP)', 'Dashboard'], status: 'Active', isSystem: true },
  { id: 'controller', name: 'Controller', description: 'IOH Operators. Primary handlers for logging reports, dispatcher control, and task assignments.', scope: 'Full operational workflow creation/routing (excludes final close endorsements)', modules: ['Incident Management', 'Case Log', 'Fault Log', 'Task Board', 'e-Diary', 'Events Masterlist', 'Broadcast & Notification', 'Dashboard'], status: 'Active', isSystem: true },
  { id: 'responder-ranger', name: 'Responder (Ranger)', description: 'Field personnel performing inspections, crowd-control, or incident scene handling.', scope: 'Limited to assigned Incident/Task records', modules: ['Incident Management (Assigned only)', 'Task Board (Assigned only)'], status: 'Active', isSystem: true },
  { id: 'stakeholder', name: 'Stakeholder', description: 'Internal SDC departments requiring read-only visibility into active/past cases.', scope: 'Read-only departmental visibility', modules: ['Incident Management', 'Case Log', 'Dashboard'], status: 'Active', isSystem: true },
  { id: 'broadcast-recipient', name: 'Broadcast Recipient', description: 'External and internal contact groups receiving dispatch templates.', scope: 'None (Receives SMS/Email only)', modules: ['Broadcast & Notification'], status: 'Active', isSystem: true },
  { id: 'operational-resilience-analyst', name: 'Operational Resilience Analyst', description: 'Read-only analyst checking case files for tagging, categorization and post-incident compliance.', scope: 'Read-only reports and analytical exports', modules: ['Incident Management', 'Case Log', 'Dashboard'], status: 'Active', isSystem: true },
  { id: 'non-sdc-term-contractor', name: 'Non-SDC Term Contractor', description: 'Contractors handling facility fixes, responding to CMMS-directed assignments.', scope: 'Limited to assigned CMMS tickets/tasks', modules: ['Fault Log', 'Task Board'], status: 'Active', isSystem: true },
];

const DEFAULT_MATRIX: ModulePermission[] = [
  { module: 'Incident Management', permissions: { 'System Administrator': { view: true, create: true, edit: true, approve: true, close: true }, 'Duty Manager': { view: true, create: true, edit: true, approve: true, close: true }, 'Duty Officer': { view: true, create: true, edit: true, approve: false, close: false }, 'Controller': { view: true, create: true, edit: true, approve: false, close: false }, 'Responder (Ranger)': { view: true, create: false, edit: true, approve: false, close: false }, 'Stakeholder': { view: true, create: false, edit: false, approve: false, close: false }, 'Broadcast Recipient': { view: false, create: false, edit: false, approve: false, close: false }, 'Operational Resilience Analyst': { view: true, create: false, edit: true, approve: false, close: false }, 'Non-SDC Term Contractor': { view: false, create: false, edit: false, approve: false, close: false } } },
  { module: 'Case Management', permissions: { 'System Administrator': { view: true, create: true, edit: true, approve: true, close: true }, 'Duty Manager': { view: true, create: true, edit: true, approve: true, close: true }, 'Duty Officer': { view: true, create: true, edit: true, approve: true, close: true }, 'Controller': { view: true, create: true, edit: true, approve: false, close: false }, 'Responder (Ranger)': { view: false, create: false, edit: false, approve: false, close: false }, 'Stakeholder': { view: true, create: false, edit: false, approve: false, close: false }, 'Broadcast Recipient': { view: false, create: false, edit: false, approve: false, close: false }, 'Operational Resilience Analyst': { view: true, create: false, edit: false, approve: false, close: false }, 'Non-SDC Term Contractor': { view: false, create: false, edit: false, approve: false, close: false } } },
  { module: 'Fault Reporting', permissions: { 'System Administrator': { view: true, create: true, edit: true, approve: true, close: true }, 'Duty Manager': { view: true, create: true, edit: true, approve: true, close: true }, 'Duty Officer': { view: true, create: true, edit: true, approve: true, close: true }, 'Controller': { view: true, create: true, edit: true, approve: false, close: true }, 'Responder (Ranger)': { view: true, create: false, edit: false, approve: false, close: false }, 'Stakeholder': { view: true, create: false, edit: false, approve: false, close: false }, 'Broadcast Recipient': { view: false, create: false, edit: false, approve: false, close: false }, 'Operational Resilience Analyst': { view: true, create: false, edit: false, approve: false, close: false }, 'Non-SDC Term Contractor': { view: true, create: false, edit: true, approve: false, close: false } } },
  { module: 'Task Management', permissions: { 'System Administrator': { view: true, create: true, edit: true, approve: true, close: true }, 'Duty Manager': { view: true, create: true, edit: true, approve: true, close: true }, 'Duty Officer': { view: true, create: true, edit: true, approve: true, close: true }, 'Controller': { view: true, create: true, edit: true, approve: false, close: true }, 'Responder (Ranger)': { view: true, create: false, edit: true, approve: false, close: false }, 'Stakeholder': { view: true, create: false, edit: false, approve: false, close: false }, 'Broadcast Recipient': { view: false, create: false, edit: false, approve: false, close: false }, 'Operational Resilience Analyst': { view: true, create: false, edit: false, approve: false, close: false }, 'Non-SDC Term Contractor': { view: true, create: false, edit: true, approve: false, close: false } } },
  { module: 'e-Diary', permissions: { 'System Administrator': { view: true, create: true, edit: true, approve: true, close: true }, 'Duty Manager': { view: true, create: true, edit: true, approve: false, close: true }, 'Duty Officer': { view: true, create: true, edit: true, approve: false, close: true }, 'Controller': { view: true, create: true, edit: true, approve: false, close: true }, 'Responder (Ranger)': { view: false, create: false, edit: false, approve: false, close: false }, 'Stakeholder': { view: true, create: false, edit: false, approve: false, close: false }, 'Broadcast Recipient': { view: false, create: false, edit: false, approve: false, close: false }, 'Operational Resilience Analyst': { view: true, create: false, edit: false, approve: false, close: false }, 'Non-SDC Term Contractor': { view: false, create: false, edit: false, approve: false, close: false } } },
  { module: 'Events Masterlist', permissions: { 'System Administrator': { view: true, create: true, edit: true, approve: true, close: true }, 'Duty Manager': { view: true, create: true, edit: true, approve: true, close: true }, 'Duty Officer': { view: true, create: true, edit: true, approve: true, close: true }, 'Controller': { view: true, create: true, edit: true, approve: false, close: true }, 'Responder (Ranger)': { view: true, create: false, edit: false, approve: false, close: false }, 'Stakeholder': { view: true, create: false, edit: false, approve: false, close: false }, 'Broadcast Recipient': { view: false, create: false, edit: false, approve: false, close: false }, 'Operational Resilience Analyst': { view: true, create: false, edit: false, approve: false, close: false }, 'Non-SDC Term Contractor': { view: false, create: false, edit: false, approve: false, close: false } } },
  { module: 'Broadcast & Notification', permissions: { 'System Administrator': { view: true, create: true, edit: true, approve: true, close: true }, 'Duty Manager': { view: true, create: true, edit: true, approve: true, close: true }, 'Duty Officer': { view: true, create: true, edit: true, approve: true, close: true }, 'Controller': { view: true, create: true, edit: true, approve: false, close: false }, 'Responder (Ranger)': { view: false, create: false, edit: false, approve: false, close: false }, 'Stakeholder': { view: false, create: false, edit: false, approve: false, close: false }, 'Broadcast Recipient': { view: true, create: false, edit: false, approve: false, close: false }, 'Operational Resilience Analyst': { view: false, create: false, edit: false, approve: false, close: false }, 'Non-SDC Term Contractor': { view: false, create: false, edit: false, approve: false, close: false } } },
  { module: 'Crisis Management', permissions: { 'System Administrator': { view: true, create: true, edit: true, approve: true, close: true }, 'Duty Manager': { view: true, create: true, edit: true, approve: true, close: true }, 'Duty Officer': { view: true, create: true, edit: true, approve: true, close: true }, 'Controller': { view: true, create: true, edit: false, approve: false, close: false }, 'Responder (Ranger)': { view: true, create: false, edit: false, approve: false, close: false }, 'Stakeholder': { view: true, create: false, edit: false, approve: false, close: false }, 'Broadcast Recipient': { view: false, create: false, edit: false, approve: false, close: false }, 'Operational Resilience Analyst': { view: true, create: false, edit: false, approve: false, close: false }, 'Non-SDC Term Contractor': { view: false, create: false, edit: false, approve: false, close: false } } },
  { module: 'No Objection Permit (NOP)', permissions: { 'System Administrator': { view: true, create: true, edit: true, approve: true, close: true }, 'Duty Manager': { view: true, create: true, edit: true, approve: true, close: true }, 'Duty Officer': { view: true, create: true, edit: true, approve: true, close: true }, 'Controller': { view: true, create: true, edit: true, approve: false, close: false }, 'Responder (Ranger)': { view: false, create: false, edit: false, approve: false, close: false }, 'Stakeholder': { view: true, create: false, edit: false, approve: false, close: false }, 'Broadcast Recipient': { view: false, create: false, edit: false, approve: false, close: false }, 'Operational Resilience Analyst': { view: true, create: false, edit: false, approve: false, close: false }, 'Non-SDC Term Contractor': { view: false, create: false, edit: false, approve: false, close: false } } },
];

const PC: Record<string, string> = { view: '#16A34A', create: '#D97706', edit: '#2563EB', approve: '#7C3AED', close: '#DC2626' };
const PB: Record<string, string> = { view: 'rgba(22,163,74,0.08)', create: 'rgba(217,119,6,0.08)', edit: 'rgba(37,99,235,0.08)', approve: 'rgba(124,58,237,0.08)', close: 'rgba(220,38,38,0.08)' };

const PERMISSION_LABELS: Record<string, string> = { view: 'View', create: 'Create', edit: 'Edit', approve: 'Approve', close: 'Close' };
const ROLE_COLORS = ['#7C3AED', '#16A34A', '#D97706', '#2563EB', '#DC2626', '#0891B2', '#BE185D', '#059669', '#B45309'];

type PermKey = 'view' | 'create' | 'edit' | 'approve' | 'close';

interface PermissionMatrixTabProps {
  matrix: ModulePermission[];
  activeRoles: RoleDefinition[];
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveMatrix: () => void;
  onTogglePerm: (mod: string, role: string, p: PermKey) => void;
}

function PermissionMatrixTab({ matrix, activeRoles, isEditing, onStartEdit, onCancelEdit, onSaveMatrix, onTogglePerm }: PermissionMatrixTabProps) {
  const [searchPerm, setSearchPerm] = useState('');
  const [filterModule, setFilterModule] = useState<string>('all');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(activeRoles.slice(0, 3).map(r => r.name));

  const allModules = matrix.map(r => r.module);
  const PERMS: PermKey[] = ['view', 'create', 'edit', 'approve', 'close'];

  // flat rows: { module, perm } pairs
  const allRows: { module: string; perm: PermKey }[] = matrix.flatMap(row =>
    PERMS.map(p => ({ module: row.module, perm: p }))
  );

  const filteredRows = allRows.filter(row => {
    const matchModule = filterModule === 'all' || row.module === filterModule;
    const matchSearch = searchPerm === '' ||
      row.module.toLowerCase().includes(searchPerm.toLowerCase()) ||
      PERMISSION_LABELS[row.perm].toLowerCase().includes(searchPerm.toLowerCase());
    return matchModule && matchSearch;
  });

  const toggleRole = (name: string) => {
    setSelectedRoles(prev => prev.includes(name) ? prev.filter(r => r !== name) : [...prev, name]);
  };

  const getRoleColor = (name: string) => {
    const idx = activeRoles.findIndex(r => r.name === name);
    return ROLE_COLORS[idx % ROLE_COLORS.length];
  };

  const getMatrixPerm = (mod: string, roleName: string, p: PermKey): boolean => {
    const row = matrix.find(r => r.module === mod);
    return !!(row?.permissions[roleName]?.[p]);
  };

  // group consecutive same-module rows for spanning
  const groupedRows: { module: string; perm: PermKey; isFirst: boolean; span: number }[] = [];
  filteredRows.forEach((row, i) => {
    const spanCount = filteredRows.filter(r => r.module === row.module).length;
    const isFirst = i === 0 || filteredRows[i - 1].module !== row.module;
    groupedRows.push({ ...row, isFirst, span: spanCount });
  });

  const displayedRoles = selectedRoles.length > 0 ? activeRoles.filter(r => selectedRoles.includes(r.name)) : activeRoles;

  return (
    <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', color: 'var(--text-main)', margin: 0 }}>CENTRALIZED PERMISSION MATRIX</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Enterprise workspace for viewing and bulk-modifying granular access levels.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
          {isEditing ? (
            <>
              <button onClick={onCancelEdit} style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-main)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={onSaveMatrix} style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Save Changes</button>
            </>
          ) : (
            <button onClick={onStartEdit} style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>✏️ Edit Permissions</button>
          )}
        </div>
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Module filter */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Module</span>
          <select value={filterModule} onChange={e => setFilterModule(e.target.value)} style={{ padding: '7px 10px', borderRadius: '6px', fontSize: '12.5px', border: '1px solid var(--border-color)', background: 'var(--bg-inset)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer', minWidth: '180px' }}>
            <option value="all">All Modules</option>
            {allModules.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* Permission search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '200px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Search Permissions</span>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '13px', pointerEvents: 'none' }}>🔍</span>
            <input value={searchPerm} onChange={e => setSearchPerm(e.target.value)} placeholder="Search module or permission..." style={{ width: '100%', boxSizing: 'border-box', padding: '7px 12px 7px 32px', borderRadius: '6px', fontSize: '12.5px', border: '1px solid var(--border-color)', background: 'var(--bg-inset)', color: 'var(--text-main)', outline: 'none' }} />
          </div>
        </div>
      </div>

      {/* Compare Roles (chip selector) */}
      <div style={{ marginBottom: '16px', padding: '12px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-inset)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Compare Roles:</span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
            {activeRoles.map(role => {
              const color = getRoleColor(role.name);
              const selected = selectedRoles.includes(role.name);
              return (
                <button key={role.name} onClick={() => toggleRole(role.name)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${selected ? color : 'var(--border-color)'}`, background: selected ? `${color}15` : 'transparent', color: selected ? color : 'var(--text-muted)', transition: 'all 0.15s ease' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: selected ? color : 'var(--border-color)', display: 'inline-block', transition: 'all 0.15s' }} />
                  {role.name}
                  {selected && <span style={{ fontSize: '11px', lineHeight: 1 }}>×</span>}
                </button>
              );
            })}
          </div>
          {selectedRoles.length !== activeRoles.length && (
            <button onClick={() => setSelectedRoles(activeRoles.map(r => r.name))} style={{ fontSize: '11.5px', color: 'var(--color-primary-dark)', background: 'none', border: 'none', cursor: 'pointer', padding: '0', whiteSpace: 'nowrap', fontWeight: 600 }}>Select All</button>
          )}
          {selectedRoles.length > 0 && (
            <button onClick={() => setSelectedRoles([])} style={{ fontSize: '11.5px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0', whiteSpace: 'nowrap' }}>Clear</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--bg-inset)', borderBottom: '2px solid var(--border-color)' }}>
              <th style={{ padding: '11px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '180px', borderRight: '1px solid var(--border-color)' }}>Module</th>
              <th style={{ padding: '11px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '150px', borderRight: '1px solid var(--border-color)' }}>Action / Permission</th>
              {displayedRoles.map(role => {
                const color = getRoleColor(role.name);
                return (
                  <th key={role.name} style={{ padding: '11px 16px', fontSize: '11.5px', fontWeight: 700, color, textTransform: 'none', textAlign: 'center', borderRight: '1px solid var(--border-color)', minWidth: '110px' }}>
                    {role.name}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groupedRows.length === 0 ? (
              <tr>
                <td colSpan={2 + displayedRoles.length} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No permissions match your filters.
                </td>
              </tr>
            ) : groupedRows.map((row, i) => {
              const isModuleFirst = row.isFirst;
              const isEven = Math.floor(i / PERMS.length) % 2 === 0;
              const rowBg = isEven ? 'var(--bg-card)' : 'var(--bg-inset)';
              return (
                <tr key={`${row.module}-${row.perm}`} style={{ borderBottom: '1px solid var(--border-color)', background: rowBg }}>
                  {/* Module cell — only render for first perm of this module in filtered list */}
                  {isModuleFirst ? (
                    <td rowSpan={row.span} style={{ padding: '12px 16px', fontWeight: 700, fontSize: '12.5px', color: 'var(--text-main)', verticalAlign: 'middle', borderRight: '1px solid var(--border-color)', background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
                      {row.module}
                    </td>
                  ) : null}
                  {/* Permission label */}
                  <td style={{ padding: '10px 16px', borderRight: '1px solid var(--border-color)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 600, color: PC[row.perm], background: PB[row.perm], padding: '2px 8px', borderRadius: '4px' }}>
                      {PERMISSION_LABELS[row.perm]}
                    </span>
                  </td>
                  {/* Checkboxes per role */}
                  {displayedRoles.map(role => {
                    const checked = getMatrixPerm(row.module, role.name, row.perm);
                    const color = getRoleColor(role.name);
                    return (
                      <td key={role.name} style={{ padding: '10px 16px', textAlign: 'center', borderRight: '1px solid var(--border-color)' }}>
                        {isEditing ? (
                          <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <input type="checkbox" checked={checked} onChange={() => onTogglePerm(row.module, role.name, row.perm)} style={{ display: 'none' }} />
                            <span style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${checked ? color : 'var(--border-color)'}`, background: checked ? color : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease', flexShrink: 0 }}>
                              {checked && <span style={{ color: '#fff', fontSize: '11px', lineHeight: 1, fontWeight: 900 }}>✓</span>}
                            </span>
                          </label>
                        ) : (
                          checked
                            ? <span style={{ color, fontSize: '15px' }}>✓</span>
                            : <span style={{ color: 'var(--border-color)', fontSize: '15px' }}>—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {isEditing && (
        <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '10px' }}>
          Click checkboxes to toggle permissions. Press <strong>Save Changes</strong> when done.
        </p>
      )}
    </div>
  );
}

function getRoles(): RoleDefinition[] {
  if (typeof window === 'undefined') return DEFAULT_ROLES;
  const s = localStorage.getItem('admin_roles');
  if (s) { try { return JSON.parse(s); } catch { /* fall through */ } }
  localStorage.setItem('admin_roles', JSON.stringify(DEFAULT_ROLES));
  return DEFAULT_ROLES;
}
function saveRoles(r: RoleDefinition[]) {
  if (typeof window !== 'undefined') localStorage.setItem('admin_roles', JSON.stringify(r));
}

export default function RoleManagementPage() {
  const { username } = useRole();
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [matrix, setMatrix] = useState<ModulePermission[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'roles' | 'matrix'>('roles');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [cName, setCName] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cErr, setCErr] = useState('');

  // Edit modal
  const [editRole, setEditRole] = useState<RoleDefinition | null>(null);
  const [eName, setEName] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eStatus, setEStatus] = useState<'Active' | 'Inactive'>('Active');
  const [eTarget, setETarget] = useState('');
  const [eErr, setEErr] = useState('');

  useEffect(() => {
    setRoles(getRoles());
    const s = localStorage.getItem('admin_role_matrix');
    setMatrix(s ? JSON.parse(s) : DEFAULT_MATRIX);
    if (!s) localStorage.setItem('admin_role_matrix', JSON.stringify(DEFAULT_MATRIX));
  }, []);

  const showT = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  };

  const audit = async (action: string, before: unknown, after: unknown, details: string) => {
    try { await fetch('/api/admin/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: username || 'Admin Root', action, module: 'Role Management', details, beforeSnapshot: JSON.stringify(before), afterSnapshot: JSON.stringify(after), correlationId: `ROLE-${Date.now()}` }) }); } catch { /* silent */ }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const n = cName.trim();
    if (!n) { setCErr('Role name is required.'); return; }
    if (roles.some(r => r.name.toLowerCase() === n.toLowerCase())) { setCErr('A role with this name already exists.'); return; }
    const nr: RoleDefinition = { id: `custom-${Date.now()}`, name: n, description: cDesc.trim() || '—', scope: '—', modules: [], status: 'Active', isSystem: false };
    const upd = [...roles, nr]; setRoles(upd); saveRoles(upd);
    audit('Create Role', null, nr, `Created: ${n}`);
    showT(`Role "${n}" created.`);
    setShowCreate(false); setCName(''); setCDesc(''); setCErr('');
  };

  const openEdit = (role: RoleDefinition) => {
    setEditRole(role); setEName(role.name); setEDesc(role.description === '—' ? '' : role.description);
    setEStatus(role.status); setEErr('');
    const first = roles.find(r => r.name !== role.name && r.status === 'Active');
    setETarget(first?.name ?? '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRole) return;
    const n = eName.trim();
    if (!n) { setEErr('Role name is required.'); return; }
    if (n.toLowerCase() !== editRole.name.toLowerCase() && roles.some(r => r.name.toLowerCase() === n.toLowerCase())) { setEErr('Another role with this name already exists.'); return; }
    const deactivating = editRole.status === 'Active' && eStatus === 'Inactive';
    const affected = deactivating ? getUsers().filter(u => u.role === editRole.name) : [];
    if (deactivating && affected.length > 0 && !eTarget) { setEErr('Please choose a role to reassign affected users to.'); return; }
    if (deactivating && affected.length > 0 && eTarget) {
      saveUsers(getUsers().map(u => affected.some(a => a.id === u.id) ? { ...u, role: eTarget } : u));
      audit('Reassign on Deactivation', { role: editRole.name }, { role: eTarget }, `${affected.length} user(s) reassigned to "${eTarget}".`);
    }
    const updated: RoleDefinition = { ...editRole, name: n, description: eDesc.trim() || '—', status: eStatus };
    const upd = roles.map(r => r.id === editRole.id ? updated : r); setRoles(upd); saveRoles(upd);
    audit('Edit Role', editRole, updated, `Role "${editRole.name}" updated.`);
    const parts: string[] = [];
    if (n !== editRole.name) parts.push(`renamed to "${n}"`);
    if (eStatus !== editRole.status) parts.push(`status → ${eStatus}`);
    if (deactivating && affected.length > 0) parts.push(`${affected.length} user(s) → "${eTarget}"`);
    showT(`Role updated${parts.length ? ': ' + parts.join(', ') : ''}.`);
    setEditRole(null);
  };

  const handleStartEdit = () => { localStorage.setItem('admin_role_matrix_prev', JSON.stringify(matrix)); setIsEditing(true); };
  const handleCancelEdit = () => { const s = localStorage.getItem('admin_role_matrix'); setMatrix(s ? JSON.parse(s) : DEFAULT_MATRIX); setIsEditing(false); };
  const handleSaveMatrix = async () => {
    localStorage.setItem('admin_role_matrix', JSON.stringify(matrix)); setIsEditing(false);
    try { await fetch('/api/admin/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: username || 'Admin Root', action: 'Update Role Matrix', module: 'Role Management', details: 'Updated permission matrix.', beforeSnapshot: localStorage.getItem('admin_role_matrix_prev') || '', afterSnapshot: JSON.stringify(matrix) }) }); localStorage.setItem('admin_role_matrix_prev', JSON.stringify(matrix)); } catch { /* silent */ }
  };
  const togglePerm = (mod: string, role: string, p: 'view' | 'create' | 'edit' | 'approve' | 'close') => {
    if (!isEditing) return;
    setMatrix(prev => prev.map(row => { if (row.module !== mod) return row; const cur = row.permissions[role] || { view: false, create: false, edit: false, approve: false, close: false }; return { ...row, permissions: { ...row.permissions, [role]: { ...cur, [p]: !cur[p] } } }; }));
  };

  // Derived — computed before JSX to avoid IIFEs in render
  const affectedUsers = (editRole && eStatus === 'Inactive' && editRole.status === 'Active') ? getUsers().filter(u => u.role === editRole.name) : [];
  const needsReassign = affectedUsers.length > 0;
  const targetRoles = editRole ? roles.filter(r => r.name !== editRole.name && r.status === 'Active') : [];
  const activeRoles = roles.filter(r => r.status === 'Active');

  return (
    <AdminGuard pageTitle="Role Management">

      {toast && (
        <div style={{ position: 'fixed', top: '20px', right: '24px', zIndex: 9999, background: toast.type === 'success' ? '#16A34A' : '#DC2626', color: '#fff', padding: '10px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
          {toast.msg}
        </div>
      )}

      <div className="admin-header-bar glass" style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>ROLE MANAGEMENT & PERMISSIONS</h1>
        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Audit the role architecture, access scopes, and module permission matrix mapping.</p>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '2px' }}>
        {(['roles', 'matrix'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '10px 20px', border: 'none', background: 'none', borderBottom: activeTab === tab ? '3px solid var(--color-primary)' : '3px solid transparent', color: activeTab === tab ? 'var(--color-primary-dark)' : 'var(--text-muted)', fontWeight: activeTab === tab ? 700 : 500, fontSize: '13.5px', cursor: 'pointer', outline: 'none', transition: 'all 0.15s ease' }}>
            {tab === 'roles' ? 'System Roles' : 'Role & Status Action Permission Matrix'}
          </button>
        ))}
      </div>

      {/* ── System Roles Tab ── */}
      {activeTab === 'roles' && (
        <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', color: 'var(--text-main)', margin: 0 }}>SYSTEM ROLES</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>{roles.length} roles total — {activeRoles.length} active</p>
            </div>
            <button onClick={() => { setShowCreate(true); setCErr(''); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              <span style={{ fontSize: '16px', lineHeight: '1' }}>+</span> Create Role
            </button>
          </div>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '240px' }}>Role Name</th>
                  <th style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Description</th>
                  <th style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '100px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '110px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map(role => (
                  <tr key={role.id} style={{ borderBottom: '1px solid var(--border-color)', background: role.status === 'Inactive' ? 'rgba(0,0,0,0.02)' : 'transparent', cursor: 'pointer', transition: 'background 0.15s ease' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.015)'; }} onMouseLeave={e => { e.currentTarget.style.background = role.status === 'Inactive' ? 'rgba(0,0,0,0.02)' : 'transparent'; }}>
                    <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: role.status === 'Inactive' ? 'var(--text-muted)' : 'var(--text-main)', textDecoration: role.status === 'Inactive' ? 'line-through' : 'none' }}>{role.name}</span>
                        {!role.isSystem && <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', background: 'rgba(37,99,235,0.08)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Custom</span>}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: '1.5', verticalAlign: 'middle', opacity: role.status === 'Inactive' ? 0.5 : 1 }}>{role.description}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: role.status === 'Active' ? 'rgba(22,163,74,0.1)' : 'rgba(0,0,0,0.06)', color: role.status === 'Active' ? '#16A34A' : '#737373', border: role.status === 'Active' ? '1px solid rgba(22,163,74,0.25)' : '1px solid rgba(0,0,0,0.1)' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: role.status === 'Active' ? '#16A34A' : '#A3A3A3', display: 'inline-block' }} />{role.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(role)} style={{ padding: '5px 14px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-color)', background: 'var(--bg-inset)', color: 'var(--text-main)', transition: 'all 0.15s ease', display: 'inline-flex', alignItems: 'center', gap: '5px' }} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-primary-dark)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-primary-dark)'; }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-color)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-main)'; }}>
                        ✏️ Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Permission Matrix Tab ── */}
      {activeTab === 'matrix' && (
        <PermissionMatrixTab
          matrix={matrix}
          activeRoles={activeRoles}
          isEditing={isEditing}
          onStartEdit={handleStartEdit}
          onCancelEdit={handleCancelEdit}
          onSaveMatrix={handleSaveMatrix}
          onTogglePerm={togglePerm}
        />
      )}

      {/* ── Modal: Create Role ── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowCreate(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '28px 32px', width: '480px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>Create New Role</h2>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '22px' }}>Custom roles are created as <strong>Active</strong> and assignable immediately.</p>
            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>Role Name <span style={{ color: 'var(--color-critical)' }}>*</span></label>
                <input autoFocus value={cName} onChange={e => { setCName(e.target.value); setCErr(''); }} placeholder="e.g. Senior Controller" style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '6px', fontSize: '13px', border: cErr ? '1px solid var(--color-critical)' : '1px solid var(--border-color)', background: 'var(--bg-inset)', color: 'var(--text-main)', outline: 'none' }} />
                {cErr && <p style={{ fontSize: '11.5px', color: 'var(--color-critical)', marginTop: '5px' }}>{cErr}</p>}
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>Description</label>
                <textarea value={cDesc} onChange={e => setCDesc(e.target.value)} placeholder="Describe responsibilities…" rows={3} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '6px', fontSize: '13px', border: '1px solid var(--border-color)', background: 'var(--bg-inset)', color: 'var(--text-main)', outline: 'none', resize: 'vertical', lineHeight: '1.5' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '8px 18px', borderRadius: '6px', fontSize: '13px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 20px', borderRadius: '6px', fontSize: '13px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Create Role</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Edit Role ── */}
      {editRole && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setEditRole(null)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '28px 32px', width: '520px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
            <div style={{ marginBottom: '22px' }}>
              <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Edit Role</h2>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px' }}>{editRole.isSystem ? 'System role — name and description can be customised.' : 'Custom role — all fields are editable.'}</p>
            </div>
            <form onSubmit={handleSaveEdit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>Role Name <span style={{ color: 'var(--color-critical)' }}>*</span></label>
                <input autoFocus value={eName} onChange={e => { setEName(e.target.value); setEErr(''); }} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '6px', fontSize: '13px', border: '1px solid var(--border-color)', background: 'var(--bg-inset)', color: 'var(--text-main)', outline: 'none' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>Description</label>
                <textarea value={eDesc} onChange={e => setEDesc(e.target.value)} rows={3} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '6px', fontSize: '13px', border: '1px solid var(--border-color)', background: 'var(--bg-inset)', color: 'var(--text-main)', outline: 'none', resize: 'vertical', lineHeight: '1.5' }} />
              </div>
              <div style={{ marginBottom: needsReassign ? '16px' : '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>Status</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['Active', 'Inactive'] as const).map(s => (
                    <button key={s} type="button" onClick={() => { setEStatus(s); setEErr(''); }} style={{ padding: '7px 20px', borderRadius: '6px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', border: '1px solid', transition: 'all 0.15s ease', background: eStatus === s ? (s === 'Active' ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.08)') : 'transparent', color: eStatus === s ? (s === 'Active' ? '#16A34A' : '#DC2626') : 'var(--text-muted)', borderColor: eStatus === s ? (s === 'Active' ? 'rgba(22,163,74,0.4)' : 'rgba(220,38,38,0.3)') : 'var(--border-color)' }}>
                      {s === 'Active' ? '● Active' : '○ Inactive'}
                    </button>
                  ))}
                </div>
              </div>

              {needsReassign && (
                <div style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: '8px', padding: '14px 16px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px' }}>
                    <span>⚠️</span>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-main)' }}>{affectedUsers.length} user{affectedUsers.length > 1 ? 's' : ''} must be reassigned before deactivation</span>
                  </div>
                  <div style={{ background: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border-color)', padding: '8px 12px', marginBottom: '12px', maxHeight: '130px', overflowY: 'auto' }}>
                    {affectedUsers.map(u => (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0, background: 'var(--color-primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'var(--color-primary-dark)' }}>
                          {u.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>{u.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{u.email}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>Reassign all to <span style={{ color: 'var(--color-critical)' }}>*</span></label>
                  <select value={eTarget} onChange={e => { setETarget(e.target.value); setEErr(''); }} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', border: eErr ? '1px solid var(--color-critical)' : '1px solid var(--border-color)', background: 'var(--bg-inset)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}>
                    <option value="">— Select a role —</option>
                    {targetRoles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                  </select>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>Only active roles shown. Individual reassignment available in User Management.</p>
                </div>
              )}

              {eErr && <p style={{ fontSize: '12px', color: 'var(--color-critical)', marginBottom: '12px' }}>{eErr}</p>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setEditRole(null)} style={{ padding: '8px 18px', borderRadius: '6px', fontSize: '13px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 22px', borderRadius: '6px', fontSize: '13px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </AdminGuard>
  );
}
