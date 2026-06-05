'use client';

import React, { useState, useEffect } from 'react';
import { Occurrence } from '@/lib/db';
import { useRole } from '@/context/RoleContext';

export default function OccurrencesPage() {
  const { role, username } = useRole();
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [userFilter, setUserFilter] = useState('All');
  
  // Log entry form states
  const [showLogForm, setShowLogForm] = useState(false);
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [dateTime, setDateTime] = useState('');

  // Predefined occurrence topics
  const topics = [
    'VIP Visit Advisory',
    'Routine Siren Testing',
    'Ranger Shift Handover',
    'General Public Interaction',
    'Coordinated Drill/Exercise',
    'Lost and Found Report',
    'Contractor Access Granted',
    'Others'
  ];

  useEffect(() => {
    fetchOccurrences();
  }, []);

  const fetchOccurrences = async () => {
    try {
      const res = await fetch('/api/occurrences');
      if (res.ok) {
        setOccurrences(await res.json());
      }
    } catch (err) {
      console.error('Error fetching occurrences:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic || !content.trim()) return;

    const payload = {
      username,
      topic,
      content,
      dateTime: dateTime ? new Date(dateTime).toISOString() : new Date().toISOString()
    };

    try {
      const res = await fetch('/api/occurrences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        setShowLogForm(false);
        setTopic('');
        setContent('');
        setDateTime('');
        fetchOccurrences();
      }
    } catch (err) {
      console.error('Error creating occurrence:', err);
    }
  };

  // Unique users who logged occurrences for filter dropdown
  const uniqueUsers = Array.from(new Set(occurrences.map(o => o.user)));

  const filteredOccurrences = occurrences.filter(o => {
    const matchesSearch = o.topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          o.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesUser = userFilter === 'All' || o.user === userFilter;
    return matchesSearch && matchesUser;
  });

  return (
    <>
      <div className="occ-header-bar glass">
        <div className="title-section">
          <h1>E-DIARY OCCURRENCE LOG</h1>
          <p>Electronic logbook for routine interactions, exercises, and general advisories</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowLogForm(true)}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          WRITE DIARY ENTRY
        </button>
      </div>

      <div className="occ-body-layout">
        
        {/* Left pane: search filters */}
        <div className="occ-filters-pane glass">
          <h3>LOGBOOK FILTERS</h3>
          
          <div className="form-group">
            <label>Search Content</label>
            <input 
              type="text" 
              placeholder="Type topic or text..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="form-control"
            />
          </div>

          <div className="form-group">
            <label>Filter by User</label>
            <select 
              value={userFilter} 
              onChange={e => setUserFilter(e.target.value)} 
              className="form-control select-dark"
            >
              <option value="All">All Operators</option>
              {uniqueUsers.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          <div className="filter-stats glass">
            <div className="stat-row">
              <span className="lbl">Total Logged today:</span>
              <span className="val">{occurrences.length}</span>
            </div>
            <div className="stat-row" style={{ marginTop: '8px' }}>
              <span className="lbl">Filtered results:</span>
              <span className="val text-primary">{filteredOccurrences.length}</span>
            </div>
          </div>
          
          <div className="warning-note glass">
            <p>📝 <strong>IMMUTABILITY NOTICE:</strong> According to FRD 8.2, submitted occurrence diary entries are immediately locked and cannot be edited or deleted for audit integrity.</p>
          </div>
        </div>

        {/* Right pane: Journal logs listing */}
        <div className="occ-list-pane">
          {loading ? (
            <div className="occ-loading glass">Reading diary entries...</div>
          ) : filteredOccurrences.length === 0 ? (
            <div className="occ-empty glass">No logged occurrences found matching filters.</div>
          ) : (
            <div className="occ-entries-timeline">
              {filteredOccurrences.map(o => (
                <div className="occ-card glass" key={o.id}>
                  <div className="occ-card-header">
                    <span className="occ-id">{o.id}</span>
                    <span className="occ-time">
                      {new Date(o.dateTime).toLocaleDateString()} &bull; {new Date(o.dateTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                  </div>
                  <h2 className="occ-topic">{o.topic}</h2>
                  <p className="occ-content">{o.content}</p>
                  <div className="occ-card-footer">
                    <span>Logged by: <strong>{o.user}</strong></span>
                    <span className="immutable-stamp">🔒 Locked Record</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Creation Modal */}
      {showLogForm && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass">
            <div className="modal-header">
              <h2>WRITE NEW IMMUTABLE OCCURRENCE ENTRY</h2>
              <button className="close-btn" onClick={() => setShowLogForm(false)}>Close</button>
            </div>
            
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="modal-scroll-area">
                
                <div className="form-group">
                  <label>Occurrence Topic/Subject *</label>
                  <select 
                    value={topic} 
                    onChange={e => setTopic(e.target.value)} 
                    required 
                    className="form-control select-dark"
                  >
                    <option value="">-- Select Topic --</option>
                    {topics.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {topic === 'Others' && (
                  <div className="form-group">
                    <label>Specify Custom Topic *</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Unusual weather advisory" 
                      onChange={e => setTopic(e.target.value)}
                      required 
                      className="form-control"
                    />
                  </div>
                )}

                <div className="form-group">
                  <label>DateTime of Occurrence</label>
                  <input 
                    type="datetime-local" 
                    value={dateTime} 
                    onChange={e => setDateTime(e.target.value)} 
                    className="form-control"
                  />
                  <p className="sub-desc">Defaults to current time if left blank. Backdating is permitted.</p>
                </div>

                <div className="form-group">
                  <label>Content / Narrative Log *</label>
                  <textarea 
                    placeholder="Describe the routine check, advisory, or interaction details here..." 
                    value={content} 
                    onChange={e => setContent(e.target.value)} 
                    required
                    className="form-control"
                    rows={5}
                  />
                </div>

              </div>
              
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowLogForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">SUBMIT LOG ENTRY</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .occ-header-bar {
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

        .occ-body-layout {
          display: grid;
          grid-template-columns: 1fr 2.5fr;
          gap: 20px;
          align-items: start;
        }

        /* Filter sidebar */
        .occ-filters-pane {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .occ-filters-pane h3 {
          font-family: var(--font-title);
          font-size: 12px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 6px;
        }

        .filter-stats {
          padding: 12px;
          background: rgba(0,0,0,0.15) !important;
          border-radius: 8px;
        }

        .stat-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
        }

        .stat-row .lbl { color: var(--text-muted); }
        .stat-row .val { font-weight: 700; }

        .warning-note {
          padding: 12px;
          background: rgba(255, 0, 85, 0.05) !important;
          border: 1px solid rgba(255, 0, 85, 0.15) !important;
          border-radius: 8px;
          font-size: 11px;
          color: var(--text-main);
          line-height: 1.4;
        }

        /* Logs column */
        .occ-list-pane {
          display: flex;
          flex-direction: column;
        }

        .occ-loading, .occ-empty {
          padding: 80px;
          text-align: center;
          color: var(--text-muted);
          font-weight: 500;
        }

        .occ-entries-timeline {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .occ-card {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .occ-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-family: var(--font-title);
          font-size: 11px;
        }

        .occ-id {
          font-weight: 800;
          color: var(--color-primary);
        }

        .occ-time {
          color: var(--text-muted);
        }

        .occ-topic {
          font-family: var(--font-title);
          font-size: 15px;
          font-weight: 700;
          color: var(--text-main);
        }

        .occ-content {
          font-size: 13px;
          color: var(--text-muted);
          line-height: 1.6;
          white-space: pre-wrap;
        }

        .occ-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          color: var(--text-muted);
          padding-top: 10px;
          border-top: 1px solid var(--border-color);
        }

        .immutable-stamp {
          color: var(--color-accent);
          font-weight: 600;
        }

        /* Modal specific layout */
        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 10000;
        }

        .create-case-modal {
          width: 100%;
          max-width: 600px;
          height: 80vh;
          max-height: 520px;
          display: flex;
          flex-direction: column;
          border-radius: 12px;
          overflow: hidden;
          background: #0f1420;
          border: 1px solid rgba(255, 255, 255, 0.15);
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
          height: calc(100% - 50px);
        }

        .modal-scroll-area {
          padding: 20px;
          overflow-y: auto;
          flex-grow: 1;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .sub-desc {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .modal-actions {
          padding: 16px 20px;
          border-top: 1px solid var(--border-color);
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          background: rgba(0,0,0,0.15);
        }
      `}</style>
    </>
  );
}
