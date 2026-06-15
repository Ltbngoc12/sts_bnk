import { NextResponse } from 'next/server';
import { getDb, saveDb, generateCaseId } from '@/lib/db';

// Helper: build a timestamped log entry
function makeLogEntry(db_incident: any, description: string) {
  const now = new Date();
  return {
    eventNumber: (db_incident.log?.length ?? 0) + 1,
    date: now.toISOString().split('T')[0],
    time: now.toLocaleTimeString('en-US', { hour12: false }),
    description,
  };
}

function generateFaultId(db: any): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const prefix = `SEN/FR/${year}${month}${day}/`;
  
  const todayFaults = (db.faults || []).filter((f: any) => f.id.startsWith(prefix));
  
  let nextSeq = 1;
  if (todayFaults.length > 0) {
    const sequences = todayFaults.map((f: any) => {
      const parts = f.id.split('/');
      const seqStr = parts[parts.length - 1];
      return parseInt(seqStr, 10);
    }).filter((num: any) => !isNaN(num));
    
    if (sequences.length > 0) {
      nextSeq = Math.max(...sequences) + 1;
    }
  }
  
  const seqStr = String(nextSeq).padStart(3, '0');
  return `${prefix}${seqStr}`;
}

/**
 * Route: /api/incidents/[...id]
 *
 * Supports slash-containing case/incident IDs, resolving by Case ID or Incident ID.
 */

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const queryId = id.join('/');
    const db = await getDb();
    const caseObj = db.cases.find(c => c.id === queryId || (c.incident && c.incident.id === queryId));
    if (!caseObj?.incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }
    
    const incidentData = caseObj.incident;
    const caseId = caseObj.id;
    
    // Fetch related records
    const relatedTasks = db.tasks.filter(t => t.caseId === caseId);
    const relatedFaults = db.faults?.filter(f => f.caseId === caseId) || [];
    const relatedBroadcasts = db.broadcasts?.filter(b => b.caseId === caseId || b.incidentId === incidentData.id) || [];
    const relatedOccurrences = db.occurrences.filter(o => o.caseId === caseId);
    
    const responsePayload = {
      ...incidentData,
      relatedTasks,
      relatedFaults,
      relatedBroadcasts,
      relatedOccurrences
    };
    
    return NextResponse.json(responsePayload);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── PUT (Legacy/ancillary updates) ───────────────────────────────────────────
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const queryId = id.join('/');
    const body = await request.json();
    const db = await getDb();

    const caseIndex = db.cases.findIndex(c => c.id === queryId || (c.incident && c.incident.id === queryId));
    if (caseIndex === -1 || !db.cases[caseIndex].incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    const currentCase = db.cases[caseIndex];
    const incident = currentCase.incident!;
    const now = new Date();
    const logDate = now.toISOString().split('T')[0];
    const logTime = now.toLocaleTimeString('en-US', { hour12: false });

    // Assigned responder — now supports arrays
    if (body.assignedTo !== undefined) {
      const incoming: string[] = Array.isArray(body.assignedTo)
        ? body.assignedTo
        : (body.assignedTo ? [body.assignedTo] : []);
      const prev: string[] = Array.isArray(incident.assignedTo)
        ? incident.assignedTo
        : (incident.assignedTo ? [incident.assignedTo as unknown as string] : []);
      
      if (JSON.stringify(incoming) !== JSON.stringify(prev)) {
        // Sync responders array (single source of truth)
        const actor = body.username ?? 'Controller';
        
        // Mark removed responders
        const updatedResponders = (incident.responders || []).map(r => {
          if (!incoming.includes(r.responderId) && r.status === 'Active') {
            return { ...r, status: 'Removed' as const };
          }
          return r;
        });

        // Add new active responders
        incoming.forEach(r => {
          const exists = updatedResponders.find(x => x.responderId === r);
          if (exists) {
            exists.status = 'Active';
          } else {
            updatedResponders.push({
              responderId: r,
              assignedBy: actor,
              assignedAt: new Date().toISOString(),
              status: 'Active'
            });
          }
        });

        incident.responders = updatedResponders;
        incident.assignedTo = incoming;

        if (incoming.length > 0) {
          incident.status = 'Live (Assigned)';
          incident.log.push({
            eventNumber: incident.log.length + 1,
            date: logDate,
            time: logTime,
            description: `Responders assigned: ${incoming.join(', ')} (by ${actor}). Status set to Live (Assigned).`
          });
        }
      }
    }

    // Direct Status update (if needed, though POST endpoints are preferred)
    if (body.status) {
      const old = incident.status;
      incident.status = body.status;
      let msg = `Status changed from "${old}" → "${body.status}"${body.username ? ` by ${body.username}` : ''}.`;
      incident.log.push({ eventNumber: incident.log.length + 1, date: logDate, time: logTime, description: msg });
    }

    // Manual log entry
    if (body.newLogEntry) {
      incident.log.push({ eventNumber: incident.log.length + 1, date: logDate, time: logTime, description: body.newLogEntry });
    }

    // Core particular updates
    if (body.title) {
      incident.title = body.title;
      currentCase.title = body.title;
    }
    if (body.dateTime) incident.dateTime = body.dateTime;
    if (body.type) incident.type = body.type;
    if (body.subType) incident.subType = body.subType;
    if (body.priority) incident.priority = body.priority;
    if (body.crisisLevel !== undefined) incident.crisisLevel = parseInt(body.crisisLevel, 10);
    if (body.requestedBy) incident.requestedBy = body.requestedBy;
    if (body.reporterName !== undefined) incident.reporterName = body.reporterName;
    if (body.category) incident.category = body.category;

    // Location updates
    if (body.location) {
      incident.location = { ...incident.location, ...body.location };
    }

    // Ancillary field updates
    if (body.emergencyServices) incident.emergencyServices = { ...incident.emergencyServices, ...body.emergencyServices };
    if (body.mediaInvolvement) {
      const prevMedia = incident.mediaInvolvement.mediaAtScene;
      const prevComms = incident.mediaInvolvement.commsNotified;
      incident.mediaInvolvement = { ...incident.mediaInvolvement, ...body.mediaInvolvement };
      
      if (incident.mediaInvolvement.mediaAtScene && !prevMedia) {
        incident.log.push({ eventNumber: incident.log.length + 1, date: logDate, time: logTime, description: 'Media presence detected at scene.' });
      }
      if (incident.mediaInvolvement.commsNotified && !prevComms) {
        incident.log.push({ eventNumber: incident.log.length + 1, date: logDate, time: logTime, description: 'SDC Communications Team notified regarding media presence.' });
      }
    }
    if (body.propertyDamage) incident.propertyDamage = { ...incident.propertyDamage, ...body.propertyDamage };
    if (body.vehiclesInvolved) incident.vehiclesInvolved = body.vehiclesInvolved;
    if (body.personalInjuries) incident.personalInjuries = body.personalInjuries;
    if (body.personsInvolved) incident.personsInvolved = body.personsInvolved;
    if (body.cctvBwc) incident.cctvBwc = body.cctvBwc;
    if (body.summary) incident.summary = body.summary;
    if (body.attachments) incident.attachments = body.attachments;

    currentCase.incident = incident;
    db.cases[caseIndex] = currentCase;
    await saveDb(db);

    return NextResponse.json(incident);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── POST (action-oriented lifecycle transitions) ───────────────────────────
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    
    // Resolve queryId and action correctly
    const lastSegment = id[id.length - 1];
    let action: string | null = null;
    let queryId = id.join('/');

    const knownActions = [
      'assign', 'acknowledge', 'on-site', 'complete', 'close', 'return',
      'submit-review', 'submit-endorsement', 'log', 'update-fields',
      'reopen', 'mark-incomplete', 'edit-log', 'delete-log', 'raise-fault'
    ];

    if (knownActions.includes(lastSegment)) {
      action = lastSegment;
      queryId = id.slice(0, -1).join('/');
    }

    const body = await request.json().catch(() => ({}));
    const db = await getDb();

    const caseIndex = db.cases.findIndex(c => c.id === queryId || (c.incident && c.incident.id === queryId));
    if (caseIndex === -1 || !db.cases[caseIndex].incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    const currentCase = db.cases[caseIndex];
    const incident = currentCase.incident!;
    const actor = body.username ?? 'System';
    const caseId = currentCase.id;

    switch (action) {
      // ── Assign / Add / Remove responder ───────────────────────────────────
      case 'assign': {
        // Normalise current list
        const activeResponders = (incident.responders || []).filter(r => r.status === 'Active');
        const currentList = activeResponders.map(r => r.responderId);

        // ── ADD a single responder ────────────────────────────────────────
        if (body.addResponder) {
          if (currentList.includes(body.addResponder)) {
            return NextResponse.json({ error: `${body.addResponder} is already assigned to this Incident.` }, { status: 409 });
          }
          const updatedList = [...currentList, body.addResponder];
          incident.assignedTo = updatedList;
          // First assignment: transition to Live (Assigned)
          if (currentList.length === 0) {
            incident.status = 'Live (Assigned)';
          }
          // Record rich metadata
          incident.responders = [
            ...(incident.responders || []),
            {
              responderId: body.addResponder,
              assignedBy: actor,
              assignedAt: new Date().toISOString(),
              status: 'Active'
            }
          ];
          incident.log.push(makeLogEntry(incident,
            `Responder added: ${body.addResponder} — assigned by ${actor}.`
          ));
          break;
        }

        // ── REMOVE a single responder ───────────────────────────────────
        if (body.removeResponder) {
          if (currentList.length <= 1) {
            return NextResponse.json(
              { error: 'At least one Responder must remain assigned to the Incident.' },
              { status: 409 }
            );
          }
          if (!currentList.includes(body.removeResponder)) {
            return NextResponse.json({ error: `${body.removeResponder} is not assigned to this Incident.` }, { status: 404 });
          }
          incident.assignedTo = currentList.filter(r => r !== body.removeResponder);
          // Update rich metadata — mark as Removed
          incident.responders = (incident.responders || []).map(r =>
            r.responderId === body.removeResponder ? { ...r, status: 'Removed' } : r
          );
          incident.log.push(makeLogEntry(incident,
            `Responder removed: ${body.removeResponder} — unassigned by ${actor}.`
          ));
          break;
        }

        // ── REPLACE full list (e.g. from legacy or bulk re-assign) ──────────
        if (body.assignedTo !== undefined) {
          const incoming: string[] = Array.isArray(body.assignedTo)
            ? body.assignedTo
            : (body.assignedTo ? [body.assignedTo] : []);
          
          const updatedResponders = (incident.responders || []).map(r => {
            if (!incoming.includes(r.responderId) && r.status === 'Active') {
              return { ...r, status: 'Removed' as const };
            }
            return r;
          });

          incoming.forEach(r => {
            const exists = updatedResponders.find(x => x.responderId === r);
            if (exists) {
              exists.status = 'Active';
            } else {
              updatedResponders.push({
                responderId: r,
                assignedBy: actor,
                assignedAt: new Date().toISOString(),
                status: 'Active'
              });
            }
          });

          incident.responders = updatedResponders;
          incident.assignedTo = incoming;

          if (incoming.length > 0) {
            incident.status = 'Live (Assigned)';
          }
          incident.log.push(makeLogEntry(incident,
            `Responder assignment updated to: ${incoming.join(', ')} — by ${actor}.`
          ));
          break;
        }

        return NextResponse.json({ error: 'assignedTo, addResponder, or removeResponder is required' }, { status: 400 });
      }

      // ── Responder acknowledges ─────────────────────────────────
      case 'acknowledge': {
        if (!['Live', 'Live (Assigned)'].includes(incident.status)) {
          return NextResponse.json({ error: `Cannot acknowledge: current status is "${incident.status}"` }, { status: 409 });
        }
        incident.status = 'Live (Acknowledged)';
        incident.acknowledgedAt = new Date().toISOString();
        incident.log.push(makeLogEntry(incident, `Responder ${Array.isArray(incident.assignedTo) && incident.assignedTo.length > 0 ? incident.assignedTo.join(', ') : actor} acknowledged dispatch. Status changed to Live (Acknowledged).`));
        break;
      }

      // ── Responder arrives on-site ──────────────────────────────
      case 'on-site': {
        if (incident.status !== 'Live (Acknowledged)') {
          return NextResponse.json({ error: `Cannot mark on-site: current status is "${incident.status}"` }, { status: 409 });
        }
        incident.status = 'Live (On-Site)';
        incident.onSiteAt = new Date().toISOString();
        incident.log.push(makeLogEntry(incident, `Responder ${Array.isArray(incident.assignedTo) && incident.assignedTo.length > 0 ? incident.assignedTo.join(', ') : actor} confirmed arrival on-site. Status changed to Live (On-Site).`));
        break;
      }

      // ── Responder completes ground activities ──────────────────
      case 'complete': {
        if (!['Live (On-Site)', 'Live (Acknowledged)', 'Live', 'Live (Assigned)', 'Live (Incomplete)'].includes(incident.status)) {
          return NextResponse.json({ error: `Cannot complete: current status is "${incident.status}"` }, { status: 409 });
        }
        incident.status = 'Live (Completed)';
        incident.completedAt = new Date().toISOString();
        incident.log.push(makeLogEntry(incident,
          `Responder ${Array.isArray(incident.assignedTo) && incident.assignedTo.length > 0 ? incident.assignedTo.join(', ') : actor} marked ground activities completed. Status changed to Live (Completed).`
        ));
        break;
      }

      // ── Submit for review / endorsement ────────────────────────
      case 'submit-review':
      case 'submit-endorsement': {
        if (!['Live (Completed)', 'Live (Incomplete)', 'Returned', 'Live'].includes(incident.status)) {
          return NextResponse.json({ error: `Can only submit for endorsement from completed, incomplete, or returned status. Current: "${incident.status}"` }, { status: 409 });
        }
        incident.status = 'Pending Endorsement';
        incident.log.push(makeLogEntry(incident, `Incident submitted for Duty Manager endorsement by ${actor}.`));
        break;
      }

      // ── Duty Manager approves closure ──────────────────────────
      case 'close': {
        if (incident.status === 'Closed') {
          return NextResponse.json({ error: 'Incident is already Closed.' }, { status: 409 });
        }
        incident.status = 'Closed';
        incident.completionRemarks = body.closureRemarks || '';
        incident.closedAt = new Date().toISOString();
        incident.closedBy = actor;
        
        // Close the parent case only if no other active tasks exist
        const activeTasks = db.tasks.filter(t => t.caseId === caseId && t.status !== 'Closed');
        if (activeTasks.length === 0) {
          currentCase.status = 'Closed';
          currentCase.closedAt = new Date().toISOString();
          currentCase.closedBy = actor;
        }
        
        // Close any linked duplicate records
        if (incident.slaveIncidents) {
          incident.slaveIncidents = incident.slaveIncidents.map((s: any) => ({ ...s, status: 'Closed' }));
        }
        incident.log.push(makeLogEntry(incident,
          `Incident approved and closed by ${actor} (Duty Manager).${body.closureRemarks ? ` Closure remarks: ${body.closureRemarks}` : ''} Record is now read-only.`
        ));
        break;
      }

      // ── Duty Manager returns to controller ─────────────────────
      case 'return': {
        if (incident.status !== 'Pending Endorsement') {
          return NextResponse.json({ error: `Cannot return: incident status is "${incident.status}" (must be Pending Endorsement)` }, { status: 409 });
        }
        incident.status = 'Returned';
        incident.completionRemarks = body.returnRemarks || '';
        incident.log.push(makeLogEntry(incident,
          `Incident returned to Controller by ${actor}${body.returnRemarks ? `. Reason: ${body.returnRemarks}` : '.'}`
        ));
        break;
      }

      // ── System Administrator Reopens closed incident ───────────
      case 'reopen': {
        if (incident.status !== 'Closed') {
          return NextResponse.json({ error: 'Incident is not closed and cannot be reopened.' }, { status: 400 });
        }
        
        incident.status = 'Live';
        incident.closedAt = undefined;
        incident.closedBy = undefined;
        
        // Reopen parent Case as active
        if (currentCase.status === 'Closed') {
          currentCase.status = 'Active';
          currentCase.closedAt = null;
          currentCase.closedBy = null;
        }
        
        incident.log.push(makeLogEntry(incident, `Incident reopened by System Administrator (${actor}). Status reset to Live.`));
        break;
      }

      // ── Mark Incomplete ────────────────────────────────────────
      case 'mark-incomplete': {
        if (!['Live (On-Site)', 'Live (Acknowledged)', 'Live (Assigned)', 'Live'].includes(incident.status)) {
          return NextResponse.json({ error: `Cannot mark incomplete: current status is "${incident.status}"` }, { status: 409 });
        }
        incident.status = 'Live (Incomplete)';
        incident.log.push(makeLogEntry(incident, `Incident marked as Incomplete by ${actor}.${body.remarks ? ` Remarks: ${body.remarks}` : ''}`));
        break;
      }

      // ── Append manual log entry ────────────────────────────────
      case 'log': {
        if (!body.description) return NextResponse.json({ error: 'description is required' }, { status: 400 });
        const isRangerLog = body.description.startsWith('[Ranger Log]');
        const text = isRangerLog ? body.description : `[MANUAL] ${body.description} — by ${actor}.`;
        const entry = {
          ...makeLogEntry(incident, text),
          attachments: body.attachments || []
        };
        incident.log.push(entry);
        break;
      }

      // ── Edit manual log entry ────────────────────────────────
      case 'edit-log': {
        const eventNumber = parseInt(body.eventNumber, 10);
        const newDescription = body.description;
        if (isNaN(eventNumber) || !newDescription) {
          return NextResponse.json({ error: 'eventNumber and description are required' }, { status: 400 });
        }
        const logEntry = incident.log.find(e => e.eventNumber === eventNumber);
        if (!logEntry) {
          return NextResponse.json({ error: 'Log entry not found' }, { status: 404 });
        }
        
        let updatedText = newDescription;
        if (logEntry.description.startsWith('[Ranger Log] ')) {
          updatedText = `[Ranger Log] ${newDescription}`;
        } else if (logEntry.description.startsWith('[MANUAL] ')) {
          const suffixIndex = logEntry.description.lastIndexOf(' — by ');
          if (suffixIndex !== -1) {
            const suffix = logEntry.description.slice(suffixIndex);
            updatedText = `[MANUAL] ${newDescription}${suffix}`;
          } else {
            updatedText = `[MANUAL] ${newDescription} — by ${actor}.`;
          }
        }
        
        logEntry.description = updatedText;
        logEntry.edited = true;
        logEntry.editedBy = actor;
        logEntry.editedAt = new Date().toISOString();
        break;
      }

      // ── Soft Delete manual log entry ──────────────────────────
      case 'delete-log': {
        const eventNumber = parseInt(body.eventNumber, 10);
        if (isNaN(eventNumber)) {
          return NextResponse.json({ error: 'eventNumber is required' }, { status: 400 });
        }
        const logEntry = incident.log.find(e => e.eventNumber === eventNumber);
        if (!logEntry) {
          return NextResponse.json({ error: 'Log entry not found' }, { status: 404 });
        }
        
        logEntry.deleted = true;
        logEntry.deletedBy = actor;
        logEntry.deletedAt = new Date().toISOString();
        break;
      }

      // ── Raise Linked Fault (FRD 5.9) ──────────────────────────
      case 'raise-fault': {
        const title = body.title;
        const faultType = body.faultType || 'Facilities';
        const faultSubType = body.faultSubType || 'Others';
        const severity = body.severity || 'Medium';
        const description = body.description || title;

        if (!title) {
          return NextResponse.json({ error: 'title is required' }, { status: 400 });
        }

        const newCaseId = generateCaseId(db);
        const newFaultId = generateFaultId(db);
        const cmmsTicketId = `CMMS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(10000 + Math.random() * 90000)}`;

        const newCase: any = {
          id: newCaseId,
          title: `Fault: ${title}`,
          status: 'Active',
          createdAt: new Date().toISOString(),
          createdBy: actor,
          closedAt: null,
          closedBy: null,
          cmmsTickets: [cmmsTicketId],
          incident: null
        };

        const newFault: any = {
          id: newFaultId,
          caseId: newCaseId,
          faultType,
          faultSubType,
          location: {
            ...incident.location
          },
          description,
          attachments: [],
          status: 'Created',
          cmmsTicketId,
          createdBy: actor,
          createdAt: new Date().toISOString(),
          linkedIncidentId: incident.id
        };

        db.cases.push(newCase);
        if (!db.faults) db.faults = [];
        db.faults.push(newFault);

        incident.log.push(makeLogEntry(incident, 
          `Linked Fault ${newFaultId} raised by Controller ${actor}. CMMS Ticket: ${cmmsTicketId}.`
        ));
        
        break;
      }

      // ── Update ancillary fields ────────────────────────────────
      case 'update-fields': {
        if (body.emergencyServices) incident.emergencyServices = { ...incident.emergencyServices, ...body.emergencyServices };
        if (body.mediaInvolvement) {
          incident.mediaInvolvement = { ...incident.mediaInvolvement, ...body.mediaInvolvement };
          if (body.mediaInvolvement.commsNotified) {
            incident.log.push(makeLogEntry(incident, 'SDC Communications Team notified regarding media presence.'));
          }
        }
        if (body.propertyDamage) incident.propertyDamage = { ...incident.propertyDamage, ...body.propertyDamage };
        if (body.vehiclesInvolved) incident.vehiclesInvolved = body.vehiclesInvolved;
        if (body.personalInjuries) incident.personalInjuries = body.personalInjuries;
        if (body.personsInvolved) incident.personsInvolved = body.personsInvolved;
        if (body.cctvBwc) incident.cctvBwc = body.cctvBwc;
        if (body.summary) incident.summary = body.summary;
        if (body.category) incident.category = body.category;
        
        incident.log.push(makeLogEntry(incident, `Ancillary fields updated by ${actor}.`));
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown action: "${action}"` }, { status: 400 });
    }

    currentCase.incident = incident;
    db.cases[caseIndex] = currentCase;
    await saveDb(db);

    return NextResponse.json({ ok: true, incident, case: currentCase });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
