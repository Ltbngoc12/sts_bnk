'use client';

import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { getEventTaxonomy } from '@/lib/taxonomy';
import { DEFAULT_NODES, LocationNode, getLocationNodes } from '@/components/LocationSelector';
import { EventRecord } from '@/lib/db';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  username: string;
}

export interface ProcessedRow {
  rowNum: number;
  name: string;
  startDateTime: string;
  endDateTime: string;
  locationText: string;
  type: string;
  description: string;
  roadName?: string;
  buildingName?: string;
  level?: string;
  spaceVenue?: string;
  matchedLocation?: LocationNode;
  status: 'SUCCESS' | 'FAILED';
  errors: string[];
  eventId?: string;
}

const HEADER_MAP: Record<string, keyof Omit<ProcessedRow, 'rowNum' | 'matchedLocation' | 'status' | 'errors' | 'eventId'>> = {
  eventname: 'name',
  name: 'name',
  event: 'name',
  title: 'name',

  eventtype: 'type',
  type: 'type',
  category: 'type',

  startdate: 'startDateTime',
  startdatetime: 'startDateTime',
  start: 'startDateTime',
  datefrom: 'startDateTime',
  fromdate: 'startDateTime',

  enddate: 'endDateTime',
  enddatetime: 'endDateTime',
  end: 'endDateTime',
  dateto: 'endDateTime',
  todate: 'endDateTime',

  eventlocation: 'locationText',
  location: 'locationText',
  locationname: 'locationText',
  commonname: 'locationText',
  venue: 'locationText',

  roadname: 'roadName',
  road: 'roadName',
  streetname: 'roadName',

  buildingname: 'buildingName',
  building: 'buildingName',

  level: 'level',
  floor: 'level',

  spacevenue: 'spaceVenue',
  space: 'spaceVenue',
  room: 'spaceVenue',

  description: 'description',
  desc: 'description',
};

function parseAndValidateDateTime(dateTimeStr: string): {
  valid: boolean;
  date?: Date;
  iso?: string;
  formatted?: string;
  error?: string;
} {
  if (!dateTimeStr || !dateTimeStr.trim()) {
    return { valid: false, error: 'Missing date value' };
  }
  const trimmed = dateTimeStr.trim();

  // 1. Check DD/MM/YYYY HH:mm or DD-MM-YYYY HH:mm
  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    const hasTime = dmyMatch[4] !== undefined;
    const hours = hasTime ? parseInt(dmyMatch[4], 10) : 0;
    const minutes = hasTime ? parseInt(dmyMatch[5], 10) : 0;

    if (month < 1 || month > 12 || day < 1 || day > 31 || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return { valid: false, error: 'Invalid date/time numeric values' };
    }

    const d = new Date(year, month - 1, day, hours, minutes, 0);
    if (isNaN(d.getTime()) || d.getDate() !== day || d.getMonth() !== month - 1 || d.getFullYear() !== year) {
      return { valid: false, error: 'Invalid calendar date' };
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      valid: true,
      date: d,
      iso: d.toISOString(),
      formatted: `${pad(day)}/${pad(month)}/${year} ${pad(hours)}:${pad(minutes)}`,
    };
  }

  // 2. Check YYYY-MM-DD HH:mm (e.g. from XLSX date objects / ISO conversions)
  const ymdMatch = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    const hasTime = ymdMatch[4] !== undefined;
    const hours = hasTime ? parseInt(ymdMatch[4], 10) : 0;
    const minutes = hasTime ? parseInt(ymdMatch[5], 10) : 0;

    if (month < 1 || month > 12 || day < 1 || day > 31 || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return { valid: false, error: 'Invalid date/time numeric values' };
    }

    const d = new Date(year, month - 1, day, hours, minutes, 0);
    if (isNaN(d.getTime()) || d.getDate() !== day || d.getMonth() !== month - 1 || d.getFullYear() !== year) {
      return { valid: false, error: 'Invalid calendar date' };
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      valid: true,
      date: d,
      iso: d.toISOString(),
      formatted: `${pad(day)}/${pad(month)}/${year} ${pad(hours)}:${pad(minutes)}`,
    };
  }

  // 3. Fallback Date parsing
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      valid: true,
      date: d,
      iso: d.toISOString(),
      formatted: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  }

  return { valid: false, error: 'Invalid format. Expected DD/MM/YYYY HH:mm' };
}



