import fs from 'fs';
import path from 'path';
import { Db } from 'mongodb';
import clientPromise from './mongodb';
import { normalizeIncidentCategory } from './incidentCategory';

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
  caseId?: string; // SEN/CI/YYYYMMDD/NNN
  title: string;
  dateTime: string;
  reporterName: string;
  summary: string;
  status: string; // Open, Closed
}

// Responder-level lifecycle status (per assignment), tracked independently and in
// parallel for every Responder on an Incident. Split out from Incident.status per the
// Incident/Responder Status Model Design decision (see Incident_Status_Model_Design_Updated.docx).
export type ResponderLifecycleStatus =
  | 'Assigned'
  | 'Acknowledged'
  | 'On-Site'
  | 'Pending Controller Review'
  | 'Live (Incomplete)'
  | 'Completed';

export interface IncidentResponder {
  responderId: string;   // Display name, e.g. "Ranger John"
  assignedBy: string;    // Username of Controller who made the assignment
  assignedAt: string;    // ISO datetime of assignment
  status: 'Active' | 'Removed'; // 'Removed' when explicitly unassigned
  lifecycleStatus: ResponderLifecycleStatus; // Per-Responder workflow status (parallel to other Responders)
  acknowledgedAt?: string;
  onSiteAt?: string;
  pendingReviewAt?: string;
  completedAt?: string;
  completionRemarks?: string; // Set when Controller returns this specific Responder (per-Responder remark)
  returnedAt?: string;
  returnedBy?: string;
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
  reportingSource?: string; // FSD §5.4.4 — channel of the report (e.g. "Public Phone", "VA", "State Agency")
  createdBy: string;
  category: string; // FSD v0.5 §5.1.2 — "Operational Incident" | "Backdated Incident" | "Informational / Exercise Records".
                     // Legacy v0.4 values ("Standard/Proactive/Ongoing Incident", "Operational Record") are normalized
                     // onto these 3 by normalizeIncidentCategory() in hydrateDb() below — see src/lib/incidentCategory.ts.
  status: string; // Incident-level (Controller-driven): "Live" | "Live (Assigned)" | "Pending Endorsement" | "Returned" | "Closed"
                   // NOTE: "Live (Acknowledged)" / "Live (On-Site)" / "Live (Pending Controller Review)" / "Live (Incomplete)" / "Live (Completed)"
                   // used to live here but now live on IncidentResponder.lifecycleStatus (per-Responder, parallel). See hydrateDb() for legacy migration.
  assignedTo: string[]; // Array of responder display names
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
  linkedEDiaryIds?: string[];         // FSD §5.3.1 — e-Diary entries linked to this incident
  closureBroadcastStatus?: 'not_required' | 'pending' | 'dispatched'; // FSD §5.3.11
  closureBroadcastId?: string;        // FSD §5.3.11 — linked Broadcast ID once dispatched
  isFalseAlarm?: boolean;
  isDuplicate?: boolean;
  masterIncidentId?: string;
  version?: number;
  editingBy?: string;                 // FSD §5.7.2 — concurrent editing lock
  editingStartedAt?: string;          // FSD §5.7.2
  crisisReminderDue?: string;         // FSD §5.2 — ISO timestamp when 45-min reminder fires
  crisisReminderFired?: boolean;      // FSD §5.2 — prevent duplicate reminders
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
  status: string; // "Pending Submission" | "Closed"
  cmmsTicketId?: string;
  createdBy: string;
  createdAt: string;
  submittedAt?: string;
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
  images?: string[];
}

export interface TaskAudit {
  id: string;
  timestamp: string;
  operator: string;
  action: string;
  details: string;
}

// Canonical Task statuses per FRD Section 7.3.2
export type TaskStatus =
  | 'Created'
  | 'Assigned'
  | 'Acknowledged'
  | 'In Progress'
  | 'Pending Further Action'
  | 'Pending Closure'
  | 'Returned'
  | 'Closed';

// ── Recurrence (FRD 7.1.2 + Shin Feng clarifications) ──
export type RecurrenceFrequency = 'Daily' | 'Weekly' | 'Monthly';
export type RecurrenceEndType = 'never' | 'onDate' | 'afterCount';
export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

