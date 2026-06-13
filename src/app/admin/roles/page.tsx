'use client';

import React, { useState, useEffect } from 'react';
import { AdminGuard } from '@/components/AdminGuard';
import { useRole } from '@/context/RoleContext';

interface RoleDefinition {
  name: string;
  description: string;
  scope: string;
  modules: string[];
}

const ROLES_LIST: RoleDefinition[] = [
  { name: 'System Administrator', description: 'Full system configuration, security, user onboarding and taxonomies setup.', scope: 'Global Administration & Settings', modules: ['All Modules'] },
  { name: 'Duty Manager', description: 'Shift commander. Endorses incident completions, handles escalations, and approves NOP reviews.', scope: 'Full operations, management endorsement and endorsement reviews', modules: ['Incident Management', 'Case Log', 'Fault Log', 'Task Board', 'e-Diary', 'Events Masterlist', 'Broadcast & Notification', 'Crisis Management', 'No Objection Permit (NOP)', 'Dashboard'] },
  { name: 'Duty Officer', description: 'Assisting shift officer. Eligible to elevate role to Duty Manager during shift changes or DM absence.', scope: 'Full operations, standard triage control', modules: ['Incident Management', 'Case Log', 'Fault Log', 'Task Board', 'e-Diary', 'Events Masterlist', 'Broadcast & Notification', 'Crisis Management', 'No Objection Permit (NOP)', 'Dashboard'] },
  { name: 'Controller', description: 'IOH Operators. Primary handlers for logging reports, dispatcher control, and task assignments.', scope: 'Full operational workflow creation/routing (excludes final close endorsements)', modules: ['Incident Management', 'Case Log', 'Fault Log', 'Task Board', 'e-Diary', 'Events Masterlist', 'Broadcast & Notification', 'Dashboard'] },
  { name: 'Responder (Ranger)', description: 'Field personnel performing inspections, crowd-control, or incident scene handling.', scope: 'Limited to assigned Incident/Task records details', modules: ['Incident Management (Assigned only)', 'Task Board (Assigned only)'] },
  { name: 'Stakeholder', description: 'Internal SDC departments requiring read-only visibility into active/past cases.', scope: 'Read-only departmental visibility', modules: ['Incident Management', 'Case Log', 'Dashboard'] },
  { name: 'Broadcast Recipient', description: 'External and internal contact groups receiving dispatch templates.', scope: 'None (Receives SMS/Email only)', modules: ['Broadcast Notifications'] },
  { name: 'Operational Resilience Analyst', description: 'Read-only analyst checking case files for tagging, categorization and post-incident compliance.', scope: 'Read-only reports and analytical exports', modules: ['Incident Management', 'Case Log', 'Dashboard'] },
  { name: 'Non-SDC Term Contractor', description: 'Contractors handling facility fixes, responding to CMMS-directed assignments.', scope: 'Limited to assigned CMMS tickets/tasks', modules: ['Fault Log', 'Task Board'] }
];

interface ModulePermission {
  module: string;
  permissions: Record<string, { view: boolean; create: boolean; edit: boolean; approve: boolean; close: boolean }>;
}

