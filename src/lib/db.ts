import fs from 'fs';
import path from 'path';
import { Db } from 'mongodb';
import clientPromise from './mongodb';

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
  status: string; // "Live" | "Live (Assigned)" | "Live (Acknowledged)" | "Live (On-Site)" | "Live (Completed)" | "Live (Incomplete)" | "Pending Endorsement" | "Returned" | "Closed"
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
  isFalseAlarm?: boolean;
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
  id: string; // SEN/ED/YYYYMMDD/NNN
  caseId?: string;
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

// Path to db.json — used only for one-time seeding when MongoDB is empty
const DB_PATH = path.join(process.cwd(), 'src', 'lib', 'db.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hydrateDb(normalizedDb: NormalizedDbSchema): DbSchema {
  // Ensure all incidents follow strict FRD status and category taxonomy
  const normalizedIncidents = normalizedDb.incidents.map(inc => {
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

    const derivedAssignedTo = finalResponders
      .filter(r => r.status === 'Active')
      .map(r => r.responderId);

    let mappedStatus = inc.status || 'Live';
    if (mappedStatus === 'Live Acknowledged') mappedStatus = 'Live (Acknowledged)';
    else if (mappedStatus === 'Live On-Site') mappedStatus = 'Live (On-Site)';
    else if (mappedStatus === 'Live Completed') mappedStatus = 'Live (Completed)';
    else if (mappedStatus === 'Pending Review') mappedStatus = 'Pending Endorsement';
    else if (mappedStatus === 'Live (Returned to Responder)') mappedStatus = 'Live (Incomplete)';

    return {
      ...inc,
      status: mappedStatus,
      category: inc.category || 'Standard Incident',
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
    tasks: normalizedDb.tasks,
    occurrences: normalizedDb.occurrences,
    faults: normalizedDb.faults,
    events: normalizedDb.events,
    nops: normalizedDb.nops,
    broadcasts: normalizedDb.broadcasts,
    auditLogs: normalizedDb.auditLogs
  };
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
    auditLogs: data.auditLogs || []
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

    const [cases, incidents, faults, tasks, occurrences, events, nops, broadcasts, auditLogs] = await Promise.all([
      mdb.collection('cases').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('incidents').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('faults').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('tasks').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('occurrences').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('events').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('nops').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('broadcasts').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('auditLogs').find({}, { projection: { _id: 0 } }).toArray(),
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
  let nextSeq = 1;
  if (db.tasks.length > 0) {
    const sequences = db.tasks.map(t => {
      const parts = t.id.split('-');
      return parseInt(parts[1], 10);
    }).filter(num => !isNaN(num));
    if (sequences.length > 0) nextSeq = Math.max(...sequences) + 1;
  }
  return `TASK-${String(nextSeq).padStart(3, '0')}`;
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
  const now = ne