// Config captured in the Create Task form. Persisted as the series template.
export interface RecurrenceConfig {
  frequency: RecurrenceFrequency;
  weekdays?: Weekday[];        // required when frequency = 'Weekly'
  monthlyDay?: number;         // 1..31; clamps to last day of shorter months
  startDate: string;           // YYYY-MM-DD anchor
  dueTime?: string;            // HH:mm applied to each occurrence
  endType: RecurrenceEndType;
  endDate?: string;            // when endType = 'onDate'
  occurrenceCount?: number;    // when endType = 'afterCount'
  leadTimeDays: number;        // generate-ahead window (default 14)
}

// The recurrence template as a first-class entity (Model A source of truth).
// Occurrences link back via Task.seriesId; the config here is what the
// generation engine reads. Editing a series reconciles its future occurrences.
export interface RecurrenceSeries {
  id: string;                       // SEN/RS/YYYYMMDD/NNN
  caseId: string;                   // Case the series (and its occurrences) belong to
  config: RecurrenceConfig;         // current template
  status: 'Active' | 'Ended' | 'Cancelled';
  templateTaskId?: string;          // the task that created the series (holds the card)
  createdBy: string;
  createdDate: string;
  lastGeneratedDate?: string;       // last date the lead-window was advanced to (idempotency)
  audits?: TaskAudit[];             // history of template edits
  // Snapshot used to mint each occurrence task:
  taskTemplate: {
    title: string;
    description?: string;
    priority: 'High' | 'Normal';
    assignee: string;
    assigneeType?: 'user' | 'group';
    checklist?: TaskChecklistItem[];
  };
}

export interface Task {
  id: string; // SEN/TA/YYYYMMDD/NNN
  caseId: string;
  linkedIncidentId?: string; // Optional: incident this task runs alongside
  title: string;
  description: string;
  assignee: string; // User name or Group name
  assigneeType?: 'user' | 'group'; // FRD 7.2 — individual or pre-configured group
  priority: string; // "Normal" | "High"
  dueDate: string;
  status: string; // TaskStatus — Created, Assigned, Acknowledged, In Progress, Pending Further Action, Pending Closure, Closed
  closeReason?: string; // Mandatory when closed without Assignee completion (FRD 7.3)
  completed?: boolean; // True when Assignee marked complete (vs. Controller drop)
  checklist?: TaskChecklistItem[];
  comments?: TaskComment[];
  audits?: TaskAudit[];
  recurrenceSchedule?: string; // Human-readable summary of the recurrence rule
  recurrence?: RecurrenceConfig; // Structured recurrence template (FRD 7.1.2)
  seriesId?: string; // Link back to RecurrenceSeries when this is a generated occurrence
  isSeriesTemplate?: boolean; // True for the task that created/holds the series template
  occurrenceDate?: string; // The date this occurrence belongs to within its series (YYYY-MM-DD)
  isRecurringInstance?: boolean;
  detachedFromSeries?: boolean; // W11 — edited "this occurrence only"
  recurrenceCancelled?: boolean; // W12 — series cancelled ("this + all future")
  deleted?: boolean; // Soft-delete (e.g. occurrence removed by a series edit); hidden from boards
  deletedAt?: string;
  deletedBy?: string;
  deletedReason?: string;
  attachments: string[];
  createdBy: string;
  createdDate: string;
  acknowledgedAt?: string;
  startedAt?: string;
  completedAt?: string; // When the Assignee marked complete (entered Pending Closure)
  completedBy?: string; // Assignee who marked complete → moved task to Pending Closure (FRD 7, Fig 7-1)
  closedAt?: string;
  closedBy?: string;
  reviewNote?: string; // Controller's note when accepting/rejecting a completion at Pending Closure
}

export interface Occurrence {
  id: string; // SEN/ED/YYYYMMDD/NNN
  caseId?: string;
  user: string;
  dateTime: string;
  topic: string;
  content: string;
  attachments?: string[];
}

export interface EventRecord {
  id: string; // EVT-YYYY-NNNN
  name: string;
  startDateTime: string;
  endDateTime: string;
  location: Location;                                    // FRD §8.2(a) — location-hierarchy reference, not free text
  boundaryCoordinates?: { lat: number; lng: number }[];   // FRD §8.2(c) — optional drawn boundary polygon on 2D map
  type: string;                                           // Event Type — from Event taxonomy (§8.1.2)
  description?: string;
  sourceEDiaryId?: string;                                // FRD §8.1.1(c) / §9.1.3(c) — reference to source e-Diary entry
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
  taskCount?: number;
  occurrenceCount?: number;
  faultCount?: number;
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
  recurrenceSeries?: RecurrenceSeries[];
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
  recurrenceSeries?: RecurrenceSeries[];
}

