'use client';

import React, { useState, useEffect } from 'react';
import { AdminGuard } from '@/components/AdminGuard';
import { useRole } from '@/context/RoleContext';
import { TaxonomyItem, DEFAULT_REFERENCE_DATA } from '@/lib/taxonomy';

export default function TaxonomyPage() {
  const { username } = useRole();
  const [activeTab, setActiveTab] = useState<'Incident' | 'Fault' | 'Priority' | 'eDiary' | 'Event'>('Incident');
  const [items, setItems] = useState<TaxonomyItem[]>([]);
  
  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<TaxonomyItem | null>(null);
  
  // Form fields
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [subTypeInput, setSubTypeInput] = useState('');
  const [formSubTypes, setFormSubTypes] = useState<string[]>([]);
  const [formStatus, setFormStatus] = useState<'Active' | 'Deactivated'>('Active');
  
  // Audit drawer state
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('admin_reference_data');
    if (stored) {
      setItems(JSON.parse(stored));
    } else {
      setItems(DEFAULT_REFERENCE_DATA);
      localStorage.setItem('admin_reference_data', JSON.stringify(DEFAULT_REFERENCE_DATA));
    }
  }, []);

  const saveReferenceState = (updated: TaxonomyItem[]) => {
    setItems(updated);
    localStorage.setItem('admin_reference_data', JSON.stringify(updated));
  };

  const logAudit = async (action: string, before: any, after: any, details: string) => {
    try {
      await fetch('/api/admin/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: username,
          module: 'Taxonomy',
          action,
          details,
          beforeSnapshot: JSON.stringify(before),
          afterSnapshot: JSON.stringify(after),
          correlationId: `REF-${Date.now()}`
        })
      });
    } catch (e) {
      console.error('Audit logging failed:', e);
    }
  };

  const loadAuditHistory = async () => {
    try {
      const res = await fetch('/api/admin/audit');
      if (res.ok) {
        const allLogs = await res.json();
        const refLogs = allLogs.filter((l: any) => l.module === 'Taxonomy');
        setAuditLogs(refLogs);
        setIsAuditDrawerOpen(true);
      }
    } catch (e) {
      console.error('Failed to load audits:', e);
    }
  };

  const handleCreateOrEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItem) {
      // Edit
      const updated = items.map(item => {
        if (item.id === selectedItem.id) {
          return {
            ...item,
            name: formName,
            description: formDesc,
            subTypes: activeTab === 'Incident' || activeTab === 'Fault' ? formSubTypes : undefined,
            status: formStatus
          };
        }
        return item;
      });
      const updatedItem = updated.find(i => i.id === selectedItem.id);
      logAudit('Update Taxonomy', selectedItem, updatedItem, `Updated ${activeTab} taxonomy: ${formName}`);
      saveReferenceState(updated);
    } else {
      // Create
      const newItem: TaxonomyItem = {
        id: `ref-${Date.now()}`,
        category: activeTab,
        name: formName,
        description: formDesc,
        subTypes: activeTab === 'Incident' || activeTab === 'Fault' ? formSubTypes : undefined,
        status: 'Active'
      };
      logAudit('Create Taxonomy', null, newItem, `Created new ${activeTab} taxonomy: ${formName}`);
      saveReferenceState([...items, newItem]);
    }
    setIsModalOpen(false);
    resetForm();
  };

  const openCreate = () => {
    setSelectedItem(null);
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (item: TaxonomyItem) => {
    setSelectedItem(item);
    setFormName(item.name);
    setFormDesc(item.description || '');
    setFormSubTypes(item.subTypes || []);
    setSubTypeInput('');
    setFormStatus(item.status);
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setFormName('');
    setFormDesc('');
    setSubTypeInput('');
    setFormSubTypes([]);
    setFormStatus('Active');
  };

  const addSubType = () => {
    if (subTypeInput.trim() && !formSubTypes.includes(subTypeInput.trim())) {
      setFormSubTypes([...formSubTypes, subTypeInput.trim()]);
      setSubTypeInput('');
    }
  };

  const removeSubType = (sub: string) => {
    setFormSubTypes(formSubTypes.filter(s => s !== sub));
  };

  const activeItems = items.filter(i => i.category === activeTab);

  const TAB_GUIDES: Record<typeof activeTab, string> = {
    Incident: 'Define incident classifications and their sub-types used when logging a new Incident case.',
    Fault: 'Define fault classifications and their sub-types used when logging a new Fault case.',
    Priority: 'Define the priority levels available when assigning and escalating tasks.',
    eDiary: 'Define the topic categories available when writing a new e-Diary entry.',
    Event: 'Define the event types available when planning a new Event.'
  };

  return (
    <AdminGuard pageTitle="Taxonomy">
      <div className="admin-header-bar glass" style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>SYSTEM TAXONOMY</h1>
        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Configure categorization taxonomy codes, incident classification trees, task priorities, e-diary topics, and event types.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '2px' }}>
        {(['Incident', 'Fault', 'Priority', 'eDiary', 'Event'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); resetForm(); }}
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
            {tab === 'Incident' && 'Incident Type Taxonomy'}
            {tab === 'Fault' && 'Fault Type Taxonomy'}
            {tab === 'Priority' && 'Task Priority Levels'}
            {tab === 'eDiary' && 'e-Diary Topic Categories'}
            {tab === 'Event' && 'Event Type Taxonomy'}
          </button>
        ))}
      </div>

      {/* Active configuration panel */}
      <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '12.5px', color: 'var(--text-sub)', flex: 1 }}>
            <span>💡</span>
            <span>{TAB_GUIDES[activeTab]}</span>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
            <button onClick={loadAuditHistory} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📜</span> View Audit History
            </button>
            <button onClick={openCreate} className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff', cursor: 'pointer' }}>
              <span>+</span> Add Category
            </button>
          </div>
        </div>
        <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Classification / Name</th>
                {(activeTab === 'Incident' || activeTab === 'Fault') ? (
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sub-Types</th>
                ) : (
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Description</th>
                )}
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '140px' }}>Status</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '180px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeItems.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No taxonomy items configured.</td>
                </tr>
              ) : (
                activeItems.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-main)' }}>{item.name}</td>
                    {(activeTab === 'Incident' || activeTab === 'Fault') ? (
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {item.subTypes?.map(sub => (
                            <span key={sub} className="badge badge-closed" style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11.5px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', color: 'var(--text-sub)' }}>
                              {sub}
                            </span>
                          ))}
                          {(!item.subTypes || item.subTypes.length === 0) && <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>None configured</span>}
                        </div>
                      </td>
                    ) : (
                      <td style={{ padding: '12px 16px', color: 'var(--text-sub)', fontSize: '13px' }}>{item.description || '-'}</td>
                    )}
                    <td style={{ padding: '12px 16px' }}>
                      <span className={`badge ${item.status === 'Active' ? 'badge-completed' : 'badge-live'}`} style={{ padding: '2px 8px', borderRadius: '4px' }}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={() => openEdit(item)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11.5px', borderRadius: '4px' }}>
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

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '500px', padding: '24px', background: 'var(--bg-card)' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '20px' }}>
              {selectedItem ? `Edit ${activeTab} Item` : `Add New ${activeTab} Item`}
            </h2>
            <form onSubmit={handleCreateOrEdit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>
                  {activeTab === 'Incident' || activeTab === 'Fault' ? 'Classification Name' : 'Value Label'}
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>

              {(activeTab === 'Incident' || activeTab === 'Fault') ? (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Sub-Types</label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    <input
                      type="text"
                      placeholder="Add sub-type..."
                      value={subTypeInput}
                      onChange={e => setSubTypeInput(e.target.value)}
                      style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                    />
                    <button type="button" onClick={addSubType} className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '13px' }}>Add</button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '40px', padding: '10px', background: 'var(--bg-inset)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    {formSubTypes.map(sub => (
                      <span key={sub} className="badge badge-closed" style={{ padding: '3px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                        {sub}
                        <button type="button" onClick={() => removeSubType(sub)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-critical)', padding: 0, fontWeight: 700 }}>×</button>
                      </span>
                    ))}
                    {formSubTypes.length === 0 && <span style={{ color: 'var(--text-faint)', fontSize: '12px', margin: 'auto' }}>No sub-types added yet.</span>}
                  </div>
                </div>
              ) : (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Description</label>
                  <textarea
                    rows={3}
                    value={formDesc}
                    onChange={e => setFormDesc(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', resize: 'vertical' }}
                  />
                </div>
              )}

              {selectedItem && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Status</label>
                  <select
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value as 'Active' | 'Deactivated')}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                  >
                    <option value="Active">Active</option>
                    <option value="Deactivated">Deactivated</option>
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AUDIT LOG DRAWER */}
      {isAuditDrawerOpen && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '460px', background: 'var(--bg-card)', zIndex: 1001, boxShadow: '-4px 0 24px rgba(0,0,0,0.15)', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '16px', margin: 0 }}>Taxonomy Audit History</h2>
            <button onClick={() => setIsAuditDrawerOpen(false)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {auditLogs.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>No audit history found for taxonomy.</div>
            ) : (
              auditLogs.map(log => (
                <div key={log.id} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                    <strong>{log.user}</strong>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-main)' }}>{log.action}</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-sub)' }}>{log.details}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </AdminGuard>
  );
}
