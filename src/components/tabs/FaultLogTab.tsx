'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Fault } from '@/lib/db';
import { useRole } from '@/context/RoleContext';
import { getFaultTaxonomy } from '@/lib/taxonomy';
import FaultCreateModal from '@/components/FaultCreateModal';

interface FaultStats {
  total: number;
  pendingSubmission: number;
  closed: number;
}

function faultStatusBadge(status: string) {
  switch (status) {
    case 'Closed':             return 'badge badge-closed';
    case 'Pending Submission': return 'badge badge-ack';
    default:                   return 'badge badge-closed';
  }
}

export function FaultLogTab() {
  const { role, username } = useRole();

  const [faults, setFaults] = useState<Fault[]>([]);
  const [stats, setStats] = useState<FaultStats>({ total: 0, pendingSubmission: 0, closed: 0 });
  const [loading, setLoading] = useState(true);
  const [faultTaxonomy, setFaultTaxonomy] = useState<Record<string, string[]>>({});

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submittingFaultId, setSubmittingFaultId] = useState<string | null>(null);

  // CMMS status lookup
  const [cmmsStatusMap, setCmmsStatusMap] = useState<Record<string, string>>({});

  useEffect(() => {
    setFaultTaxonomy(getFaultTaxonomy());
  }, []);

  const fetchFaults = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set('faultType', filterType);
      if (filterStatus) params.set('status', filterStatus);
      const res = await fetch(`/api/faults?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setFaults(data.faults || []);
        setStats(data.stats || { total: 0, pendingSubmission: 0, closed: 0 });
      }
    } catch (err) {
      console.error('Error fetching faults:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus]);

  useEffect(() => {
    fetchFaults();
  }, [fetchFaults]);

  async function fetchCmmsStatus(ticketId: string) {
    if (cmmsStatusMap[ticketId] || !ticketId) return;
    try {
      const res = await fetch(`/api/cmms-mock?ticketId=${encodeURIComponent(ticketId)}`);
      if (res.ok) {
        const data = await res.json();
        setCmmsStatusMap(prev => ({ ...prev, [ticketId]: data.status }));
      }
    } catch (_) { /* silent */ }
  }

  async function handleSubmitFault(faultId: string) {
    if (submittingFaultId) return;
    setSubmittingFaultId(faultId);
    try {
      const encodedId = faultId.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(`/api/faults/${encodedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', username }),
      });
      if (res.ok) {
        await fetchFaults();
      } else {
        const err = await res.json();
        alert(`Failed to submit fault: ${err.error}`);
      }
    } catch (err) {
      console.error('Failed to submit fault:', err);
    } finally {
      setSubmittingFaultId(null);
    }
  }

  const filteredFaults = faults.filter(f => {
    const term = searchTerm.toLowerCase();
    if (!term) return true;
    return (
      f.id.toLowerCase().includes(term) ||
      f.caseId.toLowerCase().includes(term) ||
      f.faultType.toLowerCase().includes(term) ||
      f.faultSubType.toLowerCase().includes(term) ||
      f.description.toLowerCase().includes(term) ||
      (f.cmmsTicketId || '').toLowerCase().includes(term) ||
      f.location.commonName.toLowerCase().includes(term)
    );
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType, filterStatus]);

  const totalPages = Math.ceil(filteredFaults.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedFaults = filteredFaults.slice(startIndex, startIndex + itemsPerPage);

  const isController = ['Controller', 'Duty Manager', 'Duty Officer', 'System Administrator', 'Current Ops Administrator'].includes(role);

  return (
    <>
      {/* Filter panel */}
      <div className="glass" style={{ padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>

          {/* Search */}
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Search Registry:</label>
            <input
              type="text"
              placeholder="Search by Fault ID, Case ID, Type, CMMS Ticket, Location..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="form-control"
              style={{ width: '100%' }}
            />
          </div>

          {/* Fault Type */}
          <div style={{ flex: '0 1 200px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Fault Type:</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="form-control select-dark" style={{ width: '100%' }}>
              <option value="">All Types</option>
              {Object.keys(faultTaxonomy).sort().map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div style={{ flex: '0 1 180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Status:</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="form-control select-dark" style={{ width: '100%' }}>
              <option value="">All Statuses</option>
              <option value="Pending Submission">Pending Submission</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          {/* Clear + Create */}
          <div style={{ display: 'flex', gap: '10px', height: '36px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => { setSearchTerm(''); setFilterType(''); setFilterStatus(''); }}
              className="btn btn-secondary"
              style={{ padding: '0 10px', fontSize: '12px', height: '100%', border: 'none', background: 'transparent', textDecoration: 'underline', whiteSpace: 'nowrap' }}
            >
              Clear
            </button>
            {isController && (
              <button className="btn btn-primary" onClick={() => setShowCreateModal(true)} style={{ fontSize: '12.5px', height: '36px', padding: '0 14px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', fontWeight: 600 }}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 13, height: 13 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                LOG NEW FAULT
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Fault list */}
      <div className="cases-list-container glass">
        {loading ? (
          <div className="cases-loading">Loading fault register...</div>
        ) : filteredFaults.length === 0 ? (
          <div className="empty-cases">No infrastructure faults match the current filters.</div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Date Logged</th>
                  <th>Fault ID</th>
                  <th>Fault Type</th>
                  <th>Sub-type</th>
                  <th>Location</th>
                  <th>Description</th>
                  <th>CMMS Ticket</th>
                  <th>Status</th>
                  <th>Logged By</th>
                  {isController && <th></th>}
                </tr>
              </thead>
              <tbody>
                {paginatedFaults.map(f => (
                  <tr key={f.id} onClick={() => window.location.href = `/faults/${f.id}`} style={{ cursor: 'pointer' }}>
                    <td className="date-cell">
                      {new Date(f.createdAt).toLocaleDateString('en-SG')}{' '}
                      {new Date(f.createdAt).toLocaleTimeString('en-SG', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <span className="mono-id" style={{ color: 'var(--color-primary)', background: 'var(--color-primary-bg)', borderColor: 'var(--color-primary-border)' }}>
                        <Link
                          href={`/faults/${f.id}`}
                          onClick={e => e.stopPropagation()}
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          {f.id}
                        </Link>
                      </span>
                      {f.linkedIncidentId && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                          via {f.linkedIncidentId}
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{f.faultType}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{f.faultSubType}</td>
                    <td style={{ fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.location.commonName || f.location.road || '—'}
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.description}
                    </td>
                    <td onClick={e => { e.stopPropagation(); if (f.cmmsTicketId) fetchCmmsStatus(f.cmmsTicketId); }} style={{ whiteSpace: 'nowrap' }}>
                      {f.cmmsTicketId ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="cmms-pill" style={{ cursor: 'pointer' }}>{f.cmmsTicketId}</span>
                          {cmmsStatusMap[f.cmmsTicketId] ? (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>CMMS: {cmmsStatusMap[f.cmmsTicketId]}</span>
                          ) : (
                            <span style={{ fontSize: 10, color: 'var(--color-primary)', cursor: 'pointer' }}>↻ Check CMMS</span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>Not submitted</span>
                      )}
                    </td>
                    <td>
                      <span className={faultStatusBadge(f.status)}>{f.status}</span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.createdBy}</td>
                    {isController && (
                      <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                        {f.status === 'Pending Submission' && (
                          <button
                            className="btn btn-primary btn-xs"
                            disabled={submittingFaultId === f.id}
                            onClick={() => handleSubmitFault(f.id)}
                            style={{ fontSize: 10, padding: '4px 10px', whiteSpace: 'nowrap' }}
                          >
                            {submittingFaultId === f.id ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ animation: 'spin 1s linear infinite' }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>
                                Submitting
                              </span>
                            ) : 'Submit to CMMS'}
                          </button>
                        )}
                      </td>
                    )}
              
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Showing <strong>{startIndex + 1}</strong> to <strong>{Math.min(startIndex + itemsPerPage, filteredFaults.length)}</strong> of <strong>{filteredFaults.length}</strong> faults
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="btn btn-secondary btn-xs"
                    style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? 'default' : 'pointer' }}
                  >
                    Previous
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                    const isCurrent = p === currentPage;
                    return (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        className={`btn ${isCurrent ? 'btn-primary' : 'btn-secondary'} btn-xs`}
                        style={{
                          padding: '6px 10px',
                          fontSize: '11px',
                          borderRadius: '6px',
                          fontWeight: isCurrent ? 'bold' : 'normal',
                          cursor: 'pointer'
                        }}
                      >
                        {p}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="btn btn-secondary btn-xs"
                    style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', opacity: currentPage === totalPages ? 0.5 : 1, cursor: currentPage === totalPages ? 'default' : 'pointer' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>



      <FaultCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => fetchFaults()}
        username={username}
      />
    </>
  );
}
