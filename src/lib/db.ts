import fs from 'fs';
import path from 'path';

// Define types for Case, Incident, Task, Occurrence
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
}

export interface EmergencyServices {
  policeAtScene: boolean;
  officerNameRank: string;
  policeIncidentNo: string;
  classification: string;
  respondingUnit: string;
  ambulanceScdfType: string;
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
  under16: boolean;
  parentGuardianName?: string;
  parentGuardianContact?: string;
}

export interface PersonInvolved {
  guestOrNonGuest: string;
  type: string;
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

export interface SlaveIncident {
  id: string;
  title: string;
  dateTime: string;
  reporterName: string;
  summary: string;
  status: string; // Open, Closed
}

export interface Incident {
  caseId: string;
  title: string;
  dateTime: string;
  type: string;
  subType: string;
  priority: string;
  reporterName: string;
  requestedBy: string;
  createdBy: string;
  status: string; // Live, Live (Acknowledged), Live (On-Site), Live (Returned), Live (Completed), Pending Review, Returned, Closed
  assignedTo: string;
  location: Location;
  log: LogEntry[];
  emergencyServices: EmergencyServices;
  mediaInvolvement: MediaInvolvement;
  propertyDamage: PropertyDamage;
  vehiclesInvolved: VehicleInvolved[];
  personalInjuries: PersonalInjury[];
  personsInvolved: PersonInvolved[];
  cctvBwc: CCTVBWC[];
  summary: string;
  completionRemarks: string;
  slaveIncidents?: SlaveIncident[];
}

export interface Case {
  id: string; // YYYY/MM/NNNN
  title: string;
  status: string; // Pending Triage, Active, Closed
  createdAt: string;
  closedAt: string | null;
  cmmsTickets: string[];
  incident: Incident | null;
}

export interface Task {
  id: string; // TASK-XXX
  caseId: string;
  title: string;
  description: string;
  assignee: string;
  priority: string;
  dueDate: string;
  status: string; // Created, Re-Assigned, Acknowledged, In Progress, Pending, Closed
  createdBy: string;
  createdDate: string;
  attachments: string[];
}

export interface Occurrence {
  id: string; // OCC-YYYY-NNNN
  user: string;
  dateTime: string;
  topic: string;
  content: string;
}

export interface DbSchema {
  cases: Case[];
  tasks: Task[];
  occurrences: Occurrence[];
}

const DB_PATH = path.join(process.cwd(), 'src', 'lib', 'db.json');

// Helper to check if file exists and read it
export function getDb(): DbSchema {
  try {
    if (!fs.existsSync(DB_PATH)) {
      // Return empty database schema if file not found
      return { cases: [], tasks: [], occurrences: [] };
    }
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw) as DbSchema;
  } catch (err) {
    console.error('Error reading database file:', err);
    return { cases: [], tasks: [], occurrences: [] };
  }
}

// Helper to write database
export function saveDb(data: DbSchema): void {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing to database file:', err);
  }
}

// Generate Case ID following the YYYY/MM/NNNN format
export function generateCaseId(db: DbSchema): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `${year}/${month}/`;
  
  // Find all cases created in the current month
  const currentMonthCases = db.cases.filter(c => c.id.startsWith(prefix));
  
  let nextSeq = 1;
  if (currentMonthCases.length > 0) {
    // Extract sequence numbers and find the maximum
    const sequences = currentMonthCases.map(c => {
      const parts = c.id.split('/');
      const seqStr = parts[2];
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

// Generate Occurrence ID following OCC-YYYY-NNNN format
export function generateOccurrenceId(db: DbSchema): string {
  const year = new Date().getFullYear();
  const prefix = `OCC-${year}-`;
  
  const yearOccs = db.occurrences.filter(o => o.id.startsWith(prefix));
  
  let nextSeq = 1;
  if (yearOccs.length > 0) {
    const sequences = yearOccs.map(o => {
      const parts = o.id.split('-');
      return parseInt(parts[2], 10);
    }).filter(num => !isNaN(num));
    
    if (sequences.length > 0) {
      nextSeq = Math.max(...sequences) + 1;
    }
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}
