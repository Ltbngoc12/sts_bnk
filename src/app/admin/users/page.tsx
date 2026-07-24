'use client';

import React, { useState, useEffect } from 'react';
import { AdminGuard } from '@/components/AdminGuard';
import { useRole } from '@/context/RoleContext';
import { UserAccount, getUsers, saveUsers } from '@/lib/users';

const ROLES_DETAILS: Record<string, { desc: string; scope: string }> = {
  'System Administrator': { desc: 'Full system management rights including user provisioning, configuration, taxonomy editing, and system settings.', scope: 'Global Administrative access.' },
  'Duty Manager': { desc: 'Senior operational authority on shift. Endorsement of incident closure, notifications, and NOPs.', scope: 'Full read/write operational modules.' },
  'Duty Officer': { desc: 'Supervises IOH Controllers. Elevated to Duty Manager role when manager is absent.', scope: 'Full operational access.' },
  'Controller': { desc: 'Primary operator. Creates incidents, logs tasks, manages cases, and submitted incident records.', scope: 'Full case editing, cannot independently close incidents.' },
  'Responder': { desc: 'Field responders. Updates incident response milestones and logs progress on tasks.', scope: 'Limited to assigned incident and task records.' },
  'Stakeholder': { desc: 'View-only access to case records relevant to their department or zone.', scope: 'Read-only access.' },
  'Broadcast Recipient': { desc: 'Receives broadcast notifications. No system access.', scope: 'No login permissions.' },
  'Operational Resilience Analyst': { desc: 'Post-incident analysis, tagging, classification, and CSV exporting.', scope: 'Read-only access to closed incidents.' },
  'Non-SDC Term Contractor': { desc: 'External contractors responding to CMMS facility issues.', scope: 'Access restricted to assigned tasks/fault tickets.' }
};

