// Reusable Task creation templates — FRD 13.2 "Task checklist templates".
// System Administrator / Current Ops Administrator define these under System
// Configuration; Controllers pick one at Task creation to prefill
// Description/Priority/Checklist. Title, Due Date and Assignee are never
// templated, and every prefilled field stays editable afterwards.
//
// Persisted client-side in localStorage — same pattern as src/lib/groups.ts
// and src/lib/taxonomy.ts (both System Reference Data Configuration items).

export interface ChecklistTemplateItem {
  id: string;
  text: string;
}

export interface ChecklistTemplate {
  id: string;
  name: string;                        // Shown in the "Use Template" picker
  description: string;                 // Prefills Task Description
  priority: string;                    // Prefills Task Priority — synced with Admin > Taxonomy > Task Priority Levels
  checklist: ChecklistTemplateItem[];   // Prefills Task Checklist
  status: 'Active' | 'Deactivated';
  createdBy: string;
  createdDate: string;
}

export const CHECKLIST_TEMPLATES_STORAGE_KEY = 'admin_task_checklist_templates';

export const DEFAULT_CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  {
    id: 'tpl-1',
    name: 'Escort — Contractor Access & Permit Verification',
    description: 'Escort contractor to work site and verify access authorisation, hot work permits, and PPE before entry.',
    priority: 'Normal',
    status: 'Active',
    createdBy: 'System Administrator',
    createdDate: new Date().toISOString(),
    checklist: [
      { id: 'tpl-1-c1', text: 'Verify contractor ID, valid Permit-To-Work (PTW) and work order' },
      { id: 'tpl-1-c2', text: 'Inspect safety PPE (helmet, vest, safety boots)' },
      { id: 'tpl-1-c3', text: 'Escort to site and confirm access boundary' },
      { id: 'tpl-1-c4', text: 'Log entry/exit time in e-Diary' },
    ],
  },
  {
    id: 'tpl-2',
    name: 'Lost & Found — Item Collection & Verification',
    description: 'Collect a reported lost item from the location, verify contents, and log it for secure custody handover.',
    priority: 'Low',
    status: 'Active',
    createdBy: 'System Administrator',
    createdDate: new Date().toISOString(),
    checklist: [
      { id: 'tpl-2-c1', text: 'Confirm item description and finder details with reporter' },
      { id: 'tpl-2-c2', text: 'Photograph and inventory item contents at scene' },
      { id: 'tpl-2-c3', text: 'Transport to Lost & Found counter / Siloso Station Ops' },
      { id: 'tpl-2-c4', text: 'Log record ID and obtain handover signature' },
    ],
  },
  {
    id: 'tpl-3',
    name: 'Routine Facility Inspection & Defect Logging',
    description: 'Walk-through inspection of a facility area or beach promenade to flag any faults, signage defects, or safety hazards.',
    priority: 'Normal',
    status: 'Active',
    createdBy: 'System Administrator',
    createdDate: new Date().toISOString(),
    checklist: [
      { id: 'tpl-3-c1', text: 'Check emergency lighting, exit signage, and fire extinguishers' },
      { id: 'tpl-3-c2', text: 'Check for trip hazards, loose pavers, or broken railings' },
      { id: 'tpl-3-c3', text: 'Verify washrooms and public amenities cleanliness' },
      { id: 'tpl-3-c4', text: 'Raise a Fault record in CMMS for any defect found' },
    ],
  },
  {
    id: 'tpl-4',
    name: 'VIP & Dignitary Route Clearance & Escort',
    description: 'Pre-event security sweep, pathway clearance, and direct escort for high-level dignitaries or official delegations.',
    priority: 'High',
    status: 'Active',
    createdBy: 'System Administrator',
    createdDate: new Date().toISOString(),
    checklist: [
      { id: 'tpl-4-c1', text: 'Perform security sweep of arrival point and transit corridor' },
      { id: 'tpl-4-c2', text: 'Confirm vehicular drop-off clearance with Traffic Marshals' },
      { id: 'tpl-4-c3', text: 'Coordinate with Close Protection Officer (CPO) on comms channel' },
      { id: 'tpl-4-c4', text: 'Escort delegation to reserved holding lounge' },
    ],
  },
  {
    id: 'tpl-5',
    name: 'Beach Safety & Coastal Hazard Assessment',
    description: 'Detailed beach safety audit covering red flag signage, water buoy lines, jellyfish warnings, and first-aid kits.',
    priority: 'Normal',
    status: 'Active',
    createdBy: 'System Administrator',
    createdDate: new Date().toISOString(),
    checklist: [
      { id: 'tpl-5-c1', text: 'Check beach warning flags and signage visibility' },
      { id: 'tpl-5-c2', text: 'Inspect swim boundary demarcation buoys and shark/box-jellyfish nets' },
      { id: 'tpl-5-c3', text: 'Verify automated external defibrillator (AED) and oxygen kits at lifeguard tower' },
      { id: 'tpl-5-c4', text: 'Report any oil slick, marine debris, or rip current observation to IIOC' },
    ],
  },
  {
    id: 'tpl-6',
    name: 'Event Pre-Opening Crowd Barrier & Safety Audit',
    description: 'Pre-opening compliance check for major events and festivals on Sentosa event lawns and beaches.',
    priority: 'High',
    status: 'Active',
    createdBy: 'System Administrator',
    createdDate: new Date().toISOString(),
    checklist: [
      { id: 'tpl-6-c1', text: 'Verify barricade stability and crowd queue maze setup' },
      { id: 'tpl-6-c2', text: 'Ensure all emergency egress gates are unlocked and unobstructed' },
      { id: 'tpl-6-c3', text: 'Verify private security deployment numbers against NOP requirements' },
      { id: 'tpl-6-c4', text: 'Confirm temporary sound and lighting structure safety endorsements' },
    ],
  },
  {
    id: 'tpl-7',
    name: 'Cable Car & Monorail Perimeter Check',
    description: 'Inspect track perimeters, pylon bases, station platforms, and ticket gantry clearances.',
    priority: 'Normal',
    status: 'Active',
    createdBy: 'System Administrator',
    createdDate: new Date().toISOString(),
    checklist: [
      { id: 'tpl-7-c1', text: 'Check perimeter fencing and security gates around pylon towers' },
      { id: 'tpl-7-c2', text: 'Inspect passenger boarding platforms for queue congestion' },
      { id: 'tpl-7-c3', text: 'Verify emergency stop buttons and intercom accessibility' },
      { id: 'tpl-7-c4', text: 'Confirm passenger elevator and wheelchair lift operational status' },
    ],
  },
  {
    id: 'tpl-8',
    name: 'Post-Storm / CAT 1 Debris & Drain Clearance',
    description: 'Rapid response inspection following heavy rain, squall lines, or high winds to clear fallen branches and prevent ponding.',
    priority: 'High',
    status: 'Active',
    createdBy: 'System Administrator',
    createdDate: new Date().toISOString(),
    checklist: [
      { id: 'tpl-8-c1', text: 'Patrol main arterial roads (Siloso Beach Walk, Artillery Ave, Gateway)' },
      { id: 'tpl-8-c2', text: 'Clear fallen tree branches obstructing pedestrian paths or roadway' },
      { id: 'tpl-8-c3', text: 'Inspect storm water drains and scuppers for blockages' },
      { id: 'tpl-8-c4', text: 'Report any localized flooding or structural wind damage to IIOC' },
    ],
  },
];

