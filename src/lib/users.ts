export interface UserAccount {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  orgUnit: string;
  authSource: 'WOG SSO' | 'Non-SSO';
  role: string;
  status: 'Active' | 'Deactivated';
  lastLogin: string;
}

export const DEFAULT_USERS: UserAccount[] = [
  // ── Operations Command (IIOC) ──
  { id: '1', name: 'Controller Steve', email: 'steve.rogers@sdc.gov.sg', phone: '+65 9111 0001', department: 'IIOC Operations', orgUnit: 'IOH Team Alpha', authSource: 'WOG SSO', role: 'Controller', status: 'Active', lastLogin: '2026-06-13T22:15:00Z' },
  { id: '2', name: 'DM Gan', email: 'gan.sh@sdc.gov.sg', phone: '+65 9876 5432', department: 'IIOC Management', orgUnit: 'IOH Duty Managers', authSource: 'WOG SSO', role: 'Duty Manager', status: 'Active', lastLogin: '2026-06-13T23:05:00Z' },
  { id: '3', name: 'DO Shin Feng', email: 'shin.feng@sdc.gov.sg', phone: '+65 9123 4567', department: 'IIOC Operations', orgUnit: 'IOH Team Beta', authSource: 'WOG SSO', role: 'Duty Officer', status: 'Active', lastLogin: '2026-06-13T20:44:00Z' },
  { id: '4', name: 'Controller Alicia', email: 'alicia.wong@sdc.gov.sg', phone: '+65 9111 0002', department: 'IIOC Operations', orgUnit: 'IOH Team Alpha', authSource: 'WOG SSO', role: 'Controller', status: 'Active', lastLogin: '2026-06-13T18:20:00Z' },
  { id: '5', name: 'Controller Bryan', email: 'bryan.tan@sdc.gov.sg', phone: '+65 9111 0003', department: 'IIOC Operations', orgUnit: 'IOH Team Beta', authSource: 'WOG SSO', role: 'Controller', status: 'Active', lastLogin: '2026-06-12T16:00:00Z' },
  { id: '6', name: 'DM Marcus', email: 'marcus.lee@sdc.gov.sg', phone: '+65 9876 1122', department: 'IIOC Management', orgUnit: 'IOH Duty Managers', authSource: 'WOG SSO', role: 'Duty Manager', status: 'Active', lastLogin: '2026-06-11T21:30:00Z' },
  { id: '7', name: 'DO Jessica', email: 'jessica.lim@sdc.gov.sg', phone: '+65 9123 8899', department: 'IIOC Operations', orgUnit: 'IOH Team Alpha', authSource: 'WOG SSO', role: 'Duty Officer', status: 'Active', lastLogin: '2026-06-13T14:15:00Z' },

  // ── Field Responders (Rangers & Lifeguards) ──
  { id: '8', name: 'Ranger John', email: 'john.doe@ranger.com.sg', phone: '+65 9333 4444', department: 'Security & Ranger Service', orgUnit: 'Siloso Beach Patrol', authSource: 'Non-SSO', role: 'Responder', status: 'Active', lastLogin: '2026-06-13T19:30:00Z' },
  { id: '9', name: 'Ranger Sarah', email: 'sarah.doe@ranger.com.sg', phone: '+65 9333 5555', department: 'Security & Ranger Service', orgUnit: 'Palawan Beach Patrol', authSource: 'Non-SSO', role: 'Responder', status: 'Active', lastLogin: '2026-06-13T17:45:00Z' },
  { id: '10', name: 'Ranger Alex', email: 'alex.doe@ranger.com.sg', phone: '+65 9333 6666', department: 'Security & Ranger Service', orgUnit: 'Tanjong Beach Patrol', authSource: 'Non-SSO', role: 'Responder', status: 'Active', lastLogin: '2026-06-12T12:00:00Z' },
  { id: '11', name: 'Ranger Tommy', email: 'tommy.doe@ranger.com.sg', phone: '+65 9333 7777', department: 'Security & Ranger Service', orgUnit: 'Imbiah Hill Patrol', authSource: 'Non-SSO', role: 'Responder', status: 'Active', lastLogin: '2026-06-10T08:30:00Z' },
  { id: '12', name: 'Ranger Dave', email: 'dave.doe@ranger.com.sg', phone: '+65 9333 8888', department: 'Security & Ranger Service', orgUnit: 'Sentosa Gateway & Boardwalk', authSource: 'Non-SSO', role: 'Responder', status: 'Active', lastLogin: '2026-06-11T10:20:00Z' },
  { id: '13', name: 'Ranger Mike', email: 'mike.doe@ranger.com.sg', phone: '+65 9333 9999', department: 'Security & Ranger Service', orgUnit: 'Sentosa Cove Perimeter', authSource: 'Non-SSO', role: 'Responder', status: 'Active', lastLogin: '2026-06-13T15:10:00Z' },
  { id: '14', name: 'Lifeguard Supervisor Tan', email: 'tan.lifeguard@sdc.gov.sg', phone: '+65 9644 5566', department: 'Beach Operations', orgUnit: 'Sentosa Lifeguard Corp', authSource: 'WOG SSO', role: 'Responder', status: 'Active', lastLogin: '2026-06-13T20:00:00Z' },
  { id: '15', name: 'Lifeguard Daniel', email: 'daniel.lifeguard@sdc.gov.sg', phone: '+65 9655 1122', department: 'Beach Operations', orgUnit: 'Palawan Water Rescue', authSource: 'Non-SSO', role: 'Responder', status: 'Active', lastLogin: '2026-06-13T16:40:00Z' },

  // ── Administration & Resilience ──
  { id: '16', name: 'Admin Root', email: 'admin.root@sdc.gov.sg', phone: '+65 9111 0005', department: 'Information Technology', orgUnit: 'System Administrators', authSource: 'Non-SSO', role: 'System Administrator', status: 'Active', lastLogin: '2026-06-13T23:38:00Z' },
  { id: '17', name: 'Analyst Sarah', email: 'sarah.analyst@sdc.gov.sg', phone: '+65 9111 0007', department: 'Business Continuity', orgUnit: 'Operational Resilience', authSource: 'WOG SSO', role: 'Operational Resilience Analyst', status: 'Active', lastLogin: '2026-06-12T09:00:00Z' },
  { id: '18', name: 'Liaison Officer Rachel', email: 'liaison@sdc.gov.sg', phone: '+65 9111 2222', department: 'Corporate Communications', orgUnit: 'Public Relations', authSource: 'WOG SSO', role: 'Stakeholder', status: 'Active', lastLogin: '2026-06-12T14:10:00Z' },

  // ── External Stakeholders & Contractors ──
  { id: '19', name: 'Recipient Tony', email: 'tony.stark@partner.com.sg', phone: '+65 9111 0008', department: 'Sentosa Cove Joint Committee', orgUnit: 'External Stakeholder', authSource: 'WOG SSO', role: 'Broadcast Recipient', status: 'Active', lastLogin: '2026-06-10T11:20:00Z' },
  { id: '20', name: 'Contractor Bob', email: 'bob.builder@coporate.com', phone: '+65 9111 0009', department: 'Facilities Maintenance', orgUnit: 'Engie Facility Team', authSource: 'Non-SSO', role: 'Non-SDC Term Contractor', status: 'Active', lastLogin: '2026-06-13T08:15:00Z' },
  { id: '21', name: 'Electrical Lead Kelvin', email: 'electrical.lead@spgroup.com.sg', phone: '+65 9122 3344', department: 'Power Grid Infrastructure', orgUnit: 'SP Group On-Site', authSource: 'Non-SSO', role: 'Non-SDC Term Contractor', status: 'Active', lastLogin: '2026-06-09T14:00:00Z' }
];

export const USERS_VERSION = '2026.09.10.v1';

export function getUsers(): UserAccount[] {
  if (typeof window === 'undefined') {
    return DEFAULT_USERS;
  }
  const ver = localStorage.getItem('admin_users_ver');
  if (ver !== USERS_VERSION) {
    localStorage.setItem('admin_users', JSON.stringify(DEFAULT_USERS));
    localStorage.setItem('admin_users_ver', USERS_VERSION);
    return DEFAULT_USERS;
  }
  const stored = localStorage.getItem('admin_users');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      return DEFAULT_USERS;
    }
  }
  localStorage.setItem('admin_users', JSON.stringify(DEFAULT_USERS));
  return DEFAULT_USERS;
}

export function saveUsers(users: UserAccount[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('admin_users', JSON.stringify(users));
    localStorage.setItem('admin_users_ver', USERS_VERSION);
  }
}
