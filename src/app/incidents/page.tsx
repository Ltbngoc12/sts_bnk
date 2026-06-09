'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Case } from '@/lib/db';
import { useRole } from '@/context/RoleContext';

export default function IncidentsPage() {
  const { role } = useRole();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPriority, setFilterPriority] = useState<string>('All');
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

  // Filter only cases containing incidents
  const incidentCases = cases.filter(c => c.incident !== null);

  const filteredIncidents = incidentCases.filter(c => {
    const matchesSearch = c.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (c.incident?.assignedTo && c.incident.assignedTo.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesPriority = filterPriority === 'All' || (c.incident && c.incident.priority === filterPriority);
    return matchesSearch && matchesPriority;
  });

  const isController = role === 'Controller' || role === 'Duty Manager' || role === 'Duty Officer' || role === 'System Administrator';

  return (
    <>
      <div className="cases-header-bar glass">
        <div className="title-section">
          <h1>INCIDENT REGISTRY LOG</h1>
          <p>Security, Safety, Fire, and Ground Incidents requiring Ranger response</p>
        </div>
        
        {isController && (
          <Link href="/incidents/new" className="btn btn-primary">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '18px', height: '18px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            LOG NEW INCIDENT
          </Link>
        )}
      </div>

      {/* Filter panel */}
      <div className="filter-panel glass">
        <div className="search-group">
          <input 
            type="text" 
            placeholder="Search by Case ID, Title, or Ranger..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-control"
          />
        </div>
        <div className="select-filters">
          <div className="filter-select-group">
            <label>Priority:</label>
            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="form-control select-dark">
              <option value="All">All Priorities</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Log list */}
      <div className="cases-list-container glass">
        {loading ? (
          <div className="cases-loading">Loading incident registry...</div>
        ) : filteredIncidents.length === 0 ? (
          <div className="empty-cases">No incidents logged matching filters.</div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Incident Title</th>
                  <th>Classification</th>
                  <th>Priority</th>
                  <th>Location (Common Name)</th>
                  <th>Assigned Ranger</th>
                  <th>Incident Status</th>
                  <th>Date Logged</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncidents.map((c) => (
                  <tr key={c.id} onClick={() => window.location.href = `/cases/${c.id}`}>
                    <td className="case-id-cell">{c.id}</td>
                    <td className="case-title-cell">{c.title}</td>
                    <td>{c.incident?.type} - {c.incident?.subType}</td>
                    <td>
                      <span className={`badge ${
                        c.incident?.priority === 'High' ? 'badge-live' :
                        c.incident?.priority === 'Medium' ? 'badge-ack' : 'badge-closed'
                      }`}>
                        {c.incident?.priority}
                      </span>
                    </td>
                    <td>{c.incident?.location.commonName || c.incident?.location.road}</td>
                    <td>{c.incident?.assignedTo || 'Unassigned'}</td>
                    <td>
                      <span className={`badge ${
                        c.incident?.status === 'Live' ? 'badge-live' :
                        c.incident?.status === 'Live (Acknowledged)' ? 'badge-ack' :
                        c.incident?.status === 'Live (On-Site)' ? 'badge-onsite' :
                        c.incident?.status === 'Live (Completed)' ? 'badge-completed' :
                        c.incident?.status === 'Pending Review' ? 'badge-review' : 'badge-closed'
                      }`}>
                        {c.incident?.status || c.status}
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

    </>
  );
}
