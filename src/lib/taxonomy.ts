export interface TaxonomyItem {
  id: string;
  category: 'Incident' | 'Fault' | 'Priority' | 'eDiary' | 'Event';
  name: string;
  subTypes?: string[];
  description?: string;
  status: 'Active' | 'Deactivated';
}

export const DEFAULT_REFERENCE_DATA: TaxonomyItem[] = [
  // ── Incident Type Taxonomy ──
  { id: 'inc-1', category: 'Incident', name: 'Security', subTypes: ['Trespassing', 'Theft', 'Vandalism', 'Public Nuisance', 'Unauthorized Drone Flight', 'Disorderly Conduct', 'Suspicious Object', 'Unlawful Assembly'], status: 'Active' },
  { id: 'inc-2', category: 'Incident', name: 'Safety', subTypes: ['Slip & Fall', 'Fire Alarm', 'Medical Emergency', 'Near Drowning', 'Heat Exhaustion', 'Amusement Ride Stoppage', 'Minor Collision', 'Crush Injury'], status: 'Active' },
  { id: 'inc-3', category: 'Incident', name: 'Transport', subTypes: ['Cable Car Stoppage', 'Tram Incident', 'Road Obstruction', 'Monorail Delay', 'Bus Breakdown', 'Traffic Congestion', 'Illegal Parking', 'Bicycle / PMD Collision'], status: 'Active' },
  { id: 'inc-4', category: 'Incident', name: 'Environmental', subTypes: ['Oil Spill', 'Wild Animal Sighting', 'Fallen Tree', 'Haze / Smoke Incident', 'Beach Contamination', 'Severe Weather / Lightning', 'Flash Flood', 'Beached Marine Life'], status: 'Active' },
  { id: 'inc-5', category: 'Incident', name: 'Maritime / Beach', subTypes: ['Vessel Adrift', 'Box Jellyfish Sighting', 'Rough Seas / Red Flag', 'Oil Sheen in Water', 'Swimmer in Distress'], status: 'Active' },
  
  // ── Fault Type Taxonomy ──
  { id: 'flt-1', category: 'Fault', name: 'Mechanical', subTypes: ['Aircon Fault', 'Lift Stoppage', 'Escalator Defect', 'Pump Failure', 'Generator Fault', 'Water Feature Defect', 'Automatic Door Failure'], status: 'Active' },
  { id: 'flt-2', category: 'Fault', name: 'Electrical', subTypes: ['Power Outage', 'Light Bulb Out', 'Switchboard Fault', 'Street Lamp Failure', 'Solar Panel Defect', 'Substation Alarm', 'Circuit Tripped'], status: 'Active' },
  { id: 'flt-3', category: 'Fault', name: 'Structural', subTypes: ['Pothole', 'Wall Crack', 'Water Leakage', 'Boardwalk Defect', 'Fence Damaged', 'Tile Broken', 'Handrail Loose', 'Ceiling Panel Sagging'], status: 'Active' },
  { id: 'flt-4', category: 'Fault', name: 'IT/Telecom', subTypes: ['Network Outage', 'Camera Offline', 'Intercom Defect', 'PA System Malfunction', 'VMS Display Glitch', 'Wi-Fi AP Down', 'Barrier Gate Jam', 'Server Alert'], status: 'Active' },
  { id: 'flt-5', category: 'Fault', name: 'Landscape & Sanitation', subTypes: ['Overgrown Vegetation', 'Irrigation Leak', 'Bin Overflow', 'Beach Litter', 'Fountain Clogged', 'Public Toilet Defect'], status: 'Active' },

  // ── Task Priority Levels ──
  { id: 'pri-1', category: 'Priority', name: 'Low', description: 'Routine inspection and general cleaning chores', status: 'Active' },
  { id: 'pri-2', category: 'Priority', name: 'Normal', description: 'Standard response speed within 2 hours', status: 'Active' },
  { id: 'pri-3', category: 'Priority', name: 'High', description: 'Urgent field tasks requiring dispatch within 30 minutes', status: 'Active' },
  { id: 'pri-4', category: 'Priority', name: 'Critical', description: 'Immediate life-safety issue, dispatcher alert', status: 'Active' },

  // ── e-Diary Topic Categories ──
  { id: 'ed-1', category: 'eDiary', name: 'General Occurrence', description: 'Default catch-all for anything not covered below', status: 'Active' },
  { id: 'ed-2', category: 'eDiary', name: 'Carpark Barrier', description: 'Barrier faults, ticketing issues, vehicle incidents', status: 'Active' },
  { id: 'ed-3', category: 'eDiary', name: 'Asset Book — Radio/BWC', description: 'Radio and body-worn camera issue/return log', status: 'Active' },
  { id: 'ed-4', category: 'eDiary', name: 'Asset Book — Keys', description: 'Key issue/return log', status: 'Active' },
  { id: 'ed-5', category: 'eDiary', name: 'Lost & Found', description: 'Lost and found item log', status: 'Active' },
  { id: 'ed-6', category: 'eDiary', name: 'Routine Patrol', description: 'Regular sector inspection and patrol observations', status: 'Active' },
  { id: 'ed-7', category: 'eDiary', name: 'Shift Handover', description: 'Duty team changeover briefing and logbook endorsement', status: 'Active' },
  { id: 'ed-8', category: 'eDiary', name: 'VIP Visit', description: 'Dignitary escort and special route monitoring', status: 'Active' },
  { id: 'ed-9', category: 'eDiary', name: 'System Maintenance', description: 'Scheduled IT, power, and security system maintenance', status: 'Active' },
  { id: 'ed-10', category: 'eDiary', name: 'Beach Lifeguard Operations', description: 'Water condition log, flag status, and rescue records', status: 'Active' },

  // ── Event Type Taxonomy ──
  { id: 'evt-1', category: 'Event', name: 'Sports & Recreation', description: 'Public sporting events, marathons, tournaments and recreational activities', status: 'Active' },
  { id: 'evt-2', category: 'Event', name: 'Arts & Culture', description: 'Visual arts exhibitions, cultural performances, theatre and heritage showcases', status: 'Active' },
  { id: 'evt-3', category: 'Event', name: 'Festivals', description: 'Major seasonal festivals, light shows, night fiestas and cultural holidays', status: 'Active' },
  { id: 'evt-4', category: 'Event', name: 'F&B', description: 'Food and beverage festivals, pop-ups and culinary promotions', status: 'Active' },
  { id: 'evt-5', category: 'Event', name: 'Music & Concerts', description: 'Live music concerts, beach festivals, DJ parties and orchestra performances', status: 'Active' },
  { id: 'evt-6', category: 'Event', name: 'Corporate', description: 'Corporate conferences, team building retreats, MICE exhibitions and summits', status: 'Active' },
  { id: 'evt-7', category: 'Event', name: 'Community', description: 'Community gatherings, family carnivals, charity runs and awareness walks', status: 'Active' },
  { id: 'evt-8', category: 'Event', name: 'Works', description: 'Scheduled construction, maintenance or contractor works', status: 'Active' },
  { id: 'evt-9', category: 'Event', name: 'Internal', description: 'Staff training, drills, island exercises and internal operations', status: 'Active' },
  { id: 'evt-10', category: 'Event', name: 'VIP / Dignitary', description: 'VIP visits, foreign state delegations and dignitary-related events', status: 'Active' },
  { id: 'evt-11', category: 'Event', name: 'Entertainment & Attractions', description: 'Themed attractions launches, character meet-and-greets, parade shows', status: 'Active' },
  { id: 'evt-12', category: 'Event', name: 'Exhibitions & MICE', description: 'Trade exhibitions, showcases and convention center events', status: 'Active' },
];

