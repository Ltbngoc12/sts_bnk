export interface TaxonomyItem {
  id: string;
  category: 'Incident' | 'Fault' | 'Priority' | 'eDiary' | 'Event';
  name: string;
  subTypes?: string[];
  description?: string;
  status: 'Active' | 'Deactivated';
}

export const DEFAULT_REFERENCE_DATA: TaxonomyItem[] = [
  // Incident Type Taxonomy
  { id: 'inc-1', category: 'Incident', name: 'Security', subTypes: ['Trespassing', 'Theft', 'Vandalism', 'Public Nuisance'], status: 'Active' },
  { id: 'inc-2', category: 'Incident', name: 'Safety', subTypes: ['Slip & Fall', 'Fire Alarm', 'Medical Emergency', 'Near Drowning'], status: 'Active' },
  { id: 'inc-3', category: 'Incident', name: 'Transport', subTypes: ['Cable Car Stoppage', 'Tram Incident', 'Road Obstruction'], status: 'Active' },
  { id: 'inc-4', category: 'Incident', name: 'Environmental', subTypes: ['Oil Spill', 'Wild Animal Sighting', 'Fallen Tree'], status: 'Active' },
  
  // Fault Type Taxonomy
  { id: 'flt-1', category: 'Fault', name: 'Mechanical', subTypes: ['Aircon Fault', 'Lift Stoppage', 'Escalator Defect'], status: 'Active' },
  { id: 'flt-2', category: 'Fault', name: 'Electrical', subTypes: ['Power Outage', 'Light Bulb Out', 'Switchboard Fault'], status: 'Active' },
  { id: 'flt-3', category: 'Fault', name: 'Structural', subTypes: ['Pothole', 'Wall Crack', 'Water Leakage'], status: 'Active' },
  { id: 'flt-4', category: 'Fault', name: 'IT/Telecom', subTypes: ['Network Outage', 'Camera Offline', 'Intercom Defect'], status: 'Active' },

  // Task Priority Levels
  { id: 'pri-1', category: 'Priority', name: 'Low', description: 'Routine inspection and general cleaning chores', status: 'Active' },
  { id: 'pri-2', category: 'Priority', name: 'Normal', description: 'Standard response speed within 2 hours', status: 'Active' },
  { id: 'pri-3', category: 'Priority', name: 'High', description: 'Urgent field tasks requiring dispatch within 30 minutes', status: 'Active' },
  { id: 'pri-4', category: 'Priority', name: 'Critical', description: 'Immediate life-safety issue, dispatcher alert', status: 'Active' },

  // e-Diary Topic Categories — the 5 physical logbooks the client digitised (2026-07-21
  // feedback, see EDIARY_MODULE_UPDATE_PLAN.md §8). Previously placeholder values (Routine
  // Patrol/Shift Handover/System Test/VIP Visit); synced to match EDiaryTab.tsx's TOPICS list
  // now that the Topic field reads from here for fuzzy search (2026-07-21 client feedback:
  // Topic managed in Taxonomy, fuzzy-search if it exists, free-text if it doesn't).
  { id: 'ed-1', category: 'eDiary', name: 'General Occurrence', description: 'Default catch-all for anything not covered below', status: 'Active' },
  { id: 'ed-2', category: 'eDiary', name: 'Carpark Barrier', description: 'Barrier faults, ticketing issues, vehicle incidents', status: 'Active' },
  { id: 'ed-3', category: 'eDiary', name: 'Asset Book — Radio/BWC', description: 'Radio and body-worn camera issue/return log', status: 'Active' },
  { id: 'ed-4', category: 'eDiary', name: 'Asset Book — Keys', description: 'Key issue/return log', status: 'Active' },
  { id: 'ed-5', category: 'eDiary', name: 'Lost & Found', description: 'Lost and found item log', status: 'Active' },

  // Event Type Taxonomy — FSD §8.1.2 (dropdown, no sub-types defined in FRD)
  { id: 'evt-1', category: 'Event', name: 'Sports & Recreation', description: 'Public sporting events, tournaments and recreational activities', status: 'Active' },
  { id: 'evt-2', category: 'Event', name: 'F&B', description: 'Food and beverage festivals, pop-ups and promotions', status: 'Active' },
  { id: 'evt-3', category: 'Event', name: 'Works', description: 'Scheduled construction, maintenance or contractor works', status: 'Active' },
  { id: 'evt-4', category: 'Event', name: 'Internal', description: 'Staff training, drills and internal operations', status: 'Active' },
  { id: 'evt-5', category: 'Event', name: 'VIP / Dignitary', description: 'VIP visits and dignitary-related events', status: 'Active' },
];

