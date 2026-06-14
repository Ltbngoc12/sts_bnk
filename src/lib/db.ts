import fs from 'fs';
import path from 'path';

// Core entities matching the normalized database structure

export interface Location {
  road: string;
  building: string;
  levelSpace: string;
  nearAt: string;
  commonName: string;
  postalCode: string;
  tags: string[];
  lat: number;
  lng: number;
}

export interface LogEntry {
  eventNumber: number;
  date: string;
  time: string;
  description: string;
  recordedBy?: string;
  edited?: boolean;
  editedBy?: string;
  editedAt?: string;
  deleted?: boolean;
  deletedBy?: string;
  deletedAt?: string;
}

export interface EmergencyServices {
  policeAtScene: boolean;
  officerNameRank: string;
  policeIncidentNo: string;
  classification: string;
  respondingUnit: string;
  ambulanceScdfType: string; // "Ambulance" | "SCDF" | "None" | ""
  ambulanceOfficerName: string;
  ambulanceCallSign: string;
  ambulanceRespondingUnit: string;
  ambulanceArrivalTime: string;
  hospitalConveyedTo: string;
}

export interface MediaInvolvement {
  mediaAtScene: boolean;
  mediaName: string;
  commsNotified: boolean;
}

export interface PropertyDamage {
  sdcPropertyDamaged: boolean;
  description: string;
}

export interface VehicleInvolved {
  sdcVehicleInvolved: boolean;
  vehicleModel: string;
  vehicleNumber: string;
  driverName: string;
  driverContact: string;
  drivingLicenceNo: string;
  driverAddress: string;
  remarks: string;
}

export interface PersonalInjury {
  name: string;
  address: string;
  age: number;
  gender: string;
  contactNumber: string;
  clinicHospitalAttended: string;
  msigFormIssued: boolean;
  msigSerialNo?: string;
  under16: boolean;
  parentGuardianName?: string;
  parentGuardianContact?: string;
}

export interface PersonInvolved {
  guestOrNonGuest: string; // "Guest" | "Non-Guest"
  type: string; // "Guest" | "Staff" | "Island Partner" | "Contractor" | "Resident" | "Others"
  name: string;
  address: string;
  age: number;
  gender: string;
  contactNumber: string;
  roleInvolvement: string;
  injuryDetails: string;
}

export interface CCTVBWC {
  cameraNumber: string;
  vmsTimestamp: string;
  vmsBookmark: string;
  bwcNumber: string;
  bwcTimestamp: string;
}

