import fs from 'fs';
import path from 'path';
import { Db } from 'mongodb';
import clientPromise from './mongodb';
import { normalizeIncidentCategory } from './incidentCategory';
import initialSeedData from './db.json';

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
  sourceEDiaryId?: string; // Set when created from an e-Diary entry via the combined Actions menu
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

// Task Priority Levels — kept in sync with the 'Priority' category in
// src/lib/taxonomy.ts (Admin > Taxonomy > Task Priority Levels). Server-side
// code can't read the browser's localStorage taxonomy overrides, so this is
// the canonical fallback list used to validate/normalize incoming priority
// values on task create/edit/recurrence endpoints.
export const TASK_PRIORITIES = ['Low', 'Normal', 'High', 'Critical'] as const;
export type TaskPriority = typeof TASK_PRIORITIES[number];

export function normalizeTaskPriority(value: unknown, fallback: TaskPriority = 'Normal'): TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value as string)
    ? (value as TaskPriority)
    : fallback;
}

// The recurrence template as a first-class entity (Model A source of truth).
// Occurrences link back via Task.seriesId; the config here is what the
// generation engine reads. Editing a series reconciles its future occurrences.
export interface RecurrenceSeries {
  id: string;                       // SEN/RS/YYYYMMDD/NNN
  caseId: string;                   // Case of the anchor/template task (holds the series card). Each generated occurrence gets its own separate Case — see seriesEngine.ts.
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
    priority: TaskPriority;
    assignee: string;
    assigneeType?: 'user' | 'group';
    assignees?: TaskAssignee[]; // preferred — assignee/assigneeType are the derived back-compat pair
    checklist?: TaskChecklistItem[];
  };
}

// Multi-assignee support (2026-07-27, per Kyle feedback on the Assignee field):
// a Task can be dispatched to any mix of individual users and pre-configured
// Task Distribution groups in one go. It stays ONE shared task — not cloned per
// person — and any assignee in the set (including any internal member of an
// assigned group) may Acknowledge/Begin/Comment/Mark Complete on behalf of the
// whole set; the audit trail records who specifically acted. `id` is the
// underlying user id (lib/users.ts) or Distribution Group id (lib/groups.ts).
export interface TaskAssignee {
  type: 'user' | 'group';
  id: string;
  name: string;
}

export interface Task {
  id: string; // SEN/TA/YYYYMMDD/NNN
  caseId: string;
  linkedIncidentId?: string; // Optional: incident this task runs alongside
  sourceEDiaryId?: string; // Set when created from an e-Diary entry via the combined Actions menu
  title: string;
  description: string;
  // `assignee`/`assigneeType` are now DERIVED back-compat fields (kept in sync
  // by the API on every write): assignee = assignees.map(a=>a.name).join(', '),
  // assigneeType = assignees.length === 1 ? assignees[0].type : undefined.
  // New code should read/write `assignees` — the derived fields exist only so
  // any display path not yet migrated still shows something reasonable.
  assignee: string; // User name(s) or Group name(s), comma-joined
  assigneeType?: 'user' | 'group'; // Only meaningful when assignees.length === 1
  assignees?: TaskAssignee[]; // FRD 7.2 — one shared task, any mix of users/groups
  priority: string; // "Low" | "Normal" | "High" | "Critical" — see TASK_PRIORITIES
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
  refNo?: string; // Optional pointer to another entry's e-Diary ID, linking two related occurrences (client feedback 2026-07-21: link picker replaces the old free-text Ref No / serialNo)
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
  id: string; // [Case ID]-BC[3-digit sequence], or SEN/BC/YYYYMMDD/### when caseless (§10.1d)
  caseId: string;
  incidentId: string;
  type: string; // "Closure" | "End-of-Day" | "Weather Advisory" | "Manual"
  recipients: string[];
  templateUsed: string;
  contentDispatched: string;
  sentAt: string;
  sentBy: string;
  status: string; // "PENDING" | "SENT" | "FAILED" | "REJECTED" (REJECTED is legacy-only, see broadcastStore note)
  deliveryAttempts: number;
  lastErrorMessage?: string;
  // FSD §10.9d-e — per-status delivery breakdown + acknowledgement counts.
  // Optional: only populated once a broadcast has been dispatched.
  deliveryCounts?: { sent: number; delivered: number; failed: number; pending: number };
  acknowledgedCount?: number;
  // Audit fields for the compose/dispatch step (FSD §5.11.1b).
  dispatchedBy?: string;
  dispatchedAt?: string;
  // §10.2/§13.3 — delivery channels resolved from the Broadcast Matrix at creation
  // (snapshot, same rationale as recipients — §10.3d).
  channels?: string[];
  // §10.4c-d — set true once a dispatch has gone out whose content was edited away
  // from the auto-filled template default, with explicit Duty Manager/Controller
  // confirmation (2026-07-25: replaced the old per-field sensitiveFields checklist
  // with this content-diff gate — see BroadcastTemplate comment in broadcastConfig.ts
  // for why). The gate itself is computed server-side at dispatch time by comparing
  // the submitted content against contentDispatched as it stood before this call.
  contentEditConfirmed?: boolean;

