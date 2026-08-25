'use client';

// Recall Group — member management page.
// Synchronized UX & design with Broadcast distribution group detail page
// (admin/broadcast-config/distribution-groups/[id]/page.tsx).

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AdminGuard } from '@/components/AdminGuard';
import { useRole } from '@/context/RoleContext';
import { hasCrisisPermission } from '@/lib/permissions';
import { getUsers } from '@/lib/users';
import type { UserAccount } from '@/lib/users';
import { mobileWarning, isValidSgMobile, normalizeMobile } from '@/lib/crisisConfig';
import type { RecallGroup, RecallGroupMember } from '@/lib/crisisConfig';

const EXTERNAL_ROLE_HINTS = ['Broadcast Recipient', 'Non-SDC Term Contractor'];

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

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-sub)', marginBottom: '4px' };
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border-color)',
  borderRadius: '6px',
  fontSize: '13px',
  background: 'var(--bg-inset)',
  color: 'var(--text-main)',
};

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export default function RecallGroupMembersPage() {
  const params = useParams();
  const groupId = decodeURIComponent(String(params.id));
  const { username } = useRole();

  const [groups, setGroups] = useState<RecallGroup[]>([]);
  const [allUsers, setAllUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isEditGroupModalOpen, setIsEditGroupModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<RecallGroupMember | null>(null);

  const [memberSource, setMemberSource] = useState<'existing' | 'external'>('existing');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const userPickerRef = useRef<HTMLDivElement>(null);

  const [formMemberName, setFormMemberName] = useState('');
  const [formMemberEmail, setFormMemberEmail] = useState('');
  const [formMemberMobile, setFormMemberMobile] = useState('');
  const [formMemberRole, setFormMemberRole] = useState('');
  const [formMemberRemark, setFormMemberRemark] = useState('');

  const [formGroupName, setFormGroupName] = useState('');
  const [formGroupDesc, setFormGroupDesc] = useState('');
  const [formGroupStatus, setFormGroupStatus] = useState<'Active' | 'Inactive'>('Active');

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userPickerRef.current && !userPickerRef.current.contains(e.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const g = await fetch('/api/admin/crisis-config/recall-groups').then((r) => r.json());
        setGroups(Array.isArray(g) ? g : []);
        setAllUsers(getUsers());
      } catch (e) {
        console.error('Failed to load recall groups', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedGroup = groups.find((g) => g.id === groupId);

  const persist = async (next: RecallGroup[], action: string, details: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/crisis-config/recall-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups: next, actor: username }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      setGroups(next);
      fetch('/api/admin/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: username,
          module: 'Crisis Configuration',
          action,
          details,
          correlationId: `CRS-${Date.now()}`,
        }),
      }).catch(() => {});
    } catch (e: any) {
      alert(`Could not save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const resetMemberForm = () => {
    setMemberSource('existing');
    setSelectedUserIds([]);
    setUserSearch('');
    setIsUserDropdownOpen(false);
    setFormMemberName('');
    setFormMemberEmail('');
    setFormMemberMobile('');
    setFormMemberRole('');
    setFormMemberRemark('');
  };

  const isAlreadyMember = (user: UserAccount) => {
    if (!selectedGroup) return false;
    return selectedGroup.members.some(
      (m) => m.userId === user.id || (m.email && m.email.toLowerCase() === user.email.toLowerCase())
    );
  };

  const selectableUsers = allUsers.filter((u) => {
    if (u.status !== 'Active') return false;
    if (isAlreadyMember(u)) return false;
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.department.toLowerCase().includes(q);
  });

  const toggleUserSelected = (id: string) => {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const openAddMember = () => {
    resetMemberForm();
    setIsMemberModalOpen(true);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;

    let newMembers: RecallGroupMember[];
    if (memberSource === 'existing') {
      if (selectedUserIds.length === 0) return;
      newMembers = selectedUserIds
        .map((id) => allUsers.find((u) => u.id === id))
        .filter((u): u is UserAccount => !!u)
        .map((user, i) => ({
          id: genId('rgm'),
          name: user.name,
          roleInGroup: user.role || '',
          mobile: normalizeMobile(user.phone || ''),
          email: user.email || '',
          tier: 'Tier 1 — Primary',
          membershipStatus: 'Active',
          userId: user.id,
        }));
    } else {
      if (!formMemberName.trim()) return alert('Member name is required.');
      if (!formMemberMobile.trim()) return alert('Mobile phone is required for crisis recall members.');
      const warn = mobileWarning(formMemberMobile);
      if (warn) {
        const ok = confirm(`${warn}\n\nSave anyway?`);
        if (!ok) return;
      }
      newMembers = [
        {
          id: genId('rgm'),
          name: formMemberName.trim(),
          roleInGroup: formMemberRole.trim(),
          mobile: normalizeMobile(formMemberMobile),
          email: formMemberEmail.trim(),
          tier: 'Tier 1 — Primary',
          membershipStatus: 'Active',
          remark: formMemberRemark.trim() || undefined,
        },
      ];
    }

    const updatedMembers = [...selectedGroup.members, ...newMembers];
    const next = groups.map((g) => (g.id === selectedGroup.id ? { ...g, members: updatedMembers } : g));
    const names = newMembers.map((m) => m.name).join(', ');
    await persist(next, 'Add Recall Group Member', `Added member(s) to "${selectedGroup.name}": ${names}`);
    setIsMemberModalOpen(false);
    resetMemberForm();
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!selectedGroup) return;
    const ok = confirm(`Are you sure you want to remove ${memberName} from this recall group?`);
    if (!ok) return;
    const updatedMembers = selectedGroup.members.filter((m) => m.id !== memberId);
    const next = groups.map((g) => (g.id === selectedGroup.id ? { ...g, members: updatedMembers } : g));
    await persist(next, 'Remove Recall Group Member', `Removed member "${memberName}" from "${selectedGroup.name}".`);
  };

  const openEditMember = (member: RecallGroupMember) => {
    setEditingMember({ ...member });
  };

  const handleSaveEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup || !editingMember) return;
    if (!editingMember.name.trim()) return alert('Member name is required.');
    if (!editingMember.mobile.trim()) return alert('Mobile phone is required for crisis recall members.');

    const warn = mobileWarning(editingMember.mobile);
    if (warn) {
      const ok = confirm(`${warn}\n\nSave anyway?`);
      if (!ok) return;
    }

    const updatedMember = { ...editingMember, mobile: normalizeMobile(editingMember.mobile) };
    const updatedMembers = selectedGroup.members.map((m) => (m.id === updatedMember.id ? updatedMember : m));
    const next = groups.map((g) => (g.id === selectedGroup.id ? { ...g, members: updatedMembers } : g));
    await persist(next, 'Edit Recall Group Member', `Updated member "${updatedMember.name}" in "${selectedGroup.name}".`);
    setEditingMember(null);
  };

  const openEditGroup = () => {
    if (!selectedGroup) return;
    setFormGroupName(selectedGroup.name);
    setFormGroupDesc(selectedGroup.description);
    setFormGroupStatus(selectedGroup.status);
    setIsEditGroupModalOpen(true);
  };

  const handleEditGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;
    if (!formGroupName.trim()) return;

    const next = groups.map((g) =>
      g.id === selectedGroup.id ? { ...g, name: formGroupName.trim(), description: formGroupDesc.trim(), status: formGroupStatus } : g
    );
    await persist(next, 'Update Recall Group Info', `Updated recall group "${formGroupName.trim()}".`);
    setIsEditGroupModalOpen(false);
  };

  const toggleGroupStatus = async () => {
    if (!selectedGroup) return;
    const newStatus: 'Active' | 'Inactive' = selectedGroup.status === 'Active' ? 'Inactive' : 'Active';
    const next: RecallGroup[] = groups.map((g) => (g.id === selectedGroup.id ? { ...g, status: newStatus } : g));
    await persist(
      next,
      'Change Recall Group Status',
      `Recall group "${selectedGroup.name}" set to ${newStatus}.`
    );
  };

  if (loading) {
    return (
      <AdminGuard pageTitle="Crisis Configuration" permissionCheck={(r) => hasCrisisPermission(r, 'crisis.config')}>
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading recall group…</div>
      </AdminGuard>
    );
  }

  if (!selectedGroup) {
    return (
      <AdminGuard pageTitle="Crisis Configuration" permissionCheck={(r) => hasCrisisPermission(r, 'crisis.config')}>
        <div className="glass" style={{ padding: '40px', textAlign: 'center', color: 'var(--color-critical)' }}>
          <p>Recall group not found.</p>
          <Link href="/admin/crisis-config" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontSize: '13px' }}>
            ← Back to Crisis Configuration
          </Link>
        </div>
      </AdminGuard>
    );
  }

  return (
    <AdminGuard pageTitle="Crisis Configuration" permissionCheck={(r) => hasCrisisPermission(r, 'crisis.config')}>
      {/* Header Bar */}
      <div className="admin-header-bar glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <Link href="/admin/crisis-config" style={{ color: 'var(--text-faint)', fontSize: '12px', textDecoration: 'none' }}>
              ← Crisis Configuration
            </Link>
            <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>/</span>
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-primary-dark)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>RECALL GROUP MEMBERS</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>{selectedGroup.name}</h1>
            <span className={`badge ${selectedGroup.status === 'Active' ? 'badge-completed' : 'badge-live'}`} style={{ padding: '2px 8px', borderRadius: '4px' }}>
              {selectedGroup.status}
            </span>
          </div>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{selectedGroup.description || 'Recall group members'}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={toggleGroupStatus}
            disabled={saving}
            className="btn btn-secondary"
            style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}
          >
            {selectedGroup.status === 'Active' ? 'Deactivate' : 'Reactivate'}
          </button>
          <button
            onClick={openEditGroup}
            className="btn btn-secondary"
            style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}
          >
            Edit
          </button>
        </div>
      </div>

      {/* Main Members Card */}
      <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '12.5px', color: 'var(--text-sub)' }}>
            Total Members: <strong>{selectedGroup.members.length}</strong>
          </span>
          <button
            onClick={openAddMember}
            disabled={selectedGroup.status !== 'Active'}
            className="btn btn-primary"
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12.5px',
              fontWeight: 600,
              background: 'var(--color-primary-dark)',
              border: 'none',
              color: '#fff',
              cursor: selectedGroup.status !== 'Active' ? 'not-allowed' : 'pointer',
              opacity: selectedGroup.status !== 'Active' ? 0.5 : 1,
            }}
          >
            + Add Member
          </button>
        </div>

        <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Contact Info</th>
                <th style={{ ...thStyle, width: '130px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {selectedGroup.members.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No members in this group.</td>
                </tr>
              ) : (
                selectedGroup.members.map((member) => {
                  const warn = mobileWarning(member.mobile);
                  const isInternal = !!member.userId;
                  return (
                    <tr key={member.id} style={{ borderBottom: '1px solid var(--border-color)', opacity: member.membershipStatus === 'Active' ? 1 : 0.55 }}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        <div>{member.name}</div>
                        {member.roleInGroup && (
                          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 400 }}>
                            {member.roleInGroup}
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span className={`badge ${isInternal ? 'badge-onsite' : 'badge-review'}`} style={{ padding: '1px 6px', borderRadius: '3px', fontSize: '10.5px' }}>
                          {isInternal ? 'INTERNAL' : 'EXTERNAL'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-sub)' }}>
                        <div>{member.email || '—'}</div>
                        <div>
                          {member.mobile || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          {warn && (
                            <span className="badge badge-critical" style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10.5px', marginLeft: '6px' }}>
                              unreachable
                            </span>
                          )}
                        </div>
                        {member.remark && (
                          <div style={{ marginTop: '2px', fontSize: '11.5px', fontStyle: 'italic', color: 'var(--text-muted)' }}>
                            Note: {member.remark}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <button
                          onClick={() => openEditMember(member)}
                          style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 600, padding: 0, fontSize: '12.5px', marginRight: '12px' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleRemoveMember(member.id, member.name)}
                          style={{ background: 'none', border: 'none', color: 'var(--color-critical)', cursor: 'pointer', fontWeight: 600, padding: 0, fontSize: '12.5px' }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD MEMBER MODAL */}
      {isMemberModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '480px', height: '560px', maxWidth: '92vw', maxHeight: '90vh', padding: '24px', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '20px', flexShrink: 0 }}>
              Add Member to {selectedGroup.name}
            </h2>
            <form onSubmit={handleAddMember} style={{ display: 'flex', flexDirection: 'column', gap: '15px', flex: 1, minHeight: 0 }}>
              {/* Source toggle */}
              <div style={{ display: 'flex', gap: '8px', padding: '4px', background: 'var(--bg-inset)', borderRadius: '8px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setMemberSource('existing')}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                    fontSize: '12.5px', fontWeight: 700,
                    background: memberSource === 'existing' ? 'var(--color-primary-dark)' : 'transparent',
                    color: memberSource === 'existing' ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  Existing CMS User
                </button>
                <button
                  type="button"
                  onClick={() => setMemberSource('external')}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                    fontSize: '12.5px', fontWeight: 700,
                    background: memberSource === 'external' ? 'var(--color-primary-dark)' : 'transparent',
                    color: memberSource === 'external' ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  External Contact
                </button>
              </div>

              {memberSource === 'existing' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0 }}>
                  <label style={labelStyle}>Select Active CMS Users</label>
                  <div ref={userPickerRef} style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <input
                      type="text"
                      placeholder="Search users by name, email or department…"
                      value={userSearch}
                      onChange={(e) => {
                        setUserSearch(e.target.value);
                        setIsUserDropdownOpen(true);
                      }}
                      onFocus={() => setIsUserDropdownOpen(true)}
                      style={inputStyle}
                    />
                    <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', marginTop: '8px', background: 'var(--bg-inset)', padding: '6px' }}>
                      {selectableUsers.length === 0 ? (
                        <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>No matching users available.</div>
                      ) : (
                        selectableUsers.map((u) => {
                          const checked = selectedUserIds.includes(u.id);
                          return (
                            <label
                              key={u.id}
                              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '4px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', background: checked ? 'var(--bg-card)' : 'transparent' }}
                            >
                              <input type="checkbox" checked={checked} onChange={() => toggleUserSelected(u.id)} />
                              <div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{u.name}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{u.email} · {u.department || u.role}</div>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1 }}>
                  <div>
                    <label style={labelStyle}>Contact Name</label>
                    <input type="text" required value={formMemberName} onChange={(e) => setFormMemberName(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Role in Group</label>
                    <input type="text" placeholder="e.g. Incident Commander" value={formMemberRole} onChange={(e) => setFormMemberRole(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>
                      Mobile Phone (+65 8xxxxxxx / 9xxxxxxx) <span style={{ color: 'var(--color-critical)' }}>*</span>
                    </label>
                    <input type="text" required placeholder="+65 9123 4567" value={formMemberMobile} onChange={(e) => setFormMemberMobile(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Email Address</label>
                    <input type="email" placeholder="contact@domain.com" value={formMemberEmail} onChange={(e) => setFormMemberEmail(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Remark / Note (Optional)</label>
                    <input type="text" value={formMemberRemark} onChange={(e) => setFormMemberRemark(e.target.value)} style={inputStyle} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
                <button type="button" onClick={() => setIsMemberModalOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Add Member</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MEMBER MODAL */}
      {editingMember && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '480px', padding: '24px', background: 'var(--bg-card)' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '20px' }}>Edit Member</h2>
            <form onSubmit={handleSaveEditMember} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Contact Name</label>
                <input type="text" required value={editingMember.name} onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Role in Group</label>
                <input type="text" value={editingMember.roleInGroup || ''} onChange={(e) => setEditingMember({ ...editingMember, roleInGroup: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>
                  Mobile Phone (+65 8xxxxxxx / 9xxxxxxx) <span style={{ color: 'var(--color-critical)' }}>*</span>
                </label>
                <input type="text" required value={editingMember.mobile || ''} onChange={(e) => setEditingMember({ ...editingMember, mobile: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Email Address</label>
                <input type="email" value={editingMember.email || ''} onChange={(e) => setEditingMember({ ...editingMember, email: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Remark / Note (Optional)</label>
                <input type="text" value={editingMember.remark || ''} onChange={(e) => setEditingMember({ ...editingMember, remark: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" onClick={() => setEditingMember(null)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT GROUP MODAL */}
      {isEditGroupModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '480px', padding: '24px', background: 'var(--bg-card)' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '20px' }}>Edit Recall Group</h2>
            <form onSubmit={handleEditGroup} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={labelStyle}>Group Name</label>
                <input type="text" required value={formGroupName} onChange={(e) => setFormGroupName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <textarea rows={3} required value={formGroupDesc} onChange={(e) => setFormGroupDesc(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select value={formGroupStatus} onChange={(e) => setFormGroupStatus(e.target.value as 'Active' | 'Inactive')} style={inputStyle}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsEditGroupModalOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminGuard>
  );
}