export default function UserManagementPage() {
  const { username } = useRole();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [authFilter, setAuthFilter] = useState('All');

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);
  
  // Form fields
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formDept, setFormDept] = useState('');
  const [formOrg, setFormOrg] = useState('');
  const [formAuth, setFormAuth] = useState<'WOG SSO' | 'Non-SSO'>('WOG SSO');
  const [formRole, setFormRole] = useState('Controller');
  const [formStatus, setFormStatus] = useState<'Active' | 'Deactivated'>('Active');

  useEffect(() => {
    setUsers(getUsers());
  }, []);

  const saveUsersState = (updated: UserAccount[]) => {
    setUsers(updated);
    saveUsers(updated);
  };

  const logAudit = async (action: string, before: any, after: any, details: string) => {
    try {
      await fetch('/api/admin/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: username,
          module: 'User Management',
          action,
          details,
          beforeSnapshot: JSON.stringify(before),
          afterSnapshot: JSON.stringify(after),
          correlationId: `USR-${Date.now()}`
        })
      });
    } catch (e) {
      console.error('Audit logging failed:', e);
    }
  };

  const handleCreateOrEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUser) {
      // Edit
      const updatedUsers = users.map(u => {
        if (u.id === selectedUser.id) {
          return {
            ...u,
            name: formName,
            email: formEmail,
            phone: formPhone,
            department: formDept,
            orgUnit: formOrg,
            authSource: formAuth,
            role: formRole,
            status: formStatus
          };
        }
        return u;
      });
      const updatedUser = updatedUsers.find(u => u.id === selectedUser.id);
      logAudit('Edit User', selectedUser, updatedUser, `Modified user account: ${formEmail}`);
      saveUsersState(updatedUsers);
    } else {
      // Create
      const newUser: UserAccount = {
        id: String(Date.now()),
        name: formName,
        email: formEmail,
        phone: formPhone,
        department: formDept,
        orgUnit: formOrg,
        authSource: formAuth,
        role: formRole,
        status: formStatus,
        lastLogin: 'Never'
      };
      logAudit('Create User', null, newUser, `Created user account: ${formEmail}`);
      saveUsersState([...users, newUser]);
    }
    setIsModalOpen(false);
    resetForm();
  };

  const handleToggleStatus = (user: UserAccount) => {
    const newStatus = user.status === 'Active' ? 'Deactivated' : 'Active';
    const updatedUsers = users.map(u => {
      if (u.id === user.id) {
        return { ...u, status: newStatus as 'Active' | 'Deactivated' };
      }
      return u;
    });
    logAudit(
      newStatus === 'Active' ? 'Reactivate User' : 'Deactivate User',
      user,
      { ...user, status: newStatus },
      `${newStatus === 'Active' ? 'Reactivated' : 'Deactivated'} account: ${user.email}`
    );
    saveUsersState(updatedUsers);
  };

  const openEdit = (user: UserAccount) => {
    setSelectedUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormPhone(user.phone);
    setFormDept(user.department);
    setFormOrg(user.orgUnit);
    setFormAuth(user.authSource);
    setFormRole(user.role);
    setFormStatus(user.status);
    setIsModalOpen(true);
  };

  const openCreate = () => {
    setSelectedUser(null);
    resetForm();
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormDept('');
    setFormOrg('');
    setFormAuth('WOG SSO');
    setFormRole('Controller');
    setFormStatus('Active');
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase()) || u.department.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'All' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'All' || u.status === statusFilter;
    const matchesAuth = authFilter === 'All' || u.authSource === authFilter;
    return matchesSearch && matchesRole && matchesStatus && matchesAuth;
  });

  return (
    <AdminGuard pageTitle="User Management">
      <div className="admin-header-bar glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>USER ACCOUNTS</h1>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Supervise user onboarding, SSO provisioning, and operational roles mapping.</p>
        </div>
        <button onClick={openCreate} className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <span>+</span> Create User
        </button>
      </div>

      <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '20px' }}>
        {/* Search and Filters grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px' }}>Search</label>
            <input
              type="text"
              placeholder="Search name, email..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px' }}>Role</label>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
            >
              <option value="All">All Roles</option>
              {Object.keys(ROLES_DETAILS).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px' }}>Authentication</label>
            <select
              value={authFilter}
              onChange={e => setAuthFilter(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
            >
              <option value="All">All Sources</option>
              <option value="WOG SSO">WOG SSO</option>
              <option value="Non-SSO">Non-SSO / Manual</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px' }}>Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Deactivated">Deactivated</option>
            </select>
          </div>
        </div>

        {/* Users Table */}
        <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Name</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Email</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Phone</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Department</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Auth</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Role</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Last Login</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No accounts found matching criteria.</td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.id} style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{user.name}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-sub)' }}>{user.email}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12.5px', color: 'var(--text-sub)' }}>{user.phone}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12.5px' }}>{user.department}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12px' }}>
                      <span className={`badge ${user.authSource === 'WOG SSO' ? 'badge-onsite' : 'badge-closed'}`} style={{ padding: '2px 6px', borderRadius: '4px' }}>
                        {user.authSource}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)' }}>
                      {user.role}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className={`badge ${user.status === 'Active' ? 'badge-completed' : 'badge-live'}`} style={{ padding: '2px 8px', borderRadius: '4px' }}>
                        {user.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      {user.lastLogin !== 'Never' ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={() => openEdit(user)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11.5px', borderRadius: '4px' }}>
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE / EDIT USER MODAL */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '520px', padding: '24px', background: 'var(--bg-card)', position: 'relative' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '20px' }}>
              {selectedUser ? 'Edit User Account' : 'Provision New Account'}
            </h2>
            <form onSubmit={handleCreateOrEdit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Full Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Email Address</label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Mobile Phone</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. +65 9123 4567"
                    value={formPhone}
                    onChange={e => setFormPhone(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Department</label>
                  <input
                    type="text"
                    required
                    value={formDept}
                    onChange={e => setFormDept(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Auth Source</label>
                  <select
                    value={formAuth}
                    onChange={e => setFormAuth(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                  >
                    <option value="WOG SSO">WOG SSO</option>
                    <option value="Non-SSO">Non-SSO (Manual)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Role Assignment</label>
                  <select
                    value={formRole}
                    onChange={e => setFormRole(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                  >
                    {Object.keys(ROLES_DETAILS).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              {selectedUser && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Status</label>
                  <select
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                  >
                    <option value="Active">Active</option>
                    <option value="Deactivated">Deactivated</option>
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Save changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminGuard>
  );
}