export const CHECKLIST_TEMPLATES_VERSION = '2026.09.10.v1';

export function getChecklistTemplates(): ChecklistTemplate[] {
  if (typeof window === 'undefined') return DEFAULT_CHECKLIST_TEMPLATES;
  const ver = localStorage.getItem('admin_task_checklist_templates_ver');
  if (ver !== CHECKLIST_TEMPLATES_VERSION) {
    localStorage.setItem(CHECKLIST_TEMPLATES_STORAGE_KEY, JSON.stringify(DEFAULT_CHECKLIST_TEMPLATES));
    localStorage.setItem('admin_task_checklist_templates_ver', CHECKLIST_TEMPLATES_VERSION);
    return DEFAULT_CHECKLIST_TEMPLATES;
  }
  const stored = localStorage.getItem(CHECKLIST_TEMPLATES_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      return DEFAULT_CHECKLIST_TEMPLATES;
    }
  }
  localStorage.setItem(CHECKLIST_TEMPLATES_STORAGE_KEY, JSON.stringify(DEFAULT_CHECKLIST_TEMPLATES));
  return DEFAULT_CHECKLIST_TEMPLATES;
}

export function saveChecklistTemplates(templates: ChecklistTemplate[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(CHECKLIST_TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
    localStorage.setItem('admin_task_checklist_templates_ver', CHECKLIST_TEMPLATES_VERSION);
  }
}

// Active templates only — used by the Create Task "Use Template" picker.
export function getActiveChecklistTemplates(): ChecklistTemplate[] {
  return getChecklistTemplates().filter(t => t.status === 'Active');
}
