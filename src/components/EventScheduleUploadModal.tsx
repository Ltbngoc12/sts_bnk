'use client';

import React, { useState, useRef, useEffect } from 'react';
import { getEventTaxonomy } from '@/lib/taxonomy';
import { DEFAULT_NODES, LocationNode } from '@/components/LocationSelector';
import { useUnsavedChanges } from '@/context/UnsavedChangesContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  username: string;
}

interface ParsedRow {
  rowNum: number;
  name: string;
  startDateTime: string;   // raw input text, validated on confirm
  endDateTime: string;
  locationText: string;
  type: string;
  description: string;
  matchedLocation?: LocationNode;
  flags: string[];
}

// FRD §8.3 Events Schedule File Upload. Format = CSV/XLSX (Kyle confirmed
// 2026-07-09, see QnA_FSD_v0.5_EventsMasterList.md item 3). Columns expected:
// Event Name, Start Date/Time, End Date/Time, Location, Event Type, Description
// (matches the §8.1.2 field table).
const EXPECTED_COLUMNS = 'Event Name, Start Date/Time, End Date/Time, Location, Event Type, Description';

function normalizeHeader(h: string) {
  return h.toLowerCase().replace(/[^a-z]/g, '');
}

const HEADER_MAP: Record<string, keyof Omit<ParsedRow, 'rowNum' | 'matchedLocation' | 'flags'>> = {
  eventname: 'name',
  name: 'name',
  startdatetime: 'startDateTime',
  startdate: 'startDateTime',
  start: 'startDateTime',
  enddatetime: 'endDateTime',
  enddate: 'endDateTime',
  end: 'endDateTime',
  location: 'locationText',
  eventlocation: 'locationText',
  eventtype: 'type',
  type: 'type',
  description: 'description',
};

function getLocationNodes(): LocationNode[] {
  if (typeof window === 'undefined') return DEFAULT_NODES;
  const stored = localStorage.getItem('admin_location_hierarchy');
  return stored ? JSON.parse(stored) : DEFAULT_NODES;
}

function resolveLocationPath(node: LocationNode, nodes: LocationNode[]): { road: string; building: string; levelSpace: string; lat: number; lng: number } {
  let cur: LocationNode | undefined = node;
  const chain: LocationNode[] = [];
  while (cur) { chain.unshift(cur); cur = nodes.find(n => n.id === cur!.parentId); }
  const road = chain.find(n => n.type === 'Road')?.name || '';
  const building = chain.find(n => n.type === 'Building')?.name || '';
  const level = chain.find(n => n.type === 'Level')?.name || '';
  const space = chain.find(n => n.type === 'Space')?.name || '';
  const levelSpace = level && space ? `${level} - ${space}` : (level || space || '');
  return { road, building, levelSpace, lat: node.lat ?? 1.25, lng: node.lng ?? 103.83 };
}