export interface Attachment {
  id: string;
  incidentId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface SlaveIncident {
  id: string; // SEN/IR/YYYYMMDD/NNNN
  title: string;
  dateTime: string;
  reporterName: string;
  summary: string;
  status: string; // Open, Closed
}

export interface IncidentResponder {
  responderId: string;   // Display name, e.g. "Ranger John"
  assignedBy: string;    // Username of Controller who made the assignment
  assignedAt: string;    // ISO datetime of assignment
  status: 'Active' | 'Removed'; // 'Removed' when explicitly unassigned
}

export interface Incident {
  id: string; // SEN/IR/YYYYMMDD/NNNN
  caseId: string;
  title: string;
  dateTime: string;
  type: string;
  subType: string;
  priority: string; // "Normal" | "High"
  crisisLevel: number; // 1 to 5 (default 4)
  reporterName: string;
  requestedBy: string;
  createdBy: string;
  category: string; // "Standard Incident" | "Proactive Incident" | "Backdated Incident" | "Ongoing Incident" | "Operational Record"
  status: string; // "Live" | "Live (Assigned)" | "Live (Acknowledged)" | "Live (On-Site)" | "Live (Incomplete)" | "Live (Completed)" | "Pending Endorsement" | "Returned" | "Closed"
  assignedTo: string[]; // Array of responder display names, e.g. ["Ranger John", "Ranger Dave"]
  responders?: IncidentResponder[]; // Rich metadata per assignment (assignedBy, assignedAt, status)
  location: Location;
  log: LogEntry[];
  emergencyServices: EmergencyServices;
  mediaInvolvement: MediaInvolvement;
  propertyDamage: PropertyDamage;
  vehiclesInvolved: VehicleInvolved[];
  personalInjuries: PersonalInjury[];
  personsInvolved: PersonInvolved[];
  cctvBwc: CCTVBWC[];
  attachments?: Attachment[];
  summary: string;
  completionRemarks: string;
  slaveIncidents: SlaveIncident[];
  isDuplicate?: boolean;
  masterIncidentId?: string;
  version?: number;
  // Lifecycle timestamps set by action-oriented API handlers
  acknowledgedAt?: string;
  onSiteAt?: string;
  completedAt?: string;
  closedAt?: string;
  closedBy?: string;
  closureRemarks?: string;
}


export interface Fault {
  id: string; // SEN/FR/YYYYMMDD/NNN
  caseId: string;
  faultType: string;
  faultSubType: string;
  location: Location;
  description: string;
  attachments: string[];
  status: string; // "Created" | "Submitted" | "In Progress" | "Pending Vendor" | "Resolved" | "Closed"
  cmmsTicketId?: string;
  createdBy: string;
  createdAt: string;
  submittedAt?: string;
  resolvedAt?: string;
  closedBy?: string;
  closedAt?: string;
  linkedIncidentId?: string;
}

export interface TaskChecklistItem {
  id: string;
  text: string;
  isCompleted: boolean;
}

export interface TaskComment {
  id: string;
  user: string;
  timestamp: string;
  text: string;
}

export interface TaskAudit {
  id: string;
  timestamp: string;
  operator: string;
  action: string;
  details: string;
}

export interface Task {
  id: string; // TASK-XXX
  caseId: string;
  title: string;
  description: string;
  assignee: string; // User or Group
  priority: string; // "Normal" | "High"
  dueDate: string;
  status: string; // Created, Assigned, Acknowledged, In Progress, Pending Further Action, Closed
  closeReason?: string;
  checklist?: TaskChecklistItem[];
  comments?: TaskComment[];
  audits?: TaskAudit[];
  recurrenceSchedule?: string;
  attachments: string[];
  createdBy: string;
  createdDate: string;
}

export interface Occurrence {
  id: string; // OCC-YYYY-NNNN or SEN/ED/YYYYMMDD/NNN
  caseId: string; // Linkage to Case
  user: string;
  dateTime: string;
  topic: string;
  content: string;
  attachments?: string[];
  amendments?: { timestamp: string; amendedBy: string; originalText: string }[];
}

export interface EventRecord {
  id: string; // EVT-YYYY-NNNN
  name: string;
  startDateTime: string;
  endDateTime: string;
  location: string;
  boundaryCoordinates?: { lat: number; lng: number }[];
  type: string;
  description: string;
  createdBy: string;
  createdAt: string;
}

export interface NOPRecord {
  id: string; // NOP-YYYY-NNNN
  applicantName: string;
  companyName: string;
  workDescription: string;
  startDateTime: string;
  endDateTime: string;
  status: string; // Draft, Pending Review, Approved, Active, Expired, Closed
  boundaryCoordinates: { lat: number; lng: number }[];
  documents: { name: string; type: string; fileUrl: string }[];
}

export interface BroadcastRecord {
  id: string; // [Case ID]-BC[3-digit sequence]
  caseId: string;
  incidentId: string;
  type: string; // "Closure" | "End-of-Day"
  recipients: string[];
  templateUsed: string;
  contentDispatched: string;
  sentAt: string;
  sentBy: string;
  status: string; // "SENT" | "FAILED"
  deliveryAttempts: number;
  lastErrorMessage?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  module: string;
  details: string;
  beforeSnapshot?: string; // JSON snapshot
  afterSnapshot?: string; // JSON snapshot
  correlationId: string;
  ipAddress?: string;
}

// Hydrated Case interface used by Next.js endpoints
export interface Case {
  id: string; // SEN/CI/YYYYMMDD/NNN
  title: string;
  status: string; // Pending Triage, Active, No Action Required, Closed
  createdAt: string;
  createdBy: string;
  closedAt: string | null;
  closedBy: string | null;
  cmmsTickets: string[]; // Dynamically joined from faults table
  incident: Incident | null; // Dynamically joined from incidents table
  linkedIncidentId?: string;
}

// The database schema physically stored on disk (db.json)
export interface NormalizedDbSchema {
  cases: Omit<Case, 'cmmsTickets' | 'incident'>[];
  incidents: Incident[];
  faults: Fault[];
  tasks: Task[];
  occurrences: Occurrence[];
  events: EventRecord[];
  nops: NOPRecord[];
  broadcasts: BroadcastRecord[];
  auditLogs: AuditLog[];
}

// The hydrated schema used by the application
export interface DbSchema {
  cases: Case[];
  tasks: Task[];
  occurrences: Occurrence[];
  faults?: Fault[]; // Optional, added for module compatibility
  events?: EventRecord[];
  nops?: NOPRecord[];
  broadcasts?: BroadcastRecord[];
  auditLogs?: AuditLog[];
}

const DB_PATH = path.join(process.cwd(), 'src', 'lib', 'db.json');

// Helper to check if file exists, read, and run migration/hydration on-the-fly
export function getDb(): DbSchema {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return { cases: [], tasks: [], occurrences: [] };
    }
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw);

    // MIGRATION BLOCK: If read JSON has old nested/flat layout, migrate to fully normalized storage
    let normalizedDb: NormalizedDbSchema;
    
    if (parsed.cases && parsed.cases.length > 0 && ('incident' in parsed.cases[0] || 'cmmsTickets' in parsed.cases[0])) {
      console.log('Migrating legacy nested db.json to normalized relational schema...');
      normalizedDb = {
        cases: [],
        incidents: [],
        faults: [],
        tasks: parsed.tasks || [],
        occurrences: [],
        events: parsed.events || [],
        nops: parsed.nops || [],
        broadcasts: parsed.broadcasts || [],
        auditLogs: parsed.auditLogs || []
      };

      // Extract incidents and faults from legacy cases
      for (const c of parsed.cases) {
        const { incident, cmmsTickets, ...caseMeta } = c;
        
        // Save case metadata
        normalizedDb.cases.push({
          id: caseMeta.id,
          title: caseMeta.title,
          status: caseMeta.status || 'Active',
          createdAt: caseMeta.createdAt || new Date().toISOString(),
          createdBy: caseMeta.createdBy || 'system',
          closedAt: caseMeta.closedAt || null,
          closedBy: caseMeta.closedBy || null
        });

        // Extract and format nested Incident
        if (incident) {
          const incidentId = incident.id || `SEN/IR/${incident.dateTime?.split('T')[0].replace(/-/g, '') || new Date().toISOString().split('T')[0].replace(/-/g, '')}/${String(normalizedDb.incidents.length + 1).padStart(4, '0')}`;
          normalizedDb.incidents.push({
            id: incidentId,
            caseId: caseMeta.id,
            title: incident.title || caseMeta.title,
            dateTime: incident.dateTime || new Date().toISOString(),
            type: incident.type || 'Others',
            subType: incident.subType || 'Others',
            priority: incident.priority || 'Normal',
            crisisLevel: incident.crisisLevel || 4,
            reporterName: incident.reporterName || 'Unknown',
            requestedBy: incident.requestedBy || 'IIOC Controller',
            createdBy: incident.createdBy || 'system',
            category: incident.category || 'Standard Incident',
            status: incident.status || 'Live',
            assignedTo: incident.assignedTo || '',
            location: incident.location || {
              road: '', building: '', levelSpace: '', nearAt: '', commonName: '', postalCode: '000000', tags: [], lat: 1.25, lng: 103.83
            },
            log: incident.log || [],
            emergencyServices: incident.emergencyServices || {
              policeAtScene: false, officerNameRank: '', policeIncidentNo: '', classification: '', respondingUnit: '',
              ambulanceScdfType: '', ambulanceOfficerName: '', ambulanceCallSign: '', ambulanceRespondingUnit: '', ambulanceArrivalTime: '', hospitalConveyedTo: ''
            },
            mediaInvolvement: incident.mediaInvolvement || { mediaAtScene: false, mediaName: '', commsNotified: false },
            propertyDamage: incident.propertyDamage || { sdcPropertyDamaged: false, description: '' },
            vehiclesInvolved: incident.vehiclesInvolved || [],
            personalInjuries: incident.personalInjuries || [],
            personsInvolved: incident.personsInvolved || [],
            cctvBwc: incident.cctvBwc || [],
            summary: incident.summary || '',
            completionRemarks: incident.completionRemarks || '',
            slaveIncidents: incident.slaveIncidents || [],
            attachments: incident.attachments || []
          });
        }

        // Extract and format faults
        if (cmmsTickets && cmmsTickets.length > 0) {
          cmmsTickets.forEach((tId: string, idx: number) => {
            const faultId = `SEN/FR/${caseMeta.createdAt?.split('T')[0].replace(/-/g, '') || new Date().toISOString().split('T')[0].replace(/-/g, '')}/${String(normalizedDb.faults.length + 1).padStart(3, '0')}`;
            normalizedDb.faults.push({
              id: faultId,
              caseId: caseMeta.id,
              faultType: incident?.type || 'Facilities',
              faultSubType: incident?.subType || 'Others',
              location: incident?.location || {
                road: '', building: '', levelSpace: '', nearAt: '', commonName: '', postalCode: '000000', tags: [], lat: 1.25, lng: 103.83
              },
              description: incident?.summary || caseMeta.title,
              attachments: [],
              status: 'Closed', // Prototype auto-closed
              cmmsTicketId: tId,
              createdBy: 'system',
              createdAt: caseMeta.createdAt || new Date().toISOString(),
              submittedAt: caseMeta.createdAt || new Date().toISOString()
            });
          });
        }
      }

      // Map occurrences (e-Diary) flat list. Link to legacy cases if possible, otherwise create dummy cases
      if (parsed.occurrences) {
        for (const o of parsed.occurrences) {
          let linkedCaseId = o.caseId;
          if (!linkedCaseId) {
            // Auto-create dummy Case for legacy occurrences
            linkedCaseId = `SEN/CI/${o.dateTime?.split('T')[0].replace(/-/g, '') || new Date().toISOString().split('T')[0].replace(/-/g, '')}/${String(normalizedDb.cases.length + 1).padStart(3, '0')}`;
            normalizedDb.cases.push({
              id: linkedCaseId,
              title: `e-Diary: ${o.topic}`,
              status: 'No Action Required',
              createdAt: o.dateTime || new Date().toISOString(),
              createdBy: o.user || 'system',
              closedAt: o.dateTime || new Date().toISOString(),
              closedBy: o.user || 'system'
            });
          }
          normalizedDb.occurrences.push({
            id: o.id,
            caseId: linkedCaseId,
            user: o.user,
            dateTime: o.dateTime,
            topic: o.topic,
            content: o.content
          });
        }
      }

      // Save legacy migrated database back to disk immediately
      fs.writeFileSync(DB_PATH, JSON.stringify(normalizedDb, null, 2), 'utf-8');
      console.log('Legacy db.json successfully normalized and written back to disk.');
    } else {
      // It is already normalized structure
      normalizedDb = {
        cases: parsed.cases || [],
        incidents: parsed.incidents || [],
        faults: parsed.faults || [],
        tasks: parsed.tasks || [],
        occurrences: parsed.occurrences || [],
        events: parsed.events || [],
        nops: parsed.nops || [],
        broadcasts: parsed.broadcasts || [],
        auditLogs: parsed.auditLogs || []
      };
    }

    // Ensure all incidents follow strict FRD status and category taxonomy
    if (normalizedDb.incidents) {
      normalizedDb.incidents = normalizedDb.incidents.map(inc => {
        // Migrate legacy assignedTo string/array to responders metadata if empty/missing
        const legacyResponders = inc.responders || [];
        let finalResponders = legacyResponders;
        if (legacyResponders.length === 0) {
          let legacyAssigned: string[] = [];
          if (typeof inc.assignedTo === 'string') {
            legacyAssigned = inc.assignedTo ? [inc.assignedTo] : [];
          } else if (Array.isArray(inc.assignedTo)) {
            legacyAssigned = inc.assignedTo;
          }
          finalResponders = legacyAssigned.map(r => ({
            responderId: r,
            assignedBy: inc.createdBy || 'System',
            assignedAt: inc.dateTime || new Date().toISOString(),
            status: 'Active' as const
          }));
        }

        // Derive assignedTo dynamically from active responders (single source of truth)
        const derivedAssignedTo = finalResponders
          .filter(r => r.status === 'Active')
          .map(r => r.responderId);

        let mappedStatus = inc.status || 'Live';
        if (mappedStatus === 'Live Acknowledged') mappedStatus = 'Live (Acknowledged)';
        else if (mappedStatus === 'Live On-Site') mappedStatus = 'Live (On-Site)';
        else if (mappedStatus === 'Live Completed') mappedStatus = 'Live (Completed)';
        else if (mappedStatus === 'Pending Review') mappedStatus = 'Pending Endorsement';

        // Set Live (Assigned) if there are assignees but status is still Live
        if (mappedStatus === 'Live' && derivedAssignedTo.length > 0) {
          mappedStatus = 'Live (Assigned)';
        }

        const mappedCategory = inc.category || 'Standard Incident';

        return {
          ...inc,
          status: mappedStatus,
          category: mappedCategory,
          attachments: inc.attachments || [],
          responders: finalResponders,
          assignedTo: derivedAssignedTo
        };
      });
    }

    // HYDRATION LOGIC: Join normalized tables into the legacy nested models returned to the app
    const hydratedCases: Case[] = normalizedDb.cases.map(c => {
      const caseIncident = normalizedDb.incidents.find(i => i.caseId === c.id) || null;
      
      const caseFaults = normalizedDb.faults.filter(f => f.caseId === c.id);
      const cmmsTickets = caseFaults
        .map(f => f.cmmsTicketId)
        .filter((tId): tId is string => !!tId);

      return {
        ...c,
        cmmsTickets,
        incident: caseIncident
      };
    });

    return {
      cases: hydratedCases,
      tasks: normalizedDb.tasks,
      occurrences: normalizedDb.occurrences,
      faults: normalizedDb.faults,
      events: normalizedDb.events,
      nops: normalizedDb.nops,
      broadcasts: normalizedDb.broadcasts,
      auditLogs: normalizedDb.auditLogs
    };
  } catch (err) {
    console.error('Error reading database file:', err);
    return { cases: [], tasks: [], occurrences: [] };
  }
}