export const TAXONOMY_VERSION = '2026.09.10.v1';

export function getReferenceData(): TaxonomyItem[] {
  if (typeof window === 'undefined') {
    return DEFAULT_REFERENCE_DATA;
  }
  const ver = localStorage.getItem('admin_reference_data_ver');
  if (ver !== TAXONOMY_VERSION) {
    localStorage.setItem('admin_reference_data', JSON.stringify(DEFAULT_REFERENCE_DATA));
    localStorage.setItem('admin_reference_data_ver', TAXONOMY_VERSION);
    return DEFAULT_REFERENCE_DATA;
  }
  const stored = localStorage.getItem('admin_reference_data');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // fallback
    }
  }
  localStorage.setItem('admin_reference_data', JSON.stringify(DEFAULT_REFERENCE_DATA));
  return DEFAULT_REFERENCE_DATA;
}

export function saveReferenceData(data: TaxonomyItem[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('admin_reference_data', JSON.stringify(data));
    localStorage.setItem('admin_reference_data_ver', TAXONOMY_VERSION);
  }
}

export function getFaultTaxonomy(): Record<string, string[]> {
  const items = getReferenceData();
  const activeFaultItems = items.filter(item => item.category === 'Fault' && item.status === 'Active');
  const mapping: Record<string, string[]> = {};
  activeFaultItems.forEach(item => {
    mapping[item.name] = item.subTypes || [];
  });
  return mapping;
}

export function getEventTaxonomy(): string[] {
  const items = getReferenceData();
  return items
    .filter(item => item.category === 'Event' && item.status === 'Active')
    .map(item => item.name);
}

export function getEDiaryTaxonomy(): string[] {
  const items = getReferenceData();
  return items
    .filter(item => item.category === 'eDiary' && item.status === 'Active')
    .map(item => item.name);
}

export function getTaskPriorityTaxonomy(): string[] {
  const items = getReferenceData();
  return items
    .filter(item => item.category === 'Priority' && item.status === 'Active')
    .map(item => item.name);
}

export function getIncidentTaxonomy(): Record<string, string[]> {
  const items = getReferenceData();
  const activeIncidentItems = items.filter(item => item.category === 'Incident' && item.status === 'Active');
  const mapping: Record<string, string[]> = {};
  activeIncidentItems.forEach(item => {
    mapping[item.name] = item.subTypes || [];
  });
  return mapping;
}