const DEFAULT_MATRIX: ModulePermission[] = [
  {
    module: 'Incident Management',
    permissions: {
      'System Administrator': { view: true, create: true, edit: true, approve: true, close: true },
      'Duty Manager': { view: true, create: true, edit: true, approve: true, close: true },
      'Duty Officer': { view: true, create: true, edit: true, approve: false, close: false },
      'Controller': { view: true, create: true, edit: true, approve: false, close: false },
      'Responder (Ranger)': { view: true, create: false, edit: true, approve: false, close: false },
      'Stakeholder': { view: true, create: false, edit: false, approve: false, close: false },
      'Broadcast Recipient': { view: false, create: false, edit: false, approve: false, close: false },
      'Operational Resilience Analyst': { view: true, create: false, edit: true, approve: false, close: false },
      'Non-SDC Term Contractor': { view: false, create: false, edit: false, approve: false, close: false }
    }
  },
  {
    module: 'Case Management',
    permissions: {
      'System Administrator': { view: true, create: true, edit: true, approve: true, close: true },
      'Duty Manager': { view: true, create: true, edit: true, approve: true, close: true },
      'Duty Officer': { view: true, create: true, edit: true, approve: true, close: true },
      'Controller': { view: true, create: true, edit: true, approve: false, close: false },
      'Responder (Ranger)': { view: false, create: false, edit: false, approve: false, close: false },
      'Stakeholder': { view: true, create: false, edit: false, approve: false, close: false },
      'Broadcast Recipient': { view: false, create: false, edit: false, approve: false, close: false },
      'Operational Resilience Analyst': { view: true, create: false, edit: false, approve: false, close: false },
      'Non-SDC Term Contractor': { view: false, create: false, edit: false, approve: false, close: false }
    }
  },
  {
    module: 'Fault Reporting',
    permissions: {
      'System Administrator': { view: true, create: true, edit: true, approve: true, close: true },
      'Duty Manager': { view: true, create: true, edit: true, approve: true, close: true },
      'Duty Officer': { view: true, create: true, edit: true, approve: true, close: true },
      'Controller': { view: true, create: true, edit: true, approve: false, close: true },
      'Responder (Ranger)': { view: true, create: false, edit: false, approve: false, close: false },
      'Stakeholder': { view: true, create: false, edit: false, approve: false, close: false },
      'Broadcast Recipient': { view: false, create: false, edit: false, approve: false, close: false },
      'Operational Resilience Analyst': { view: true, create: false, edit: false, approve: false, close: false },
      'Non-SDC Term Contractor': { view: true, create: false, edit: true, approve: false, close: false }
    }
  },
  {
    module: 'Task Management',
    permissions: {
      'System Administrator': { view: true, create: true, edit: true, approve: true, close: true },
      'Duty Manager': { view: true, create: true, edit: true, approve: true, close: true },
      'Duty Officer': { view: true, create: true, edit: true, approve: true, close: true },
      'Controller': { view: true, create: true, edit: true, approve: false, close: true },
      'Responder (Ranger)': { view: true, create: false, edit: true, approve: false, close: false },
      'Stakeholder': { view: true, create: false, edit: false, approve: false, close: false },
      'Broadcast Recipient': { view: false, create: false, edit: false, approve: false, close: false },
      'Operational Resilience Analyst': { view: true, create: false, edit: false, approve: false, close: false },
      'Non-SDC Term Contractor': { view: true, create: false, edit: true, approve: false, close: false }
    }
  },
  {
    module: 'e-Diary',
    permissions: {
      'System Administrator': { view: true, create: true, edit: true, approve: true, close: true },
      'Duty Manager': { view: true, create: true, edit: true, approve: false, close: true },
      'Duty Officer': { view: true, create: true, edit: true, approve: false, close: true },
      'Controller': { view: true, create: true, edit: true, approve: false, close: true },
      'Responder (Ranger)': { view: false, create: false, edit: false, approve: false, close: false },
      'Stakeholder': { view: true, create: false, edit: false, approve: false, close: false },
      'Broadcast Recipient': { view: false, create: false, edit: false, approve: false, close: false },
      'Operational Resilience Analyst': { view: true, create: false, edit: false, approve: false, close: false },
      'Non-SDC Term Contractor': { view: false, create: false, edit: false, approve: false, close: false }
    }
  },
  {
    module: 'Events Masterlist',
    permissions: {
      'System Administrator': { view: true, create: true, edit: true, approve: true, close: true },
      'Duty Manager': { view: true, create: true, edit: true, approve: true, close: true },
      'Duty Officer': { view: true, create: true, edit: true, approve: true, close: true },
      'Controller': { view: true, create: true, edit: true, approve: false, close: true },
      'Responder (Ranger)': { view: true, create: false, edit: false, approve: false, close: false },
      'Stakeholder': { view: true, create: false, edit: false, approve: false, close: false },
      'Broadcast Recipient': { view: false, create: false, edit: false, approve: false, close: false },
      'Operational Resilience Analyst': { view: true, create: false, edit: false, approve: false, close: false },
      'Non-SDC Term Contractor': { view: false, create: false, edit: false, approve: false, close: false }
    }
  },
  {
    module: 'Broadcast & Notification',
    permissions: {
      'System Administrator': { view: true, create: true, edit: true, approve: true, close: true },
      'Duty Manager': { view: true, create: true, edit: true, approve: true, close: true },
      'Duty Officer': { view: true, create: true, edit: true, approve: true, close: true },
      'Controller': { view: true, create: true, edit: true, approve: false, close: false },
      'Responder (Ranger)': { view: false, create: false, edit: false, approve: false, close: false },
      'Stakeholder': { view: false, create: false, edit: false, approve: false, close: false },
      'Broadcast Recipient': { view: true, create: false, edit: false, approve: false, close: false },
      'Operational Resilience Analyst': { view: false, create: false, edit: false, approve: false, close: false },
      'Non-SDC Term Contractor': { view: false, create: false, edit: false, approve: false, close: false }
    }
  },
  {
    module: 'Crisis Management',
    permissions: {
      'System Administrator': { view: true, create: true, edit: true, approve: true, close: true },
      'Duty Manager': { view: true, create: true, edit: true, approve: true, close: true },
      'Duty Officer': { view: true, create: true, edit: true, approve: true, close: true },
      'Controller': { view: true, create: true, edit: false, approve: false, close: false },
      'Responder (Ranger)': { view: true, create: false, edit: false, approve: false, close: false },
      'Stakeholder': { view: true, create: false, edit: false, approve: false, close: false },
      'Broadcast Recipient': { view: false, create: false, edit: false, approve: false, close: false },
      'Operational Resilience Analyst': { view: true, create: false, edit: false, approve: false, close: false },
      'Non-SDC Term Contractor': { view: false, create: false, edit: false, approve: false, close: false }
    }
  },
  {
    module: 'No Objection Permit (NOP)',
    permissions: {
      'System Administrator': { view: true, create: true, edit: true, approve: true, close: true },
      'Duty Manager': { view: true, create: true, edit: true, approve: true, close: true },
      'Duty Officer': { view: true, create: true, edit: true, approve: true, close: true },
      'Controller': { view: true, create: true, edit: true, approve: false, close: false },
      'Responder (Ranger)': { view: false, create: false, edit: false, approve: false, close: false },
      'Stakeholder': { view: true, create: false, edit: false, approve: false, close: false },
      'Broadcast Recipient': { view: false, create: false, edit: false, approve: false, close: false },
      'Operational Resilience Analyst': { view: true, create: false, edit: false, approve: false, close: false },
      'Non-SDC Term Contractor': { view: false, create: false, edit: false, approve: false, close: false }
    }
  }
];