// Helper to write database, converting hydrated view structures back to normalized files
export function saveDb(data: DbSchema): void {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // DE-HYDRATION LOGIC: Split the nested structures into flat normalized database tables
    const normalizedDb: NormalizedDbSchema = {
      cases: [],
      incidents: [],
      faults: data.faults || [],
      tasks: data.tasks,
      occurrences: data.occurrences,
      events: data.events || [],
      nops: data.nops || [],
      broadcasts: data.broadcasts || [],
      auditLogs: data.auditLogs || []
    };

    for (const c of data.cases) {
      const { incident, cmmsTickets, ...caseMeta } = c;
      
      // Save Case metadata table row
      normalizedDb.cases.push({
        id: caseMeta.id,
        title: caseMeta.title,
        status: caseMeta.status as any,
        createdAt: caseMeta.createdAt,
        createdBy: caseMeta.createdBy || 'system',
        closedAt: caseMeta.closedAt,
        closedBy: caseMeta.closedBy
      });

      // Save Incident table row
      if (incident) {
        // Double check incident has correct ID
        if (!incident.id) {
          incident.id = `SEN/IR/${incident.dateTime?.split('T')[0].replace(/-/g, '') || new Date().toISOString().split('T')[0].replace(/-/g, '')}/${String(normalizedDb.incidents.length + 1).padStart(4, '0')}`;
        }
        // Strip assignedTo to avoid duplicate storage on disk, since it is dynamically derived on load
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { assignedTo, ...incidentMeta } = incident;
        normalizedDb.incidents.push({
          ...(incidentMeta as any),
          caseId: caseMeta.id
        });
      }

      // Save/Merge CMMS tickets into faults table
      if (cmmsTickets && cmmsTickets.length > 0) {
        cmmsTickets.forEach(ticketId => {
          // Check if fault row already exists
          const existingFault = normalizedDb.faults.find(f => f.cmmsTicketId === ticketId);
          if (!existingFault) {
            const faultId = `SEN/FR/${caseMeta.createdAt?.split('T')[0].replace(/-/g, '') || new Date().toISOString().split('T')[0].replace(/-/g, '')}/${String(normalizedDb.faults.length + 1).padStart(3, '0')}`;
            normalizedDb.faults.push({
              id: faultId,
              caseId: caseMeta.id,
              faultType: incident?.type || 'Facilities',
              faultSubType: incident?.subType || 'Others',
              location: incident?.location || {
                road: '', building: '', levelSpace: '', nearAt: '', commonName: '', postalCode: '000000', tags: [], lat: 1.25, lng: 103.83
              },
              description: incident?.summary || caseMeta.title,
              attachments: [],
              status: 'Closed',
              cmmsTicketId: ticketId,
              createdBy: caseMeta.createdBy || 'system',
              createdAt: caseMeta.createdAt || new Date().toISOString(),
              submittedAt: new Date().toISOString()
            });
          }
        });
      }
    }

    fs.writeFileSync(DB_PATH, JSON.stringify(normalizedDb, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing to database file:', err);
  }
}

// Generate Case ID following the SEN/CI/YYYYMMDD/NNN format (FRD v0.2)
export function generateCaseId(db: DbSchema): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const prefix = `SEN/CI/${year}${month}${day}/`;
  
  // Count cases created today
  const todayCases = db.cases.filter(c => c.id.startsWith(prefix));
  
  let nextSeq = 1;
  if (todayCases.length > 0) {
    const sequences = todayCases.map(c => {
      const parts = c.id.split('/');
      const seqStr = parts[parts.length - 1];
      return parseInt(seqStr, 10);
    }).filter(num => !isNaN(num));
    
    if (sequences.length > 0) {
      nextSeq = Math.max(...sequences) + 1;
    }
  }
  
  const seqStr = String(nextSeq).padStart(3, '0');
  return `${prefix}${seqStr}`;
}