// Path to db.json — used only for one-time seeding when MongoDB is empty
const DB_PATH = path.join(process.cwd(), 'src', 'lib', 'db.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Incident/Responder Status Split migration (see Incident_Status_Model_Design_Updated.docx):
// old data only had ONE shared status per Incident. We derive a per-Responder
// lifecycleStatus from that legacy value (best-effort — the old data has no way to know
// what each individual Responder's true progress was), and collapse the Incident-level
// status down to the new 5-value set. This is an approximation for pre-existing records;
// new records will get proper per-Responder progress going forward.
function legacyStatusToResponderLifecycle(legacyStatus: string): ResponderLifecycleStatus {
  switch (legacyStatus) {
    case 'Live':
    case 'Live (Assigned)':
      return 'Assigned';
    case 'Live (Acknowledged)':
      return 'Acknowledged';
    case 'Live (On-Site)':
      return 'On-Site';
    case 'Live (Pending Controller Review)':
      return 'Pending Controller Review';
    case 'Live (Incomplete)':
      return 'Live (Incomplete)';
    case 'Live (Completed)':
    case 'Pending Endorsement':
    case 'Returned':
    case 'Closed':
      return 'Completed';
    default:
      return 'Assigned';
  }
}

function legacyStatusToIncidentStatus(legacyStatus: string): string {
  switch (legacyStatus) {
    case 'Live':
      return 'Live';
    case 'Live (Assigned)':
    case 'Live (Acknowledged)':
    case 'Live (On-Site)':
    case 'Live (Pending Controller Review)':
    case 'Live (Incomplete)':
    case 'Live (Completed)':
      return 'Live (Assigned)';
    case 'Pending Endorsement':
      return 'Pending Endorsement';
    case 'Returned':
      return 'Returned';
    case 'Closed':
      return 'Closed';
    default:
      return legacyStatus;
  }
}

function hydrateDb(normalizedDb: NormalizedDbSchema): DbSchema {
  // Ensure all incidents follow strict FRD status and category taxonomy
  const normalizedIncidents = normalizedDb.incidents.map(inc => {
    // Normalize legacy status typos/aliases before deriving anything from it
    let legacyStatus = inc.status || 'Live';
    if (legacyStatus === 'Live Acknowledged') legacyStatus = 'Live (Acknowledged)';
    else if (legacyStatus === 'Live On-Site') legacyStatus = 'Live (On-Site)';
    else if (legacyStatus === 'Live Completed') legacyStatus = 'Live (Completed)';
    else if (legacyStatus === 'Pending Review') legacyStatus = 'Pending Endorsement';
    else if (legacyStatus === 'Live (Returned to Responder)') legacyStatus = 'Live (Incomplete)';

    const derivedLifecycleStatus = legacyStatusToResponderLifecycle(legacyStatus);

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
        status: 'Active' as const,
        lifecycleStatus: derivedLifecycleStatus
      }));
    } else {
      // Backfill lifecycleStatus on responders created before the status split existed
      finalResponders = legacyResponders.map(r => (
        r.lifecycleStatus ? r : { ...r, lifecycleStatus: derivedLifecycleStatus }
      ));
    }

    const derivedAssignedTo = finalResponders
      .filter(r => r.status === 'Active')
      .map(r => r.responderId);

    const mappedStatus = legacyStatusToIncidentStatus(legacyStatus);

    return {
      ...inc,
      status: mappedStatus,
      category: normalizeIncidentCategory(inc.category),
      attachments: inc.attachments || [],
      responders: finalResponders,
      assignedTo: derivedAssignedTo
    };
  });

  const hydratedCases: Case[] = normalizedDb.cases.map(c => {
    const caseIncident = normalizedIncidents.find(i => i.caseId === c.id) || null;
    const caseFaults = normalizedDb.faults.filter(f => f.caseId === c.id);
    const cmmsTickets = caseFaults
      .map(f => f.cmmsTicketId)
      .filter((tId): tId is string => !!tId);

    return { ...c, cmmsTickets, incident: caseIncident };
  });

  return {
    cases: hydratedCases,
    tasks: normalizedDb.tasks.map(normalizeTaskStatus),
    occurrences: normalizedDb.occurrences,
    faults: normalizedDb.faults,
    events: normalizedDb.events,
    nops: normalizedDb.nops,
    broadcasts: normalizedDb.broadcasts,
    auditLogs: normalizedDb.auditLogs,
    recurrenceSeries: normalizedDb.recurrenceSeries || []
  };
}