export function getFaultTaxonomy(): Record<string, string[]> {
  if (typeof window === 'undefined') {
    const mapping: Record<string, string[]> = {};
    DEFAULT_REFERENCE_DATA
      .filter(item => item.category === 'Fault' && item.status === 'Active')
      .forEach(item => {
        mapping[item.name] = item.subTypes || [];
      });
    return mapping;
  }

  const stored = localStorage.getItem('admin_reference_data');
  const items: TaxonomyItem[] = stored ? JSON.parse(stored) : [];

  const activeFaultItems = (items.length > 0 ? items : DEFAULT_REFERENCE_DATA)
    .filter(item => item.category === 'Fault' && item.status === 'Active');

  const mapping: Record<string, string[]> = {};
  activeFaultItems.forEach(item => {
    mapping[item.name] = item.subTypes || [];
  });
  return mapping;
}

export function getEventTaxonomy(): string[] {
  if (typeof window === 'undefined') {
    return DEFAULT_REFERENCE_DATA
      .filter(item => item.category === 'Event' && item.status === 'Active')
      .map(item => item.name);
  }

  const stored = localStorage.getItem('admin_reference_data');
  const items: TaxonomyItem[] = stored ? JSON.parse(stored) : [];

  return (items.length > 0 ? items : DEFAULT_REFERENCE_DATA)
    .filter(item => item.category === 'Event' && item.status === 'Active')
    .map(item => item.name);
}

export function getEDiaryTaxonomy(): string[] {
  if (typeof window === 'undefined') {
    return DEFAULT_REFERENCE_DATA
      .filter(item => item.category === 'eDiary' && item.status === 'Active')
      .map(item => item.name);
  }

  const stored = localStorage.getItem('admin_reference_data');
  const items: TaxonomyItem[] = stored ? JSON.parse(stored) : [];

  return (items.length > 0 ? items : DEFAULT_REFERENCE_DATA)
    .filter(item => item.category === 'eDiary' && item.status === 'Active')
    .map(item => item.name);
}

export function getTaskPriorityTaxonomy(): string[] {
  if (typeof window === 'undefined') {
    return DEFAULT_REFERENCE_DATA
      .filter(item => item.category === 'Priority' && item.status === 'Active')
      .map(item => item.name);
  }

  const stored = localStorage.getItem('admin_reference_data');
  const items: TaxonomyItem[] = stored ? JSON.parse(stored) : [];

  return (items.length > 0 ? items : DEFAULT_REFERENCE_DATA)
    .filter(item => item.category === 'Priority' && item.status === 'Active')
    .map(item => item.name);
}

export function getIncidentTaxonomy(): Record<string, string[]> {
  if (typeof window === 'undefined') {
    // Return default mapping if server-side rendered
    const mapping: Record<string, string[]> = {};
    DEFAULT_REFERENCE_DATA
      .filter(item => item.category === 'Incident' && item.status === 'Active')
      .forEach(item => {
        mapping[item.name] = item.subTypes || [];
      });
    return mapping;
  }

  const stored = localStorage.getItem('admin_reference_data');
  const items: TaxonomyItem[] = stored ? JSON.parse(stored) : [];
  
  // Filter for Active Incident types
  const activeIncidentItems = (items.length > 0 ? items : DEFAULT_REFERENCE_DATA)
    .filter(item => item.category === 'Incident' && item.status === 'Active');

  const mapping: Record<string, string[]> = {};
  activeIncidentItems.forEach(item => {
    mapping[item.name] = item.subTypes || [];
  });
  return mapping;
}
