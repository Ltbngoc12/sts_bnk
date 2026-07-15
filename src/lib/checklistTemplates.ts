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
    name: 'Escort — Contractor Access',
    description: 'Escort contractor to work site and verify access authorisation before entry.',
    priority: 'Normal',
    status: 'Active',
    createdBy: 'System Administrator',
    createdDate: new Date().toISOString(),
    checklist: [
      { id: 'tpl-1-c1', text: 'Verify contractor ID and work order' },
      { id: 'tpl-1-c2', text: 'Escort to site and confirm access granted' },
      { id: 'tpl-1-c3', text: 'Log entry/exit time' },
    ],
  },
  {
    id: 'tpl-2',
    name: 'Lost & Found — Item Collection',
    description: 'Collect a reported lost item from the location and log it for handover.',
    priority: 'Low',
    status: 'Active',
    createdBy: 'System Administrator',
    createdDate: new Date().toISOString(),
    checklist: [
      { id: 'tpl-2-c1', text: 'Confirm item description with reporter' },
      { id: 'tpl-2-c2', text: 'Collect item from location' },
      { id: 'tpl-2-c3', text: 'Hand over to Lost & Found counter' },
    ],
  },
  {
    id: 'tpl-3',
    name: 'Routine Facility Inspection',
    description: 'Walk-through inspection of a facility area to flag any faults or safety issues.',
    priority: 'Normal',
    status: 'Active',
    createdBy: 'System Administrator',
    createdDate: new Date().toISOString(),
    checklist: [
      { id: 'tpl-3-c1', text: 'Check lighting and signage' },
      { id: 'tpl-3-c2', text: 'Check for trip hazards / obstructions' },
      { id: 'tpl-3-c3', text: 'Raise a Fault record for any defect found' },
    ],
  },
];

export function getChecklistTemplates(): ChecklistTemplate[] {
  if (typeof window === 'undefined') return DEFAULT_CHECKLIST_TEMPLATES;
  const stored = localStorage.getItem(CHECKLIST_TEMPLATES_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
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
  }
}

// Active templates only — used by the Create Task "Use Template" picker.
export function getActiveChecklistTemplates(): ChecklistTemplate[] {
  return getChecklistTemplates().filter(t => t.status === 'Active');
}