  // ── Added 2026-07-26 (BROADCAST_MODULE_FSD_GAP_AND_UIUX_PLAN.md, Phase 0) ──────
  // Previously resolved at queue time (broadcast.ts ResolvedBroadcast) then thrown
  // away — only a bare recipient email list and the template's *name* survived.
  // Persisting these closes gap G5 (§10.3/§10.9b: record must carry which group and
  // exactly which rule/template routed it, not just a snapshot of emails) and lets
  // the UI show "Group: SDC Crisis Command" instead of a bare comma list.
  recipientGroups?: string[];      // DistributionGroup.name[] resolved at queue time
  matrixRuleId?: string;           // BroadcastMatrixRule.id that resolved this record
  templateId?: string;             // BroadcastTemplate.id (templateUsed keeps the *name* for display)
  subject?: string;                // rendered from BroadcastTemplate.subject (fixes G4 — was hardcoded)
  // Rendered default content AS OF QUEUE TIME, kept forever even after a Duty
  // Manager/Controller edits contentDispatched before dispatch. Without this,
  // §10.4d's "content edited beyond default" confirmation had nothing to diff
  // against after dispatch — the original default was overwritten and lost
  // (gap G6). contentDispatched remains "what was actually sent"; contentDefault
  // is "what the template would have produced".
  contentDefault?: string;

  // US-BC-01 (2026-08-07, Kyle) — free-text note the Duty Manager enters on the
  // End-of-Day review screen explaining why THIS incident is carrying forward to
  // the next day, without having to open the full Edit tab. Scoped to this one
  // record (i.e. this one incident/eodDate night) — never copied or defaulted
  // from a prior night's record (BR3). Only ever written at dispatch time (same
  // as recipients/content — there is no separate draft-save path on this screen),
  // so an un-dispatched record reloaded after a refresh has no value here even if
  // something was typed into the box in a previous session (EC4). When present,
  // it is substituted into the rendered content ahead of incident.summary — see
  // applyCarryForwardSummary() in broadcast.ts — WITHOUT counting as a manual
  // content edit (BR5): the confirmation gate below only fires on top of that
  // substitution, not because of it.
  carryForwardSummary?: string;
  crisisLevel?: string;            // snapshot "Level N" — table/filter column, avoids re-joining the incident
  incidentType?: string;
  incidentSubType?: string;
  incidentTitle?: string;          // snapshot — incident title may itself change/be redacted later

  // createdAt is the record's actual creation time, distinct from sentAt/dispatchedAt
  // which are null/undefined for PENDING records. Without this, filtering broadcasts
  // by a date range hid 100% of the PENDING queue and the default list sort buried
  // pending work under already-sent records (gap G14 — the "43 pending records
  // disappear when you filter by month" bug). Optional only for pre-2026-07-26 Mongo
  // rows that predate this field; getBroadcastRecordCreatedAt() in broadcast.ts
  // supplies a best-effort fallback for those.
  createdAt?: string;              // ISO — set at push time by every creation call site
  queuedBy?: string;                // 'system' for cron/closure auto-queue, username for manual (§10.9b)

  // §10.7/B1 — the calendar night (Duty Manager's local "today", YYYY-MM-DD) an
  // End-of-Day record belongs to. This is what makes "leave it PENDING" a valid
  // substitute for a Reject action (Kyle, 2026-07-26, decision D6): a record whose
  // eodDate has passed and is still PENDING simply reads as "not sent that night" —
  // no separate REJECTED status, no reason field, no carry-over into the next
  // night's queue. Also the idempotency key for the EOD cron (fixes bug B1 — the
  // old guard only checked status==='PENDING', so re-running the check after a
  // dispatch created a second record for the same incident/night).
  eodDate?: string;

  // §10.3c/G15 — set when resolveClosureBroadcast/resolveEodBroadcast couldn't find
  // ANY matching Broadcast Matrix rule (or the matched group had 0 active members),
  // so recipients came back empty. Previously a 0-recipient PENDING record just sat
  // there silently, forever undispatchable, with no signal to anyone that it was a
  // config gap rather than a deliberate empty list.
  resolutionWarning?: string;

  // §10.9d-e — real per-recipient delivery status, sourced from emailMock's
  // Queued→Sent→Delivered→Failed lifecycle via a write-back poll. deliveryCounts
  // above is now a ROLLUP computed from this array, not a frozen snapshot (fixes
  // G11 — "delivered 0" forever, even days after a successful send).
  recipientStatus?: { email: string; status: 'Queued' | 'Sent' | 'Delivered' | 'Failed'; at?: string; error?: string }[];
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
  // Optional pointer to the specific record this entry is about (e.g. a
  // BroadcastTemplate id). Added 2026-07-25 so per-entity history views (like the
  // Broadcast Template detail page) can filter precisely instead of parsing
  // beforeSnapshot/afterSnapshot JSON. Omitted by callers that log page/module-wide
  // events without one specific record.
  entityId?: string;
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
  return client.db(process.env.MONGODB_DB_NAME || undefined);
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
  let parsed: any = initialSeedData;
  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      parsed = JSON.parse(raw);
    } catch {}
  }

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