export default function EventScheduleUploadModal({ isOpen, onClose, onSuccess, username }: Props) {
  const [step, setStep] = useState<'upload' | 'review' | 'result'>('upload');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ succeeded: number; failed: { row: ParsedRow; error: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setDirty, requestLeave } = useUnsavedChanges();

  const eventTypes = getEventTaxonomy();
  const locationNodes = getLocationNodes();

  // A parsed-but-not-yet-imported batch is exactly the state that would be
  // lost if the modal is closed — re-derive `isDirty` straight from `step`
  // rather than instrumenting every row edit individually.
  useEffect(() => {
    setDirty(step === 'review');
  }, [step, setDirty]);

  useEffect(() => {
    if (!isOpen) setDirty(false);
  }, [isOpen, setDirty]);

  const reset = () => {
    setStep('upload');
    setRows([]);
    setFileError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  function validateRows(raw: ParsedRow[]): ParsedRow[] {
    const seen = new Map<string, number>();
    return raw.map(r => {
      const flags: string[] = [];
      if (!r.name.trim()) flags.push('Missing Event Name');
      if (!r.startDateTime.trim() || isNaN(new Date(r.startDateTime).getTime())) flags.push('Missing/invalid Start Date-Time');
      if (!r.endDateTime.trim() || isNaN(new Date(r.endDateTime).getTime())) flags.push('Missing/invalid End Date-Time');
      if (!isNaN(new Date(r.startDateTime).getTime()) && !isNaN(new Date(r.endDateTime).getTime()) && new Date(r.endDateTime) < new Date(r.startDateTime)) {
        flags.push('End before Start');
      }
      if (!r.type.trim()) flags.push('Missing Event Type');
      else if (!eventTypes.includes(r.type.trim())) flags.push(`Event Type "${r.type}" not in taxonomy`);

      // §8.3(d) — validate extracted Event Location against the Location Hierarchy
      let matchedLocation: LocationNode | undefined;
      if (!r.locationText.trim()) {
        flags.push('Missing Location');
      } else {
        matchedLocation = locationNodes.find(
          n => n.status === 'Active' && (n.commonName || n.name).toLowerCase() === r.locationText.trim().toLowerCase()
        );
        if (!matchedLocation) flags.push(`Location "${r.locationText}" not found in Location Hierarchy`);
      }

      // Duplicate detection within this import batch
      const dupKey = `${r.name.trim().toLowerCase()}|${r.startDateTime}|${r.locationText.trim().toLowerCase()}`;
      if (r.name.trim() && r.locationText.trim()) {
        if (seen.has(dupKey)) flags.push(`Duplicate of row ${seen.get(dupKey)}`);
        else seen.set(dupKey, r.rowNum);
      }

      return { ...r, matchedLocation, flags };
    });
  }

  function rowsFromObjects(objects: Record<string, any>[]): ParsedRow[] {
    return objects.map((obj, i) => {
      const mapped: any = { name: '', startDateTime: '', endDateTime: '', locationText: '', type: '', description: '' };
      Object.keys(obj).forEach(key => {
        const canonical = HEADER_MAP[normalizeHeader(key)];
        if (canonical) mapped[canonical] = String(obj[key] ?? '').trim();
      });
      return { rowNum: i + 2, ...mapped, flags: [] } as ParsedRow;
    });
  }

  const handleFile = async (file: File) => {
    setFileError(null);
    try {
      let objects: Record<string, any>[] = [];
      if (file.name.toLowerCase().endsWith('.csv')) {
        // Parsers are pulled in on demand — xlsx alone is ~1MB and was previously
        // in the initial bundle of every page that can open this modal, for a
        // feature most users never touch.
        const { default: Papa } = await import('papaparse');
        const text = await file.text();
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
        if (parsed.errors.length > 0) {
          setFileError(`CSV parse error: ${parsed.errors[0].message}`);
          return;
        }
        objects = parsed.data as Record<string, any>[];
      } else if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        const XLSX = await import('xlsx');
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        objects = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      } else {
        setFileError(`Unsupported file type. Expected .csv or .xlsx. Columns: ${EXPECTED_COLUMNS}`);
        return;
      }

      if (objects.length === 0) {
        setFileError('No rows found in the uploaded file.');
        return;
      }

      // Normalize any Date objects (from XLSX cellDates) to ISO-ish strings for the input fields
      const normalized = objects.map(o => {
        const copy = { ...o };
        Object.keys(copy).forEach(k => {
          if (copy[k] instanceof Date) copy[k] = (copy[k] as Date).toISOString().slice(0, 16);
        });
        return copy;
      });

      const parsedRows = rowsFromObjects(normalized);
      setRows(validateRows(parsedRows));
      setStep('review');
    } catch (err: any) {
      setFileError(`Failed to parse file: ${err.message || err}`);
    }
  };

  const updateRow = (rowNum: number, field: keyof ParsedRow, value: string) => {
    setRows(prev => validateRows(prev.map(r => (r.rowNum === rowNum ? { ...r, [field]: value } : r))));
  };

  const removeRow = (rowNum: number) => {
    setRows(prev => validateRows(prev.filter(r => r.rowNum !== rowNum)));
  };

  const flaggedCount = rows.filter(r => r.flags.length > 0).length;

  const handleConfirmImport = async () => {
    if (flaggedCount > 0 || rows.length === 0 || importing) return;
    setImporting(true);
    const failed: { row: ParsedRow; error: string }[] = [];
    let succeeded = 0;

    for (const r of rows) {
      const loc = r.matchedLocation ? resolveLocationPath(r.matchedLocation, locationNodes) : null;
      try {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: r.name.trim(),
            type: r.type.trim(),
            description: r.description.trim() || undefined,
            startDateTime: new Date(r.startDateTime).toISOString(),
            endDateTime: new Date(r.endDateTime).toISOString(),
            location: {
              road: loc?.road || '',
              building: loc?.building || '',
              levelSpace: loc?.levelSpace || '',
              commonName: r.locationText.trim(),
              lat: loc?.lat ?? 1.25,
              lng: loc?.lng ?? 103.83,
              tags: [],
            },
            username,
          }),
        });
        if (res.ok) {
          succeeded++;
        } else {
          const err = await res.json();
          failed.push({ row: r, error: err.error || 'Unknown error' });
        }
      } catch (err: any) {
        failed.push({ row: r, error: err.message || 'Network error' });
      }
    }

    setResult({ succeeded, failed });
    setStep('result');
    setImporting(false);
    if (succeeded > 0) onSuccess();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="create-case-modal glass" style={{ maxWidth: step === 'review' ? 960 : 560, width: '100%' }}>
        <div className="modal-header" style={{ padding: '16px 20px' }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em' }}>EVENTS SCHEDULE FILE UPLOAD</h2>
          <button className="close-btn" onClick={() => requestLeave(() => { onClose(); reset(); })}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="modal-form">
          <div className="modal-scroll-area">

            {step === 'upload' && (
              <>
                <p style={{ fontSize: 12.5, color: 'var(--text-sub)', lineHeight: 1.6 }}>
                  Upload a CSV or XLSX file of events for bulk import (FRD §8.3). Expected columns:
                </p>
                <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', background: 'var(--bg-inset)', padding: '8px 12px', borderRadius: 6, marginBottom: 12, color: 'var(--text-sub)' }}>
                  {EXPECTED_COLUMNS}
                </div>
                <div
                  style={{ border: '2px dashed var(--border-color)', borderRadius: 8, padding: '28px 16px', textAlign: 'center', cursor: 'pointer', background: 'var(--bg-inset)' }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
                >
                  <div style={{ fontSize: 22, marginBottom: 6 }}>📤</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>Click to upload or drag &amp; drop</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>.csv or .xlsx</div>
                  <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </div>
                {fileError && <p style={{ fontSize: 12, color: '#EF4444', marginTop: 10, fontWeight: 600 }}>{fileError}</p>}
              </>
            )}

            {step === 'review' && (
              <>
                <p style={{ fontSize: 12.5, color: 'var(--text-sub)', marginBottom: 8 }}>
                  {rows.length} row(s) parsed. <strong style={{ color: flaggedCount > 0 ? '#EF4444' : 'var(--color-active)' }}>{flaggedCount} flagged</strong> — resolve all flags before confirming (§8.3e).
                </p>
                <div className="table-container" style={{ maxHeight: 420, overflowY: 'auto' }}>
                  <table className="custom-table" style={{ fontSize: 11.5 }}>
                    <thead>
                      <tr>
                        <th>#</th><th>Name</th><th>Start</th><th>End</th><th>Location</th><th>Type</th><th>Flags</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.rowNum} style={{ background: r.flags.length > 0 ? 'rgba(239,68,68,0.06)' : undefined }}>
                          <td>{r.rowNum}</td>
                          <td><input className="form-control" style={{ fontSize: 11, padding: '4px 6px', minWidth: 110 }} value={r.name} onChange={e => updateRow(r.rowNum, 'name', e.target.value)} /></td>
                          <td><input className="form-control" style={{ fontSize: 11, padding: '4px 6px', minWidth: 130 }} value={r.startDateTime} onChange={e => updateRow(r.rowNum, 'startDateTime', e.target.value)} /></td>
                          <td><input className="form-control" style={{ fontSize: 11, padding: '4px 6px', minWidth: 130 }} value={r.endDateTime} onChange={e => updateRow(r.rowNum, 'endDateTime', e.target.value)} /></td>
                          <td><input className="form-control" style={{ fontSize: 11, padding: '4px 6px', minWidth: 120 }} value={r.locationText} onChange={e => updateRow(r.rowNum, 'locationText', e.target.value)} /></td>
                          <td>
                            <select className="form-control select-dark" style={{ fontSize: 11, padding: '4px 6px', minWidth: 110 }} value={r.type} onChange={e => updateRow(r.rowNum, 'type', e.target.value)}>
                              <option value="">--</option>
                              {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </td>
                          <td style={{ color: '#EF4444', fontSize: 10.5, maxWidth: 180 }}>{r.flags.join('; ') || <span style={{ color: 'var(--color-active)' }}>OK</span>}</td>
                          <td><button type="button" className="btn btn-secondary btn-xs" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => removeRow(r.rowNum)}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {step === 'result' && result && (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>{result.failed.length === 0 ? '✅' : '⚠️'}</div>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>{result.succeeded} of {result.succeeded + result.failed.length} events imported</p>
                {result.failed.length > 0 && (
                  <div style={{ marginTop: 14, textAlign: 'left' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#EF4444', marginBottom: 6 }}>Failed rows (§8.3f):</p>
                    {result.failed.map(f => (
                      <div key={f.row.rowNum} style={{ fontSize: 11.5, padding: '6px 10px', background: 'rgba(239,68,68,0.06)', borderRadius: 6, marginBottom: 4 }}>
                        Row {f.row.rowNum} ({f.row.name || 'unnamed'}): {f.error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="modal-actions-bar">
            {step === 'upload' && <button type="button" className="btn btn-secondary" onClick={() => requestLeave(() => { onClose(); reset(); })}>Cancel</button>}
            {step === 'review' && (
              <>
                <button type="button" className="btn btn-secondary" onClick={() => requestLeave(reset)}>Start Over</button>
                <button type="button" className="btn btn-primary" disabled={flaggedCount > 0 || importing} onClick={handleConfirmImport} style={{ minWidth: 160 }}>
                  {importing ? 'Importing…' : `Confirm Import (${rows.length})`}
                </button>
              </>
            )}
            {step === 'result' && (
              <button type="button" className="btn btn-primary" onClick={() => { onClose(); reset(); }}>Done</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