// Map legacy task statuses to the canonical FRD 7.3.2 set so the whole
// system (board columns, badges, action gating) stays consistent.
function normalizeTaskStatus(t: Task): Task {
  const map: Record<string, string> = {
    'Re-Assigned': 'Assigned',
    'Reassigned': 'Assigned',
    'Pending': 'Pending Further Action',
    'Further Action': 'Pending Further Action',
    'Acknowledged / In Progress': 'In Progress',
  };
  const status = map[t.status] || t.status;
  if (status === t.status) return t;
  return { ...t, status };
}

function dehydrateDb(data: DbSchema): NormalizedDbSchema {
  const normalizedDb: NormalizedDbSchema = {
    cases: [],
    incidents: [],
    faults: data.faults || [],
    tasks: data.tasks,
    occurrences: data.occurrences,
    events: data.events || [],
    nops: data.nops || [],
    broadcasts: data.broadcasts || [],
    auditLogs: data.auditLogs || [],
    recurrenceSeries: data.recurrenceSeries || []
  };

  for (const c of data.cases) {
    const { incident, cmmsTickets, ...caseMeta } = c;

    normalizedDb.cases.push({
      id: caseMeta.id,
      title: caseMeta.title,
      status: caseMeta.status as any,
      createdAt: caseMeta.createdAt,
      createdBy: caseMeta.createdBy || 'system',
      closedAt: caseMeta.closedAt,
      closedBy: caseMeta.closedBy
    });

    if (incident) {
      if (!incident.id) {
        incident.id = `SEN/IR/${incident.dateTime?.split('T')[0].replace(/-/g, '') || new Date().toISOString().split('T')[0].replace(/-/g, '')}/${String(normalizedDb.incidents.length + 1).padStart(4, '0')}`;
      }
      // Strip assignedTo — derived dynamically on load from responders
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { assignedTo, ...incidentMeta } = incident;
      normalizedDb.incidents.push({ ...(incidentMeta as any), caseId: caseMeta.id });
    }

    if (cmmsTickets && cmmsTickets.length > 0) {
      cmmsTickets.forEach(ticketId => {
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

  return normalizedDb;
}

async function getMongoDB(): Promise<Db> {
  const client = await clientPromise;
  return client.db('sentosa-cms');
}

async function saveCollection(mdb: Db, collectionName: string, docs: any[]): Promise<void> {
  const col = mdb.collection(collectionName);
  if (docs.length === 0) {
    await col.deleteMany({});
    return;
  }
  await col.bulkWrite(
    docs.map(doc => ({
      replaceOne: {
        filter: { id: doc.id },
        replacement: { ...doc },
        upsert: true
      }
    }))
  );
  const currentIds = docs.map(d => d.id);
  await col.deleteMany({ id: { $nin: currentIds } });
}

async function seedFromJson(mdb: Db): Promise<NormalizedDbSchema> {
  console.log('MongoDB empty — seeding from db.json...');
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  const parsed = JSON.parse(raw);

  let normalizedDb: NormalizedDbSchema;

  // Handle legacy nested format
  if (parsed.cases && parsed.cases.length > 0 && ('incident' in parsed.cases[0] || 'cmmsTickets' in parsed.cases[0])) {
    console.log('Migrating legacy nested db.json to normalized schema...');
    normalizedDb = {
      cases: [], incidents: [], faults: [],
      tasks: parsed.tasks || [], occurrences: [],
      events: parsed.events || [], nops: parsed.nops || [],
      broadcasts: parsed.broadcasts || [], auditLogs: parsed.auditLogs || []
    };

    for (const c of parsed.cases) {
      const { incident, cmmsTickets, ...caseMeta } = c;
      normalizedDb.cases.push({
        id: caseMeta.id, title: caseMeta.title,
        status: caseMeta.status || 'Active',
        createdAt: caseMeta.createdAt || new Date().toISOString(),
        createdBy: caseMeta.createdBy || 'system',
        closedAt: caseMeta.closedAt || null, closedBy: caseMeta.closedBy || null
      });
      if (incident) {
        normalizedDb.incidents.push({
          id: incident.id || `SEN/IR/${new Date().toISOString().split('T')[0].replace(/-/g, '')}/${String(normalizedDb.incidents.length + 1).padStart(4, '0')}`,
          caseId: caseMeta.id,
          ...incident
        });
      }
    }

    if (parsed.occurrences) {
      for (const o of parsed.occurrences) {
        normalizedDb.occurrences.push({ id: o.id, caseId: o.caseId || caseMeta_fallback(normalizedDb, o), ...o });
      }
    }
  } else {
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

  // Seed all collections in parallel
  await Promise.all([
    normalizedDb.cases.length > 0 ? mdb.collection('cases').insertMany(normalizedDb.cases as any[]) : Promise.resolve(),
    normalizedDb.incidents.length > 0 ? mdb.collection('incidents').insertMany(normalizedDb.incidents as any[]) : Promise.resolve(),
    normalizedDb.faults.length > 0 ? mdb.collection('faults').insertMany(normalizedDb.faults as any[]) : Promise.resolve(),
    normalizedDb.tasks.length > 0 ? mdb.collection('tasks').insertMany(normalizedDb.tasks as any[]) : Promise.resolve(),
    normalizedDb.occurrences.length > 0 ? mdb.collection('occurrences').insertMany(normalizedDb.occurrences as any[]) : Promise.resolve(),
    normalizedDb.events.length > 0 ? mdb.collection('events').insertMany(normalizedDb.events as any[]) : Promise.resolve(),
    normalizedDb.nops.length > 0 ? mdb.collection('nops').insertMany(normalizedDb.nops as any[]) : Promise.resolve(),
    normalizedDb.broadcasts.length > 0 ? mdb.collection('broadcasts').insertMany(normalizedDb.broadcasts as any[]) : Promise.resolve(),
    normalizedDb.auditLogs.length > 0 ? mdb.collection('auditLogs').insertMany(normalizedDb.auditLogs as any[]) : Promise.resolve(),
  ]);

  console.log(`Seeded: ${normalizedDb.cases.length} cases, ${normalizedDb.incidents.length} incidents, ${normalizedDb.tasks.length} tasks.`);
  return normalizedDb;
}

// Fallback caseId generator used during legacy migration
function caseMeta_fallback(db: NormalizedDbSchema, o: any): string {
  const dateStr = o.dateTime?.split('T')[0].replace(/-/g, '') || new Date().toISOString().split('T')[0].replace(/-/g, '');
  const newId = `SEN/CI/${dateStr}/${String(db.cases.length + 1).padStart(3, '0')}`;
  db.cases.push({
    id: newId, title: `e-Diary: ${o.topic}`,
    status: 'No Action Required',
    createdAt: o.dateTime || new Date().toISOString(),
    createdBy: o.user || 'system',
    closedAt: o.dateTime || new Date().toISOString(),
    closedBy: o.user || 'system'
  });
  return newId;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getDb(): Promise<DbSchema> {
  try {
    const mdb = await getMongoDB();

    const [cases, incidents, faults, tasks, occurrences, events, nops, broadcasts, auditLogs, recurrenceSeries] = await Promise.all([
      mdb.collection('cases').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('incidents').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('faults').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('tasks').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('occurrences').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('events').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('nops').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('broadcasts').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('auditLogs').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('recurrenceSeries').find({}, { projection: { _id: 0 } }).toArray(),
    ]);

    let normalizedDb: NormalizedDbSchema;

    // Seed from db.json on first run
    if (cases.length === 0 && fs.existsSync(DB_PATH)) {
      normalizedDb = await seedFromJson(mdb);
    } else {
      normalizedDb = {
        cases: cases as any,
        incidents: incidents as any,
        faults: faults as any,
        tasks: tasks as any,
        occurrences: occurrences as any,
        events: events as any,
        nops: nops as any,
        broadcasts: broadcasts as any,
        auditLogs: auditLogs as any,
        recurrenceSeries: recurrenceSeries as any,
      };
    }

    return hydrateDb(normalizedDb);
  } catch (err) {
    console.error('Error reading from MongoDB:', err);
    return { cases: [], tasks: [], occurrences: [] };
  }
}

export async function saveDb(data: DbSchema): Promise<void> {
  try {
    const mdb = await getMongoDB();
    const normalizedDb = dehydrateDb(data);

    await Promise.all([
      saveCollection(mdb, 'cases', normalizedDb.cases as any[]),
      saveCollection(mdb, 'incidents', normalizedDb.incidents as any[]),
      saveCollection(mdb, 'faults', normalizedDb.faults as any[]),
      saveCollection(mdb, 'tasks', normalizedDb.tasks as any[]),
      saveCollection(mdb, 'occurrences', normalizedDb.occurrences as any[]),
      saveCollection(mdb, 'events', normalizedDb.events as any[]),
      saveCollection(mdb, 'nops', normalizedDb.nops as any[]),
      saveCollection(mdb, 'broadcasts', normalizedDb.broadcasts as any[]),
      saveCollection(mdb, 'auditLogs', normalizedDb.auditLogs as any[]),
      saveCollection(mdb, 'recurrenceSeries', (normalizedDb.recurrenceSeries || []) as any[]),
    ]);
  } catch (err) {
    console.error('Error writing to MongoDB:', err);
    throw err;
  }
}

// ─── ID Generators ────────────────────────────────────────────────────────────

export function generateCaseId(db: DbSchema): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const prefix = `SEN/CI/${year}${month}${day}/`;

  const todayCases = db.cases.filter(c => c.id.startsWith(prefix));
  let nextSeq = 1;
  if (todayCases.length > 0) {
    const sequences = todayCases.map(c => {
      const parts = c.id.split('/');
      return parseInt(parts[parts.length - 1], 10);
    }).filter(num => !isNaN(num));
    if (sequences.length > 0) nextSeq = Math.max(...sequences) + 1;
  }
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

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
      return parseInt(parts[parts.length - 1], 10);
    }).filter(num => !isNaN(num));
    if (sequences.length > 0) nextSeq = Math.max(...sequences) + 1;
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

export function generateTaskId(db: DbSchema): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const prefix = `SEN/TA/${year}${month}${day}/`;

  const todayTasks = db.tasks.filter(t => t.id.startsWith(prefix));
  let nextSeq = 1;
  if (todayTasks.length > 0) {
    const sequences = todayTasks.map(t => {
      const parts = t.id.split('/');
      return parseInt(parts[parts.length - 1], 10);
    }).filter(num => !isNaN(num));
    if (sequences.length > 0) nextSeq = Math.max(...sequences) + 1;
  }
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

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
      return parseInt(parts[parts.length - 1], 10);
    }).filter(num => !isNaN(num));
    if (sequences.length > 0) nextSeq = Math.max(...sequences) + 1;
  }
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

export function generateFaultId(db: DbSchema): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const prefix = `SEN/FR/${year}${month}${day}/`;

  const todayFaults = (db.faults || []).filter(f => f.id.startsWith(prefix));
  let nextSeq = 1;
  if (todayFaults.length > 0) {
    const sequences = todayFaults.map(f => {
      const parts = f.id.split('/');
      return parseInt(parts[parts.length - 1], 10);
    }).filter(num => !isNaN(num));
    if (sequences.length > 0) nextSeq = Math.max(...sequences) + 1;
  }
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

export function generateEventId(db: DbSchema): string {
  const year = new Date().getFullYear();
  const prefix = `EVT-${year}-`;

  const yearEvents = (db.events || []).filter(e => e.id.startsWith(prefix));
  let nextSeq = 1;
  if (yearEvents.length > 0) {
    const sequences = yearEvents.map(e => parseInt(e.id.split('-')[2], 10)).filter(num => !isNaN(num));
    if (sequences.length > 0) nextSeq = Math.max(...sequences) + 1;
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

export function generateSeriesId(db: DbSchema): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const prefix = `SEN/RS/${year}${month}${day}/`;

  const todaySeries = (db.recurrenceSeries || []).filter(s => s.id.startsWith(prefix));
  let nextSeq = 1;
  if (todaySeries.length > 0) {
    const sequences = todaySeries.map(s => {
      const parts = s.id.split('/');
      return parseInt(parts[parts.length - 1], 10);
    }).filter(num => !isNaN(num));
    if (sequences.length > 0) nextSeq = Math.max(...sequences) + 1;
  }
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}
