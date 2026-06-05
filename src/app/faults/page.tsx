'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Case } from '@/lib/db';
import { useRole } from '@/context/RoleContext';

export default function FaultsPage() {
  const { role, username } = useRole();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Create Fault Form states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [severity, setSeverity] = useState('Medium');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCases();
  }, []);

  const fetchCases = async () => {
    try {
      const res = await fetch('/api/cases');
      if (res.ok) {
        setCases(await res.json());
      }
    } catch (err) {
      console.error('Error fetching cases:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);

    try {
      // 1. Create a Master Case container first
      const caseRes = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Fault: ${title}`,
          status: 'Active',
          username,
          incident: null
        })
      });

      if (caseRes.ok) {
        const newCase = await caseRes.json() as Case;
        
        // 2. Call mock CMMS API to register work order
        const cmmsRes = await fetch('/api/cmms-mock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: location || 'Sentosa Island',
            description: description || title,
            severity
          })
        });

        if (cmmsRes.ok) {
          const cmmsData = await cmmsRes.json();
          
          // 3. Link CMMS Ticket ID back to the created Case
          await fetch(`/api/cases/${newCase.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmmsTicketId: cmmsData.ticketId })
          });
          
          // 4. Log event updates on the case log (or case details)
          // For simplicity, we just reload the cases list
          setShowCreateModal(false);
          setTitle('');
          setLocation('');
          setDescription('');
          fetchCases();
        }
      }
    } catch (err) {
      console.error('Failed to create fault case:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Filter only cases containing CMMS tickets (Faults)
  const faultCases = cases.filter(c => c.cmmsTickets && c.cmmsTickets.length > 0);

  const filteredFaults = faultCases.filter(c => {
    const matchesSearch = c.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.cmmsTickets.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  const isController = role === 'Controller' || role === 'Duty Manager' || role === 'Duty Officer' || role === 'System Administrator';

  return (
    <>
      <div className="cases-header-bar glass">
        <div className="title-section">
          <h1>FAULT REPORTING LOG (CMMS)</h1>
          <p>Infrastructure, lighting, and mechanical defects synchronized with contractor CMMS</p>
        </div>
        
        {isController && (
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '18px', height: '18px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            LOG NEW FAULT
          </button>
        )}
      </div>

      {/* Filter panel */}
      <div className="filter-panel glass">
        <div className="search-group">
          <input 
            type="text" 
            placeholder="Search by Case ID, Fault Title, or CMMS Ticket ID..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-control"
          />
        </div>
      </div>

      {/* Log list */}
      <div className="cases-list-container glass">
        {loading ? (
          <div className="cases-loading">Loading CMMS fault register...</div>
        ) : filteredFaults.length === 0 ? (
          <div className="empty-cases">No infrastructure faults logged matching filters.</div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Fault Title</th>
                  <th>CMMS Ticket ID</th>
                  <th>Case Status</th>
                  <th>Sync Status</th>
                  <th>Date Logged</th>
                </tr>
              </thead>
              <tbody>
                {filteredFaults.map((c) => (
                  <tr key={c.id} onClick={() => window.location.href = `/cases/${c.id}`}>
                    <td className="case-id-cell">{c.id}</td>
                    <td className="case-title-cell">{c.title}</td>
                    <td>
                      <div className="ticket-pills">
                        {c.cmmsTickets.map(t => (
                          <span key={t} className="cmms-pill">{t}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${
                        c.status === 'Active' ? 'badge-ack' : 'badge-closed'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-onsite" style={{ fontSize: '10px' }}>
                        &bull; Synchronized
                      </span>
                    </td>
                    <td className="date-cell">{new Date(c.createdAt).toLocaleDateString('en-US')} {new Date(c.createdAt).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Creation Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxHeight: '500px' }}>
            <div className="modal-header">
              <h2>LOG NEW INFRASTRUCTURE FAULT (CMMS)</h2>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>Close</button>
            </div>
            
            <form onSubmit={handleCreateFault} className="modal-form">
              <div className="modal-scroll-area">
                
                <div className="form-group">
                  <label>Fault Title *</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Broken barrier gantry gate at Carpark A" 
                    value={title} 
                    onChange={(e) => setTitle(e.target.value)} 
                    required 
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Location Specifics *</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Siloso Beach Station Carpark Entrance" 
                    value={location} 
                    onChange={(e) => setLocation(e.target.value)} 
                    required 
                    className="form-control"
                  />
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Severity Level</label>
                    <select 
                      value={severity} 
                      onChange={(e) => setSeverity(e.target.value)} 
                      className="form-control select-dark"
                    >
                      <option value="High">High (Immediate Response)</option>
                      <option value="Medium">Medium (Routine)</option>
                      <option value="Low">Low (Advisory)</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Fault Narrative / Details</label>
                  <textarea 
                    placeholder="Describe the defect, dimensions, impact on visitor flow..." 
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)} 
                    className="form-control"
                    rows={3}
                  />
                </div>

              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'RAISING TICKET...' : 'SUBMIT TO IFM CMMS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .cases-header-bar {
          padding: 20px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .title-section h1 {
          font-family: var(--font-title);
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 0.03em;
        }

        .title-section p {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .filter-panel {
          padding: 16px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
        }

        .search-group {
          flex-grow: 1;
          max-width: 450px;
        }

        .select-dark {
          background-color: #ffffff;
          border: 1px solid var(--border-color);
          color: var(--text-main);
          font-size: 13px;
          padding: 8px 12px;
          height: 38px;
          cursor: pointer;
        }

        .cases-list-container {
          padding: 20px;
        }

        .cases-loading, .empty-cases {
          padding: 60px;
          text-align: center;
          color: var(--text-muted);
          font-weight: 500;
        }

        .case-id-cell {
          font-family: var(--font-title);
          font-weight: 700;
          color: var(--color-primary);
          white-space: nowrap;
        }

        .case-title-cell {
          font-weight: 600;
        }

        .date-cell {
          font-size: 12px;
          color: var(--text-muted);
          white-space: nowrap;
        }

        .ticket-pills {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }

        .cmms-pill {
          display: inline-flex;
          align-items: center;
          padding: 3px 8px;
          background: rgba(255, 184, 0, 0.08);
          border: 1px solid rgba(255, 184, 0, 0.2);
          color: #b45309;
          font-family: var(--font-title);
          font-weight: 700;
          border-radius: 4px;
          font-size: 11px;
        }

        /* Modal specific layouts */
        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(4px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 10000;
        }

        .create-case-modal {
          width: 100%;
          max-width: 500px;
          display: flex;
          flex-direction: column;
          border-radius: 12px;
          overflow: hidden;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .modal-header {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .modal-header h2 {
          font-family: var(--font-title);
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.05em;
        }

        .close-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
        }

        .modal-form {
          display: flex;
          flex-direction: column;
        }

        .modal-scroll-area {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .modal-actions {
          padding: 16px 20px;
          border-top: 1px solid var(--border-color);
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          background: #f8fafc;
        }
      `}</style>
    </>
  );
}
