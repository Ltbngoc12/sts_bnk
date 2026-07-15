'use client';

import React, { useState, useEffect } from 'react';
import { AdminGuard } from '@/components/AdminGuard';
import { useRole } from '@/context/RoleContext';
import {
  ChecklistTemplate,
  ChecklistTemplateItem,
  getChecklistTemplates,
  saveChecklistTemplates,
} from '@/lib/checklistTemplates';
import { getTaskPriorityTaxonomy } from '@/lib/taxonomy';

export default function TaskChecklistTemplatesPage() {
  const { username } = useRole();
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [priorityOptions, setPriorityOptions] = useState<string[]>(['Low', 'Normal', 'High', 'Critical']);

  // Modal state
  const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplate | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPriority, setFormPriority] = useState('Normal');
  const [formStatus, setFormStatus] = useState<'Active' | 'Deactivated'>('Active');
  const [formChecklist, setFormChecklist] = useState<ChecklistTemplateItem[]>([]);
  const [formChecklistInput, setFormChecklistInput] = useState('');

  useEffect(() => {
    setTemplates(getChecklistTemplates());
    setPriorityOptions(getTaskPriorityTaxonomy());
  }, []);

  const persist = (updated: ChecklistTemplate[]) => {
    setTemplates(updated);
    saveChecklistTemplates(updated);
  };

  const logAudit = async (action: string, before: any, after: any, details: string) => {
    try {
      await fetch('/api/admin/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: username,
          module: 'Task Checklist Templates',
          action,
          details,
          beforeSnapshot: JSON.stringify(before),
          afterSnapshot: JSON.stringify(after),
          correlationId: `TPL-${Date.now()}`,
        }),
      });
    } catch (e) {
      console.error('Audit logging failed:', e);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormDesc('');
    setFormPriority('Normal');
    setFormStatus('Active');
    setFormChecklist([]);
    setFormChecklistInput('');
  };

  const openCreate = () => {
    setSelectedTemplate(null);
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (tpl: ChecklistTemplate) => {
    setSelectedTemplate(tpl);
    setFormName(tpl.name);
    setFormDesc(tpl.description);
    setFormPriority(tpl.priority);
    setFormStatus(tpl.status);
    setFormChecklist(tpl.checklist.map(c => ({ ...c })));
    setFormChecklistInput('');
    setIsModalOpen(true);
  };

  const addChecklistItem = () => {
    const text = formChecklistInput.trim();
    if (!text) return;
    setFormChecklist(prev => [...prev, { id: `item-${Date.now()}-${prev.length}`, text }]);
    setFormChecklistInput('');
  };

  const removeChecklistItem = (id: string) => {
    setFormChecklist(prev => prev.filter(c => c.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    if (selectedTemplate) {
      // Edit existing template
      const updated = templates.map(t => {
        if (t.id !== selectedTemplate.id) return t;
        return {
          ...t,
          name: formName.trim(),
          description: formDesc.trim(),
          priority: formPriority,
          status: formStatus,
          checklist: formChecklist,
        };
      });
      const updatedTemplate = updated.find(t => t.id === selectedTemplate.id);
      logAudit('Update Task Checklist Template', selectedTemplate, updatedTemplate, `Updated template: ${formName}`);
      persist(updated);
    } else {
      // Create new template
      const newTemplate: ChecklistTemplate = {
        id: `tpl-${Date.now()}`,
        name: formName.trim(),
        description: formDesc.trim(),
        priority: formPriority,
        status: formStatus,
        checklist: formChecklist,
        createdBy: username,
        createdDate: new Date().toISOString(),
      };
      logAudit('Create Task Checklist Template', null, newTemplate, `Created new template: ${formName}`);
      persist([...templates, newTemplate]);
    }

    setIsModalOpen(false);
    resetForm();
  };

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' };

  return (
    <AdminGuard pageTitle="Task Checklist Templates">
      <div className="admin-header-bar glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>TASK CHECKLIST TEMPLATES</h1>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Reusable templates (Description, Priority, Checklist) Controllers can apply when creating a Task — FRD §13.2.
          </p>
        </div>
        <button onClick={openCreate} className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <span>+</span> Create Template
        </button>
      </div>

      <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '20px' }}>
        <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Template Name</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Description</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '110px' }}>Priority</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '120px' }}>Checklist Items</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '110px' }}>Status</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '160px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No checklist templates configured.</td>
                </tr>
              ) : (
                templates.map(tpl => (
                  <tr key={tpl.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-main)' }}>{tpl.name}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12.5px', color: 'var(--text-sub)', maxWidth: '360px' }}>{tpl.description || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12.5px' }}>{tpl.priority}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600 }}>{tpl.checklist.length}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className={`badge ${tpl.status === 'Active' ? 'badge-completed' : 'badge-closed'}`} style={{ padding: '2px 8px', borderRadius: '4px' }}>
                        {tpl.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={() => openEdit(tpl)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11.5px', borderRadius: '4px' }}>
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

      {/* CREATE / EDIT TEMPLATE MODAL */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '520px', maxHeight: '86vh', overflowY: 'auto', padding: '24px', background: 'var(--bg-card)' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '20px' }}>
              {selectedTemplate ? 'Edit Checklist Template' : 'Create Checklist Template'}
            </h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={labelStyle}>Template Name</label>
                <input type="text" required value={formName} onChange={e => setFormName(e.target.value)} style={inputStyle} placeholder="e.g. Escort — Contractor Access" />
              </div>

              <div>
                <label style={labelStyle}>Description (prefills Task Description)</label>
                <textarea rows={3} value={formDesc} onChange={e => setFormDesc(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Default task description..." />
              </div>

              <div>
                <label style={labelStyle}>Priority (prefills Task Priority)</label>
                <select value={formPriority} onChange={e => setFormPriority(e.target.value)} style={inputStyle}>
                  {priorityOptions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Checklist Items (prefills Task Checklist)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Add a checklist item and press Add"
                    value={formChecklistInput}
                    onChange={e => setFormChecklistInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); } }}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addChecklistItem}>Add</button>
                </div>
                {formChecklist.length > 0 && (
                  <ul style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px', listStyle: 'none', padding: 0 }}>
                    {formChecklist.map(c => (
                      <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px', color: 'var(--text-sub)', background: 'var(--bg-inset)', padding: '5px 10px', borderRadius: 'var(--radius-sm)' }}>
                        <span>☐ {c.text}</span>
                        <button type="button" onClick={() => removeChecklistItem(c.id)} style={{ background: 'none', border: 'none', color: 'var(--color-critical)', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {selectedTemplate && (
                <div>
                  <label style={labelStyle}>Status</label>
                  <select value={formStatus} onChange={e => setFormStatus(e.target.value as any)} style={inputStyle}>
                    <option value="Active">Active</option>
                    <option value="Deactivated">Deactivated</option>
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Save Template</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminGuard>
  );
}