export default function RoleManagementPage() {
  const { username } = useRole();
  const [activeRoleName, setActiveRoleName] = useState<string>('Controller');
  const [matrix, setMatrix] = useState<ModulePermission[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'roles' | 'matrix'>('roles');

  useEffect(() => {
    const stored = localStorage.getItem('admin_role_matrix');
    if (stored) {
      setMatrix(JSON.parse(stored));
    } else {
      setMatrix(DEFAULT_MATRIX);
      localStorage.setItem('admin_role_matrix', JSON.stringify(DEFAULT_MATRIX));
    }
  }, []);

  const handleStartEdit = () => {
    localStorage.setItem('admin_role_matrix_prev', JSON.stringify(matrix));
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    const stored = localStorage.getItem('admin_role_matrix');
    if (stored) {
      setMatrix(JSON.parse(stored));
    } else {
      setMatrix(DEFAULT_MATRIX);
    }
    setIsEditing(false);
  };

  const handleSaveMatrix = async () => {
    localStorage.setItem('admin_role_matrix', JSON.stringify(matrix));
    setIsEditing(false);
    
    try {
      await fetch('/api/admin/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: username || 'Admin Root',
          action: 'Update Role Matrix',
          module: 'Role Management',
          details: 'Updated CMS modules functional permission matrix overrides.',
          beforeSnapshot: localStorage.getItem('admin_role_matrix_prev') || '',
          afterSnapshot: JSON.stringify(matrix)
        })
      });
      localStorage.setItem('admin_role_matrix_prev', JSON.stringify(matrix));
    } catch (e) {
      console.error('Failed to log matrix update audit:', e);
    }
  };

  const handleTogglePermission = (moduleName: string, roleName: string, permissionType: 'view' | 'create' | 'edit' | 'approve' | 'close') => {
    if (!isEditing) return;
    setMatrix(prev => prev.map(row => {
      if (row.module === moduleName) {
        const currentRolePerms = row.permissions[roleName] || { view: false, create: false, edit: false, approve: false, close: false };
        return {
          ...row,
          permissions: {
            ...row.permissions,
            [roleName]: {
              ...currentRolePerms,
              [permissionType]: !currentRolePerms[permissionType]
            }
          }
        };
      }
      return row;
    }));
  };

  // Active selected role highlights matrix column
  const isActive = (roleName: string) => activeRoleName === roleName;

  return (
    <AdminGuard pageTitle="Role Management">
      <div className="admin-header-bar glass" style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>ROLE MANAGEMENT & PERMISSIONS</h1>
        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Audit the role architecture, access scopes, and module permission matrix mapping.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '2px' }}>
        {(['roles', 'matrix'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === tab ? '3px solid var(--color-primary)' : '3px solid transparent',
              color: activeTab === tab ? 'var(--color-primary-dark)' : 'var(--text-muted)',
              fontWeight: activeTab === tab ? 700 : 500,
              fontSize: '13.5px',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.15s ease'
            }}
          >
            {tab === 'roles' ? 'System Roles' : 'Role & Status Action Permission Matrix'}
          </button>
        ))}
      </div>

      {activeTab === 'roles' && (
        <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '20px' }}>
          <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', marginBottom: '15px', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>SYSTEM ROLES</h2>
          <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '250px' }}>Role Name</th>
                  <th style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Description</th>
                </tr>
              </thead>
              <tbody>
              {ROLES_LIST.map(role => (
                <tr
                  key={role.name}
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    background: 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease'
                  }}
                  onClick={() => setActiveRoleName(role.name)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0,0,0,0.015)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <td style={{
                    padding: '12px 16px',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    fontSize: '13px',
                    verticalAlign: 'top'
                  }}>
                    {role.name}
                  </td>
                  <td style={{
                    padding: '12px 16px',
                    fontSize: '12.5px',
                    color: 'var(--text-muted)',
                    lineHeight: '1.5',
                    verticalAlign: 'top'
                  }}>
                    {role.description}
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'matrix' && (
        <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', color: 'var(--text-main)', margin: 0 }}>
                ROLE & STATUS ACTION PERMISSION MATRIX
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Functional permissions mapped across the CMS. Cell values indicate permission to **View (V)**, **Create (C)**, **Edit (E)**, **Approve (A)**, and **Close (Cl)**.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              {isEditing ? (
                <>
                  <button onClick={handleCancelEdit} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px' }}>
                    Cancel
                  </button>
                  <button onClick={handleSaveMatrix} className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>
                    Save Matrix
                  </button>
                </>
              ) : (
                <button onClick={handleStartEdit} className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>
                  ✏️ Edit Matrix
                </button>
              )}
            </div>
          </div>

          <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflowX: 'auto' }}>
            <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '220px' }}>CMS Module</th>
                  {ROLES_LIST.map(role => (
                    <th
                      key={role.name}
                      style={{
                        padding: '12px 10px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: activeRoleName === role.name ? 'var(--color-primary-dark)' : 'var(--text-muted)',
                        textTransform: 'uppercase',
                        textAlign: 'center',
                        background: activeRoleName === role.name ? 'var(--color-primary-bg)' : 'transparent',
                        borderLeft: '1px solid var(--border-color)',
                        width: '120px'
                      }}
                    >
                      {role.name.split(' ').map(w => w.charAt(0)).join('')}
                      <span style={{ display: 'block', fontSize: '9px', fontWeight: 400, textTransform: 'none', marginTop: '2px', color: 'var(--text-muted)' }}>
                        {role.name.substring(0, 10)}...
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row) => (
                  <tr key={row.module} style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--text-main)' }}>{row.module}</td>
                    {ROLES_LIST.map(role => {
                      const perm = row.permissions[role.name];
                      const isSelected = activeRoleName === role.name;
                      return (
                        <td
                          key={role.name}
                          style={{
                            padding: '12px 10px',
                            textAlign: 'center',
                            borderLeft: '1px solid var(--border-color)',
                            background: isSelected ? 'rgba(255,130,0,0.03)' : 'transparent'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', fontSize: '10.5px', fontWeight: 700 }}>
                            {/* View */}
                            <span
                              onClick={() => handleTogglePermission(row.module, role.name, 'view')}
                              style={{
                                cursor: isEditing ? 'pointer' : 'default',
                                padding: '2px 4px',
                                borderRadius: '3px',
                                transition: 'all 0.12s ease',
                                color: perm?.view ? '#16A34A' : '#A3A3A3',
                                background: perm?.view ? 'rgba(22,163,74,0.08)' : 'transparent',
                                border: isEditing ? (perm?.view ? '1px solid #16A34A' : '1px dashed #D4D4D4') : '1px solid transparent',
                                opacity: isEditing || perm?.view ? 1 : 0.2
                              }}
                              title="View"
                            >
                              V
                            </span>

                            {/* Create */}
                            <span
                              onClick={() => handleTogglePermission(row.module, role.name, 'create')}
                              style={{
                                cursor: isEditing ? 'pointer' : 'default',
                                padding: '2px 4px',
                                borderRadius: '3px',
                                transition: 'all 0.12s ease',
                                color: perm?.create ? 'var(--color-primary-dark)' : '#A3A3A3',
                                background: perm?.create ? 'rgba(255,130,0,0.08)' : 'transparent',
                                border: isEditing ? (perm?.create ? '1px solid var(--color-primary-dark)' : '1px dashed #D4D4D4') : '1px solid transparent',
                                opacity: isEditing || perm?.create ? 1 : 0.2
                              }}
                              title="Create"
                            >
                              C
                            </span>

                            {/* Edit */}
                            <span
                              onClick={() => handleTogglePermission(row.module, role.name, 'edit')}
                              style={{
                                cursor: isEditing ? 'pointer' : 'default',
                                padding: '2px 4px',
                                borderRadius: '3px',
                                transition: 'all 0.12s ease',
                                color: perm?.edit ? '#2563EB' : '#A3A3A3',
                                background: perm?.edit ? 'rgba(37,99,235,0.08)' : 'transparent',
                                border: isEditing ? (perm?.edit ? '1px solid #2563EB' : '1px dashed #D4D4D4') : '1px solid transparent',
                                opacity: isEditing || perm?.edit ? 1 : 0.2
                              }}
                              title="Edit"
                            >
                              E
                            </span>

                            {/* Approve */}
                            <span
                              onClick={() => handleTogglePermission(row.module, role.name, 'approve')}
                              style={{
                                cursor: isEditing ? 'pointer' : 'default',
                                padding: '2px 4px',
                                borderRadius: '3px',
                                transition: 'all 0.12s ease',
                                color: perm?.approve ? 'var(--color-review)' : '#A3A3A3',
                                background: perm?.approve ? 'rgba(74,20,140,0.08)' : 'transparent',
                                border: isEditing ? (perm?.approve ? '1px solid var(--color-review)' : '1px dashed #D4D4D4') : '1px solid transparent',
                                opacity: isEditing || perm?.approve ? 1 : 0.2
                              }}
                              title="Approve"
                            >
                              A
                            </span>

                            {/* Close */}
                            <span
                              onClick={() => handleTogglePermission(row.module, role.name, 'close')}
                              style={{
                                cursor: isEditing ? 'pointer' : 'default',
                                padding: '2px 4px',
                                borderRadius: '3px',
                                transition: 'all 0.12s ease',
                                color: perm?.close ? 'var(--color-critical)' : '#A3A3A3',
                                background: perm?.close ? 'rgba(220,38,38,0.08)' : 'transparent',
                                border: isEditing ? (perm?.close ? '1px solid var(--color-critical)' : '1px dashed #D4D4D4') : '1px solid transparent',
                                opacity: isEditing || perm?.close ? 1 : 0.2
                              }}
                              title="Close"
                            >
                              Cl
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminGuard>
  );
}