/**
 * Objects returned by getDb({ includeAttachments: false }).
 *
 * Those objects are missing every attachment blob, so writing one back would
 * erase every stored attachment in the database. saveDb() checks this set and
 * refuses. A WeakSet is used so the entry disappears with the object itself.
 */
const attachmentStrippedDbs = new WeakSet<object>();

export interface GetDbOptions {
  /**
   * Load the attachment blobs (default true).
   *
   * Attachments are stored as base64 data URLs INSIDE the documents. Measured on
   * production 2026-08-19: they were 3.02 MB of a 3.32 MB /api/cases response —
   * 91% of the payload from just 30 images, the largest a single 1.24 MB photo.
   * List screens never render them (verified across IncidentLogTab, CaseLogTab,
   * the dashboard and MapComponent), so list endpoints pass false and skip the
   * blobs at the Mongo projection level: they never enter lambda memory, never
   * cross the wire, and never reach the browser.
   *
   * DANGER: an object loaded this way must never be passed to saveDb(). It is
   * registered in attachmentStrippedDbs and saveDb() throws if it sees one.
   */
  includeAttachments?: boolean;
}

export async function getDb(options: GetDbOptions = {}): Promise<DbSchema> {
  const { includeAttachments = true } = options;
  const stripAttachments = !includeAttachments;

  // `attachments` is excluded at the document level, `log.attachments` inside the
  // incident log array where the base64 blobs actually accumulate.
  const incidentProjection = stripAttachments
    ? { _id: 0, attachments: 0, 'log.attachments': 0 }
    : { _id: 0 };
  const blobProjection = stripAttachments ? { _id: 0, attachments: 0 } : { _id: 0 };
  // TaskComment.images is another string[] that has historically held base64.
  const taskProjection = stripAttachments
    ? { _id: 0, attachments: 0, 'comments.images': 0 }
    : { _id: 0 };

  try {
    const mdb = await getMongoDB();

    const [cases, incidents, faults, tasks, occurrences, events, nops, broadcasts, auditLogs, recurrenceSeries] = await Promise.all([
      mdb.collection('cases').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('incidents').find({}, { projection: incidentProjection }).toArray(),
      mdb.collection('faults').find({}, { projection: blobProjection }).toArray(),
      mdb.collection('tasks').find({}, { projection: taskProjection }).toArray(),
      mdb.collection('occurrences').find({}, { projection: blobProjection }).toArray(),
      mdb.collection('events').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('nops').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('broadcasts').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('auditLogs').find({}, { projection: { _id: 0 } }).toArray(),
      mdb.collection('recurrenceSeries').find({}, { projection: { _id: 0 } }).toArray(),
    ]);

    let normalizedDb: NormalizedDbSchema;

    // Seed from db.json on first run
    if (cases.length === 0) {
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

    const hydrated = hydrateDb(normalizedDb);

    if (stripAttachments) {
      // Fault.attachments / Task.attachments are non-optional in the types, so
      // restore them as empty arrays rather than leaving `undefined` for the UI.
      for (const f of hydrated.faults ?? []) if (!f.attachments) f.attachments = [];
      for (const t of hydrated.tasks ?? []) if (!t.attachments) t.attachments = [];
      for (const c of hydrated.cases) {
        if (c.incident && !c.incident.attachments) c.incident.attachments = [];
      }
      attachmentStrippedDbs.add(hydrated);
    }

    return hydrated;
  } catch (err) {
    console.warn('MongoDB connection unavailable — falling back to bundled db.json:', (err as Error).message || err);
    let parsed: any = initialSeedData;
    if (fs.existsSync(DB_PATH)) {
      try {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        parsed = JSON.parse(raw);
      } catch (fileErr) {
        console.error('Error reading local db.json fallback:', fileErr);
      }
    }
    const normalizedDb: NormalizedDbSchema = {
      cases: parsed.cases || [],
      incidents: parsed.incidents || [],
      faults: parsed.faults || [],
      tasks: parsed.tasks || [],
      occurrences: parsed.occurrences || [],
      events: parsed.events || [],
      nops: parsed.nops || [],
      broadcasts: parsed.broadcasts || [],
      auditLogs: parsed.auditLogs || [],
      recurrenceSeries: parsed.recurrenceSeries || []
    };
    return hydrateDb(normalizedDb);
  }
}

export async function saveDb(data: DbSchema): Promise<void> {
  if (attachmentStrippedDbs.has(data)) {
    throw new Error(
      'saveDb() refused: this DbSchema came from getDb({ includeAttachments: false }) and ' +
      'writing it back would erase every stored attachment. Re-read with getDb() before writing.',
    );
  }

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
    console.warn('Error writing to MongoDB — saving to local db.json fallback:', (err as Error).message || err);
    try {
      const normalizedDb = dehydrateDb(data);
      fs.writeFileSync(DB_PATH, JSON.stringify(normalizedDb, null, 2), 'utf-8');
    } catch (fileErr) {
      console.error('Failed to write to local db.json:', fileErr);
      throw err;
    }
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
