'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Case } from '@/lib/db';
import { useRole } from '@/context/RoleContext';

export default function CaseLogPage() {
  const { role, username } = useRole();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  


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



  const filteredCases = cases.filter(c => {
    const matchesSearch = c.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'All' || c.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const isController = role === 'Controller' || role === 'Duty Manager' || role === 'Duty Officer' || role === 'System Administrator';

  return (
    <>
      <div className="cases-header-bar glass">
        <div className="title-section">
          <h1>CASE REGISTRY LOG</h1>
          <p>Master index of all operational cases (Incidents, Tasks, and CMMS Tickets)</p>
        </div>
        

      </div>

      {/* Filter panel */}
      <div className="filter-panel glass">
        <div className="search-group">
          <input 
            type="text" 
            placeholder="Search by Case ID or Case Title..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-control"
          />
        </div>
        <div className="select-filters">
          <div className="filter-select-group">
            <label>Case Status:</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="form-control select-dark">
              <option value="All">All Statuses</option>
              <option value="Pending Triage">Pending Triage</option>
              <option value="Active">Active</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Log list */}
      <div className="cases-list-container glass">
        {loading ? (
          <div className="cases-loading">Loading master case log...</div>
        ) : filteredCases.length === 0 ? (
          <div className="empty-cases">No cases logged matching filters.</div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Case Title</th>
                  <th>Case Status</th>
                  <th>Contains Components</th>
                  <th>CMMS Tickets</th>
                  <th>Date Logged</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.map((c) => (
                  <tr key={c.id} onClick={() => window.location.href = `/cases/${c.id}`}>
                    <td className="case-id-cell">{c.id}</td>
                    <td className="case-title-cell">{c.title}</td>
                    <td>
                      <span className={`badge ${
                        c.status === 'Pending Triage' ? 'badge-ack' :
                        c.status === 'Active' ? 'badge-onsite' : 'badge-closed'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td>
                      <div className="components-pills">
                        {c.incident ? (
                          <span className="pill pill-danger" title="Security or Safety Incident">
                            🚨 Incident
                          </span>
                        ) : null}
                        
                        {/* We don't store task counts in Case object directly, so let's mock or fetch. For simplicity, if Case contains _TASK_ or has a task in our state, show task pill */}
                        {c.id.includes('TASK') ? (
                          <span className="pill pill-accent" title="Ranger Ground Tasks">
                            📋 Task
                          </span>
                        ) : null}

                        {c.cmmsTickets?.length > 0 ? (
                          <span className="pill pill-warning" title="IFM Contractor Faults">
                            🔧 Fault ({c.cmmsTickets.length})
                          </span>
                        ) : null}

                        {!c.incident && !c.id.includes('TASK') && c.cmmsTickets?.length === 0 ? (
                          <span className="pill pill-muted" title="Blank Triage Case Container">
                            📁 General
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {c.cmmsTickets?.length > 0 ? (
                        <div className="ticket-references">
                          {c.cmmsTickets.map(t => (
                            <span key={t} className="ticket-label">{t}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted" style={{ fontSize: '12px' }}>-</span>
                      )}
                    </td>
                    <td className="date-cell">{new Date(c.createdAt).toLocaleDateString('en-US')} {new Date(c.createdAt).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>



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

        .select-filters {
          display: flex;
          gap: 16px;
        }

        .filter-select-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .filter-select-group label {
          font-size: 12px;
          color: var(--text-muted);
          font-weight: 600;
          white-space: nowrap;
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

        .components-pills {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .pill {
          display: inline-flex;
          align-items: center;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          border: 1px solid transparent;
        }

        .pill-danger { background: var(--color-danger-glow); color: var(--color-danger); border-color: rgba(183, 32, 37, 0.15); }
        .pill-accent { background: var(--color-secondary-glow); color: var(--color-secondary); border-color: rgba(0, 140, 149, 0.15); }
        .pill-warning { background: var(--color-warning-glow); color: var(--color-warning); border-color: rgba(234, 88, 12, 0.15); }
        .pill-muted { background: var(--bg-base); color: var(--text-muted); border-color: var(--border-color); }

        .ticket-references {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .ticket-label {
          font-size: 11px;
          color: var(--color-primary);
          font-family: var(--font-title);
          font-weight: 700;
        }

        /* Modal specific layouts */
        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(43, 31, 29, 0.3);
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
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          box-shadow: 0 10px 25px -5px rgba(43, 31, 29, 0.1), 0 8px 12px -6px rgba(43, 31, 29, 0.05);
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

        .modal-actions {
          padding: 16px 20px;
          border-top: 1px solid var(--border-color);
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          background: var(--bg-base);
        }
      `}</style>
    </>
  );
}