// Generate Incident ID following the SEN/IR/YYYYMMDD/NNNN format (FSD)
export function generateIncidentId(db: DbSchema): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const prefix = `SEN/IR/${year}${month}${day}/`;
  
  const todayIncidents = db.cases
    .map(c => c.incident)
    .filter((inc): inc is Incident => !!inc && inc.id.startsWith(prefix));

  let nextSeq = 1;
  if (todayIncidents.length > 0) {
    const sequences = todayIncidents.map(inc => {
      const parts = inc.id.split('/');
      const seqStr = parts[parts.length - 1];
      return parseInt(seqStr, 10);
    }).filter(num => !isNaN(num));
    
    if (sequences.length > 0) {
      nextSeq = Math.max(...sequences) + 1;
    }
  }
  
  const seqStr = String(nextSeq).padStart(4, '0');
  return `${prefix}${seqStr}`;
}

// Generate Task ID following TASK-XXX format
export function generateTaskId(db: DbSchema): string {
  let nextSeq = 1;
  if (db.tasks.length > 0) {
    const sequences = db.tasks.map(t => {
      const parts = t.id.split('-');
      return parseInt(parts[1], 10);
    }).filter(num => !isNaN(num));
    
    if (sequences.length > 0) {
      nextSeq = Math.max(...sequences) + 1;
    }
  }
  return `TASK-${String(nextSeq).padStart(3, '0')}`;
}

// Generate e-Diary/Occurrence ID following SEN/ED/YYYYMMDD/NNN format
export function generateOccurrenceId(db: DbSchema): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const prefix = `SEN/ED/${year}${month}${day}/`;
  
  const todayOccs = db.occurrences.filter(o => o.id.startsWith(prefix));
  
  let nextSeq = 1;
  if (todayOccs.length > 0) {
    const sequences = todayOccs.map(o => {
      const parts = o.id.split('/');
      const seqStr = parts[parts.length - 1];
      return parseInt(seqStr, 10);
    }).filter(num => !isNaN(num));
    
    if (sequences.length > 0) {
      nextSeq = Math.max(...sequences) + 1;
    }
  }
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}