function resolveLocationPath(node: LocationNode, nodes: LocationNode[]): { road: string; building: string; levelSpace: string; commonName: string; lat: number; lng: number } {
  let cur: LocationNode | undefined = node;
  const chain: LocationNode[] = [];
  while (cur) {
    chain.unshift(cur);
    cur = nodes.find(n => n.id === cur!.parentId);
  }
  const road = chain.find(n => n.type === 'Road')?.name || '';
  const building = chain.find(n => n.type === 'Building')?.name || '';
  const level = chain.find(n => n.type === 'Level')?.name || '';
  const space = chain.find(n => n.type === 'Space')?.name || '';
  const levelSpace = level && space ? `${level} - ${space}` : (level || space || '');
  return {
    road,
    building,
    levelSpace,
    commonName: node.commonName || node.name,
    lat: node.lat ?? 1.25,
    lng: node.lng ?? 103.83,
  };
}

export default function EventScheduleUploadModal({ isOpen, onClose, onSuccess, username }: Props) {
  const [step, setStep] = useState<'upload' | 'processing' | 'result'>('upload');
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [processedRows, setProcessedRows] = useState<ProcessedRow[]>([]);
  const [succeededCount, setSucceededCount] = useState<number>(0);
  const [failedCount, setFailedCount] = useState<number>(0);
  const [overallStatus, setOverallStatus] = useState<'SUCCESS' | 'PARTIALLY_COMPLETED' | 'FAILED'>('SUCCESS');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setFileError(null);
    setFileName('');
    setProcessedRows([]);
    setSucceededCount(0);
    setFailedCount(0);
    setOverallStatus('SUCCESS');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    onClose();
    reset();
  };

  function parseRawRows(objects: Record<string, any>[]): Omit<ProcessedRow, 'status' | 'errors' | 'eventId'>[] {
    return objects.map((obj, i) => {
      const mapped: any = {
        name: '',
        startDateTime: '',
        endDateTime: '',
        locationText: '',
        type: '',
        description: '',
        roadName: '',
        buildingName: '',
        level: '',
        spaceVenue: '',
      };

      let rawStartDate = '';
      let rawStartTime = '';
      let rawEndDate = '';
      let rawEndTime = '';

      Object.keys(obj).forEach(key => {
        const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        const val = String(obj[key] ?? '').trim();

        if (norm === 'starttime' || norm === 'fromtime' || norm === 'timefrom') rawStartTime = val;
        else if (norm === 'endtime' || norm === 'totime' || norm === 'timeto') rawEndTime = val;

        const canonical = HEADER_MAP[norm];
        if (canonical) mapped[canonical] = val;
      });

      // If separate Start Date and Start Time were provided
      if (rawStartDate && rawStartTime && (!mapped.startDateTime || mapped.startDateTime === rawStartDate)) {
        mapped.startDateTime = `${rawStartDate} ${rawStartTime}`;
      } else if (rawStartDate && !mapped.startDateTime) {
        mapped.startDateTime = rawStartDate;
      }

      // If separate End Date and End Time were provided
      if (rawEndDate && rawEndTime && (!mapped.endDateTime || mapped.endDateTime === rawEndDate)) {
        mapped.endDateTime = `${rawEndDate} ${rawEndTime}`;
      } else if (rawEndDate && !mapped.endDateTime) {
        mapped.endDateTime = rawEndDate;
      }

      return {
        rowNum: i + 2,
        ...mapped,
      };
    });
  }

  const handleFile = async (file: File) => {
    setFileError(null);
    setFileName(file.name);
    setStep('processing');

    try {
      let objects: Record<string, any>[] = [];
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text();
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
        if (parsed.errors.length > 0 && parsed.data.length === 0) {
          setFileError(`CSV parse error: ${parsed.errors[0].message}`);
          setStep('upload');
          return;
        }
        objects = parsed.data as Record<string, any>[];
      } else if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        objects = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      } else {
        setFileError('Unsupported file type. Expected .csv or .xlsx');
        setStep('upload');
        return;
      }

      if (objects.length === 0) {
        setFileError('No rows found in the uploaded file.');
        setStep('upload');
        return;
      }

      // Normalize any Date objects from XLSX cellDates to strings
      const normalized = objects.map(o => {
        const copy = { ...o };
        Object.keys(copy).forEach(k => {
          if (copy[k] instanceof Date) {
            const d = copy[k] as Date;
            const pad = (n: number) => String(n).padStart(2, '0');
            copy[k] = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
          }
        });
        return copy;
      });

      const rawRows = parseRawRows(normalized);
      const eventTypes = getEventTaxonomy();
      const locationNodes = getLocationNodes();

      // Fetch existing events to validate system-level duplicates
      let existingEvents: EventRecord[] = [];
      try {
        const res = await fetch('/api/events');
        if (res.ok) {
          const data = await res.json();
          existingEvents = data.events || [];
        }
      } catch (e) {
        console.warn('Could not fetch existing events for duplicate validation', e);
      }

      // ── Step 1: Validate every row strictly based on user requirements ──
      const validatedList: {
        row: Omit<ProcessedRow, 'status' | 'errors' | 'eventId'>;
        matchedLocation?: LocationNode;
        parsedStartIso?: string;
        parsedEndIso?: string;
        displayStart?: string;
        displayEnd?: string;
        errors: string[];
      }[] = [];

      const intraBatchSeen = new Map<string, number>();

      for (const r of rawRows) {
        const errors: string[] = [];

        // 1. Event Name: Required
        if (!r.name || !r.name.trim()) {
          errors.push('Missing required field: Event Name');
        }

        // 2. Event Type: Required
        if (!r.type || !r.type.trim()) {
          errors.push('Missing required field: Event Type');
        } else if (!eventTypes.includes(r.type.trim())) {
          errors.push(`Event Type "${r.type}" non-matching Taxonomy`);
        }

        // 3. Start Date: Required, format: DD/MM/YYYY HH:mm
        let parsedStart: { valid: boolean; date?: Date; iso?: string; formatted?: string; error?: string } | null = null;
        if (!r.startDateTime || !r.startDateTime.trim()) {
          errors.push('Missing required field: Start Date');
        } else {
          parsedStart = parseAndValidateDateTime(r.startDateTime);
          if (!parsedStart.valid) {
            errors.push('Invalid Start Date format. Expected DD/MM/YYYY HH:mm');
          }
        }

        // 4. End Date: Required, format: DD/MM/YYYY HH:mm
        let parsedEnd: { valid: boolean; date?: Date; iso?: string; formatted?: string; error?: string } | null = null;
        if (!r.endDateTime || !r.endDateTime.trim()) {
          errors.push('Missing required field: End Date');
        } else {
          parsedEnd = parseAndValidateDateTime(r.endDateTime);
          if (!parsedEnd.valid) {
            errors.push('Invalid End Date format. Expected DD/MM/YYYY HH:mm');
          }
        }

        // Date ordering check (End Date must be >= Start Date)
        if (parsedStart?.valid && parsedEnd?.valid && parsedStart.date && parsedEnd.date) {
          if (parsedEnd.date.getTime() < parsedStart.date.getTime()) {
            errors.push('End Date is before Start Date');
          }
        }

        // 5. Event Location: Required (and match Location Hierarchy)
        const targetLoc = (r.locationText || r.spaceVenue || r.buildingName || r.roadName || '').trim();
        let matchedLocation: LocationNode | undefined;

        if (!targetLoc) {
          errors.push('Missing required field: Event Location');
        } else {
          const targetLower = targetLoc.toLowerCase();
          matchedLocation = locationNodes.find(
            n => n.status === 'Active' && (
              (n.commonName && n.commonName.toLowerCase() === targetLower) ||
              (n.name && n.name.toLowerCase() === targetLower)
            )
          );

          if (!matchedLocation && r.spaceVenue) {
            matchedLocation = locationNodes.find(
              n => n.status === 'Active' && n.type === 'Space' && n.name.toLowerCase() === r.spaceVenue!.trim().toLowerCase()
            );
          }
          if (!matchedLocation && r.buildingName) {
            matchedLocation = locationNodes.find(
              n => n.status === 'Active' && n.type === 'Building' && n.name.toLowerCase() === r.buildingName!.trim().toLowerCase()
            );
          }
          if (!matchedLocation && r.roadName) {
            matchedLocation = locationNodes.find(
              n => n.status === 'Active' && n.type === 'Road' && n.name.toLowerCase() === r.roadName!.trim().toLowerCase()
            );
          }

          if (!matchedLocation) {
            errors.push(`Location "${targetLoc}" non-matching Location Hierarchy`);
          }
        }

        // 6. Duplicate checks (Intra-batch and System-level)
        if (r.name.trim() && targetLoc && parsedStart?.valid && parsedStart.date) {
          const startTimeMs = parsedStart.date.getTime();

          // 6a. Intra-batch duplicate
          const intraKey = `${r.name.trim().toLowerCase()}|${startTimeMs}|${targetLoc.toLowerCase()}`;
          if (intraBatchSeen.has(intraKey)) {
            errors.push(`Duplicate record (matches row ${intraBatchSeen.get(intraKey)} in this file)`);
          } else {
            intraBatchSeen.set(intraKey, r.rowNum);
          }

          // 6b. Existing system record duplicate
          const isSystemDuplicate = existingEvents.some(ex => {
            const exStart = new Date(ex.startDateTime).getTime();
            const exLoc = (ex.location.commonName || ex.location.road || ex.location.building || '').toLowerCase();
            return (
              ex.name.trim().toLowerCase() === r.name.trim().toLowerCase() &&
              exStart === startTimeMs &&
              (exLoc === targetLoc.toLowerCase() || (matchedLocation && exLoc === (matchedLocation.commonName || matchedLocation.name).toLowerCase()))
            );
          });

          if (isSystemDuplicate) {
            errors.push('Duplicate record (already exists in Events Master List)');
          }
        }

        validatedList.push({
          row: {
            ...r,
            startDateTime: parsedStart?.formatted || r.startDateTime,
            endDateTime: parsedEnd?.formatted || r.endDateTime,
          },
          matchedLocation,
          parsedStartIso: parsedStart?.iso,
          parsedEndIso: parsedEnd?.iso,
          displayStart: parsedStart?.formatted || r.startDateTime,
          displayEnd: parsedEnd?.formatted || r.endDateTime,
          errors,
        });
      }

      // ── Step 2: Process Creations for Valid Records ──
      const results: ProcessedRow[] = [];
      let successCount = 0;
      let failCount = 0;

      for (const item of validatedList) {
        const { row, matchedLocation, parsedStartIso, parsedEndIso, displayStart, displayEnd, errors } = item;

        if (errors.length > 0) {
          // FAILED record: Do not create event, no portal edit
          failCount++;
          results.push({
            ...row,
            startDateTime: displayStart || row.startDateTime,
            endDateTime: displayEnd || row.endDateTime,
            matchedLocation,
            status: 'FAILED',
            errors,
          });
        } else {
          // Valid record: Attempt creation in DB
          try {
            const loc = matchedLocation ? resolveLocationPath(matchedLocation, locationNodes) : null;
            const res = await fetch('/api/events', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: row.name.trim(),
                type: row.type?.trim() || 'Sports & Recreation',
                description: row.description?.trim() || undefined,
                startDateTime: parsedStartIso,
                endDateTime: parsedEndIso,
                location: {
                  road: loc?.road || row.roadName || '',
                  building: loc?.building || row.buildingName || '',
                  levelSpace: loc?.levelSpace || (row.level && row.spaceVenue ? `${row.level} - ${row.spaceVenue}` : (row.level || row.spaceVenue || '')),
                  commonName: loc?.commonName || row.locationText.trim(),
                  lat: loc?.lat ?? 1.25,
                  lng: loc?.lng ?? 103.83,
                  tags: [],
                },
                username,
              }),
            });

            if (res.ok) {
              const resData = await res.json();
              const createdEvent = resData.event;
              successCount++;
              results.push({
                ...row,
                startDateTime: displayStart || row.startDateTime,
                endDateTime: displayEnd || row.endDateTime,
                matchedLocation,
                status: 'SUCCESS',
                errors: [],
                eventId: createdEvent?.id,
              });
            } else {
              const err = await res.json();
              failCount++;
              results.push({
                ...row,
                startDateTime: displayStart || row.startDateTime,
                endDateTime: displayEnd || row.endDateTime,
                matchedLocation,
                status: 'FAILED',
                errors: [err.error || 'Database creation failed'],
              });
            }
          } catch (err: any) {
            failCount++;
            results.push({
              ...row,
              startDateTime: displayStart || row.startDateTime,
              endDateTime: displayEnd || row.endDateTime,
              matchedLocation,
              status: 'FAILED',
              errors: [err.message || 'Network error during creation'],
            });
          }
        }
      }

      // Calculate overall status
      let overall: 'SUCCESS' | 'PARTIALLY_COMPLETED' | 'FAILED' = 'SUCCESS';
      if (failCount === 0 && successCount > 0) {
        overall = 'SUCCESS';
      } else if (successCount > 0 && failCount > 0) {
        overall = 'PARTIALLY_COMPLETED';
      } else {
        overall = 'FAILED';
      }

      setProcessedRows(results);
      setSucceededCount(successCount);
      setFailedCount(failCount);
      setOverallStatus(overall);
      setStep('result');

      // Refresh parent event list if any events were created
      if (successCount > 0) {
        onSuccess();
      }
    } catch (err: any) {
      setFileError(`Failed to process file: ${err.message || err}`);
      setStep('upload');
    }
  };

  const handleExportReport = () => {
    if (processedRows.length === 0) return;
    const exportHeaders = ['Row #', 'Status', 'Error Reason', 'Event ID', 'Event Name', 'Event Type', 'Start Date', 'End Date', 'Event Location', 'Road Name', 'Building Name', 'Level', 'Description'];
    const exportData = processedRows.map(r => [
      r.rowNum,
      r.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
      `"${(r.status === 'SUCCESS' ? '' : r.errors.join('; ')).replace(/"/g, '""')}"`,
      `"${(r.status === 'SUCCESS' ? (r.eventId || '') : '').replace(/"/g, '""')}"`,
      `"${(r.name || '').replace(/"/g, '""')}"`,
      `"${(r.type || '').replace(/"/g, '""')}"`,
      `"${(r.startDateTime || '').replace(/"/g, '""')}"`,
      `"${(r.endDateTime || '').replace(/"/g, '""')}"`,
      `"${(r.locationText || r.matchedLocation?.name || '').replace(/"/g, '""')}"`,
      `"${(r.roadName || '').replace(/"/g, '""')}"`,
      `"${(r.buildingName || '').replace(/"/g, '""')}"`,
      `"${(r.level || '').replace(/"/g, '""')}"`,
      `"${(r.description || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [exportHeaders.join(','), ...exportData.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Event_Upload_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
        {/* ── Modal Dialog ── */}
        <div
          className="create-case-modal glass"
          style={{
            maxWidth: step === 'result' ? 1220 : 620,
            width: step === 'result' ? '96vw' : '100%',
            background: 'var(--bg-card, #FFFFFF)',
            borderRadius: '12px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
            border: '1px solid var(--border-color, #E2E8F0)',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '90vh',
          }}
        >
          {/* ── Modal Header ── */}
          <div
            className="modal-header"
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color, #E2E8F0)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>📅</span>
              <h2
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  margin: 0,
                  color: 'var(--text-main, #1E293B)',
                }}
              >
                EVENTS SCHEDULE FILE UPLOAD
              </h2>
            </div>
            <button
              type="button"
              className="close-btn"
              onClick={handleClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted, #64748B)',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
              }}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ── Modal Form / Body ── */}
          <div className="modal-form" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div className="modal-scroll-area" style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>

              {/* STEP 1: Upload Dropzone */}
              {step === 'upload' && (
                <>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '16px',
                    }}
                  >
                    <p style={{ fontSize: '13px', color: 'var(--text-sub, #475569)', margin: 0 }}>
                      Upload a CSV or XLSX file of events for automatic bulk creation.
                    </p>
                    <a
                      href="/Events_Upload_Template.csv"
                      download="Events_Upload_Template.csv"
                      className="btn btn-secondary"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        padding: '6px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #CBD5E1)',
                        background: '#FFFFFF',
                        color: 'var(--text-main, #334155)',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      }}
                    >
                      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Download Template
                    </a>
                  </div>

                  <div
                    style={{
                      border: '2px dashed var(--border-color, #CBD5E1)',
                      borderRadius: '10px',
                      padding: '40px 20px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: 'var(--bg-card, #FFFFFF)',
                      transition: 'all 0.2s ease',
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => {
                      e.preventDefault();
                      e.currentTarget.style.borderColor = 'var(--color-primary, #FF8200)';
                      e.currentTarget.style.background = 'rgba(255, 130, 0, 0.02)';
                    }}
                    onDragLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border-color, #CBD5E1)';
                      e.currentTarget.style.background = 'var(--bg-card, #FFFFFF)';
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      e.currentTarget.style.borderColor = 'var(--border-color, #CBD5E1)';
                      e.currentTarget.style.background = 'var(--bg-card, #FFFFFF)';
                      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
                      <svg width="40" height="40" viewBox="0 0 34 34" fill="none">
                        <rect x="5" y="14" width="24" height="15" rx="3" fill="#818CF8" fillOpacity="0.2" stroke="#6366F1" strokeWidth="2" />
                        <path d="M5 20H11L13 23H21L23 20H29" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M17 5V16M17 5L12 10M17 5L22 10" stroke="#FF8200" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-main, #1E293B)', fontWeight: 600 }}>
                      Click to upload or drag &amp; drop
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted, #94A3B8)', marginTop: '4px' }}>
                      Supports .csv, .xlsx, .xls
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      style={{ display: 'none' }}
                      onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                    />
                  </div>

                  {fileError && (
                    <div
                      style={{
                        fontSize: '12.5px',
                        color: '#EF4444',
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        marginTop: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span>⚠️</span>
                      <span>{fileError}</span>
                    </div>
                  )}
                </>
              )}

              {/* STEP 2: Processing state */}
              {step === 'processing' && (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                  <div className="spinner" style={{ margin: '0 auto 16px auto', width: '36px', height: '36px' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main, #1E293B)', margin: '0 0 8px 0' }}>
                    Processing &amp; Creating Events...
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted, #64748B)', margin: 0 }}>
                    Validating fields, checking Location Hierarchy, and creating records for <strong>{fileName}</strong>
                  </p>
                </div>
              )}

              {/* STEP 3: Results View (Read-Only Table & Status Summary) */}
              {step === 'result' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  {/* Information Bullet Points in Title / Summary Section */}
                  <div
                    style={{
                      background: 'var(--bg-inset, #F8FAFC)',
                      border: '1px solid var(--border-color, #E2E8F0)',
                      borderRadius: '8px',
                      padding: '14px 18px',
                      fontSize: '13px',
                      color: 'var(--text-main, #1E293B)',
                      lineHeight: 1.6,
                    }}
                  >
                    <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <li>
                        <strong>Status:</strong>{' '}
                        <span
                          style={{
                            fontWeight: 700,
                            color:
                              overallStatus === 'SUCCESS'
                                ? '#059669'
                                : overallStatus === 'PARTIALLY_COMPLETED'
                                ? '#D97706'
                                : '#DC2626',
                            textTransform: 'uppercase',
                          }}
                        >
                          {overallStatus === 'SUCCESS'
                            ? 'SUCCESS'
                            : overallStatus === 'PARTIALLY_COMPLETED'
                            ? 'PARTIALLY COMPLETED'
                            : 'FAILED'}
                        </span>
                      </li>
                      <li>
                        <strong>Total record:</strong> {processedRows.length}
                      </li>
                      <li>
                        <strong>Total success record:</strong>{' '}
                        <span style={{ color: '#059669', fontWeight: 600 }}>{succeededCount}</span>
                      </li>
                      <li>
                        <strong>Total failed record:</strong>{' '}
                        <span style={{ color: failedCount > 0 ? '#DC2626' : 'inherit', fontWeight: 600 }}>{failedCount}</span>
                      </li>
                    </ul>
                  </div>

                  {/* Read-Only Results Table with All 13 Columns & Horizontal Scroll */}
                  <div
                    className="table-container"
                    style={{
                      maxHeight: '420px',
                      overflowY: 'auto',
                      overflowX: 'auto',
                      border: '1px solid var(--border-color, #E2E8F0)',
                      borderRadius: '8px',
                      background: 'var(--bg-card, #FFFFFF)',
                      WebkitOverflowScrolling: 'touch',
                    }}
                  >
                    <table
                      className="custom-table"
                      style={{
                        fontSize: '11.5px',
                        minWidth: '1600px',
                        width: 'max-content',
                        borderCollapse: 'collapse',
                      }}
                    >
                      <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                        <tr style={{ background: 'var(--bg-inset, #F1F5F9)', textAlign: 'left', borderBottom: '1px solid var(--border-color, #CBD5E1)' }}>
                          <th style={{ padding: '10px 8px', width: '40px', minWidth: '40px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>#</th>
                          <th style={{ padding: '10px 8px', width: '90px', minWidth: '90px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>Status</th>
                          <th style={{ padding: '10px 8px', width: '230px', minWidth: '230px', fontWeight: 700, color: 'var(--text-muted)' }}>Error Reason</th>
                          <th style={{ padding: '10px 8px', width: '130px', minWidth: '130px', fontWeight: 700, color: 'var(--text-muted)' }}>Event ID</th>
                          <th style={{ padding: '10px 8px', width: '170px', minWidth: '170px', fontWeight: 700, color: 'var(--text-muted)' }}>Event Name</th>
                          <th style={{ padding: '10px 8px', width: '120px', minWidth: '120px', fontWeight: 700, color: 'var(--text-muted)' }}>Event Type</th>
                          <th style={{ padding: '10px 8px', width: '130px', minWidth: '130px', fontWeight: 700, color: 'var(--text-muted)' }}>Start Date</th>
                          <th style={{ padding: '10px 8px', width: '130px', minWidth: '130px', fontWeight: 700, color: 'var(--text-muted)' }}>End Date</th>
                          <th style={{ padding: '10px 8px', width: '140px', minWidth: '140px', fontWeight: 700, color: 'var(--text-muted)' }}>Event Location</th>
                          <th style={{ padding: '10px 8px', width: '130px', minWidth: '130px', fontWeight: 700, color: 'var(--text-muted)' }}>Road Name</th>
                          <th style={{ padding: '10px 8px', width: '130px', minWidth: '130px', fontWeight: 700, color: 'var(--text-muted)' }}>Building Name</th>
                          <th style={{ padding: '10px 8px', width: '90px', minWidth: '90px', fontWeight: 700, color: 'var(--text-muted)' }}>Level</th>
                          <th style={{ padding: '10px 8px', width: '180px', minWidth: '180px', fontWeight: 700, color: 'var(--text-muted)' }}>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {processedRows.length === 0 ? (
                          <tr>
                            <td colSpan={13} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                              No records found.
                            </td>
                          </tr>
                        ) : (
                          processedRows.map(r => {
                            const isSuccess = r.status === 'SUCCESS';
                            return (
                              <tr
                                key={r.rowNum}
                                style={{
                                  background: isSuccess ? 'transparent' : 'rgba(239, 68, 68, 0.04)',
                                  borderBottom: '1px solid var(--border-color, #E2E8F0)',
                                }}
                              >
                                <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>
                                  {r.rowNum}
                                </td>
                                <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      padding: '3px 10px',
                                      borderRadius: '12px',
                                      background: isSuccess ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                      color: isSuccess ? '#059669' : '#DC2626',
                                      textTransform: 'uppercase',
                                    }}
                                  >
                                    {isSuccess ? 'SUCCESS' : 'FAILED'}
                                  </span>
                                </td>
                                <td style={{ padding: '10px 8px' }}>
                                  {!isSuccess && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                      {r.errors.map((err, errIdx) => (
                                        <span
                                          key={errIdx}
                                          style={{
                                            color: '#DC2626',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            lineHeight: 1.3,
                                          }}
                                        >
                                          • {err}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '10px 8px' }}>
                                  {isSuccess && r.eventId ? (
                                    <span
                                      style={{
                                        fontFamily: 'var(--font-mono, monospace)',
                                        fontSize: '11px',
                                        color: '#059669',
                                        fontWeight: 700,
                                        background: 'rgba(16, 185, 129, 0.08)',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(16, 185, 129, 0.25)',
                                      }}
                                    >
                                      {r.eventId}
                                    </span>
                                  ) : (
                                    ''
                                  )}
                                </td>
                                <td style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text-main, #1E293B)' }}>
                                  {r.name || <span style={{ color: '#EF4444', fontStyle: 'italic' }}>(Empty)</span>}
                                </td>
                                <td style={{ padding: '10px 8px' }}>
                                  {r.type ? (
                                    <span
                                      style={{
                                        fontSize: '10.5px',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        background: 'var(--bg-inset, #F1F5F9)',
                                        color: 'var(--text-main, #334155)',
                                        fontWeight: 600,
                                      }}
                                    >
                                      {r.type}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#EF4444', fontStyle: 'italic' }}>(Empty)</span>
                                  )}
                                </td>
                                <td style={{ padding: '10px 8px', color: 'var(--text-sub, #475569)', whiteSpace: 'nowrap' }}>
                                  {r.startDateTime || <span style={{ color: '#EF4444', fontStyle: 'italic' }}>(Empty)</span>}
                                </td>
                                <td style={{ padding: '10px 8px', color: 'var(--text-sub, #475569)', whiteSpace: 'nowrap' }}>
                                  {r.endDateTime || <span style={{ color: '#EF4444', fontStyle: 'italic' }}>(Empty)</span>}
                                </td>
                                <td style={{ padding: '10px 8px', color: 'var(--text-sub, #475569)' }}>
                                  {r.locationText || r.matchedLocation?.commonName || r.matchedLocation?.name || (
                                    <span style={{ color: '#EF4444', fontStyle: 'italic' }}>(Empty)</span>
                                  )}
                                </td>
                                <td style={{ padding: '10px 8px', color: 'var(--text-sub, #475569)' }}>
                                  {r.roadName || ''}
                                </td>
                                <td style={{ padding: '10px 8px', color: 'var(--text-sub, #475569)' }}>
                                  {r.buildingName || ''}
                                </td>
                                <td style={{ padding: '10px 8px', color: 'var(--text-sub, #475569)' }}>
                                  {r.level || ''}
                                </td>
                                <td
                                  style={{
                                    padding: '10px 8px',
                                    color: 'var(--text-sub, #475569)',
                                    maxWidth: '200px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                  title={r.description || ''}
                                >
                                  {r.description || ''}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                </div>
              )}

            </div>

          {/* ── Modal Actions / Footer ── */}
          <div
            className="modal-actions-bar"
            style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border-color, #E2E8F0)',
              display: 'flex',
              justifyContent: step === 'result' ? 'space-between' : 'flex-end',
              alignItems: 'center',
              gap: '10px',
              background: 'var(--bg-inset, #F8FAFC)',
              flexShrink: 0,
            }}
          >
            {step === 'upload' && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClose}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid var(--border-color, #CBD5E1)',
                  borderRadius: '8px',
                  padding: '7px 20px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-main, #334155)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            )}

            {step === 'result' && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleExportReport}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#FFFFFF',
                    border: '1px solid var(--border-color, #CBD5E1)',
                    borderRadius: '8px',
                    padding: '7px 16px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: 'var(--text-main, #334155)',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download file
                </button>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={reset}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid var(--border-color, #CBD5E1)',
                      borderRadius: '8px',
                      padding: '7px 16px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--text-main, #334155)',
                      cursor: 'pointer',
                    }}
                  >
                    Upload Another File
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleClose}
                    style={{
                      minWidth: '90px',
                      padding: '7px 20px',
                      fontSize: '13px',
                      fontWeight: 600,
                      borderRadius: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
