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
  { id: '1', name: 'Controller Steve', email: 'steve.rogers@sdc.gov.sg', phone: '+65 9111 0001', department: 'IIOC Operations', orgUnit: 'IOH Team Alpha', authSource: 'WOG SSO', role: 'Controller', status: 'Active', lastLogin: '2026-06-13T22:15:00Z' },
  { id: '2', name: 'DM Gan', email: 'gan.sh@sdc.gov.sg', phone: '+65 9876 5432', department: 'IIOC Management', orgUnit: 'IOH Duty Managers', authSource: 'WOG SSO', role: 'Duty Manager', status: 'Active', lastLogin: '2026-06-13T23:05:00Z' },
  { id: '3', name: 'DO Shin Feng', email: 'shin.feng@sdc.gov.sg', phone: '+65 9123 4567', department: 'IIOC Operations', orgUnit: 'IOH Team Beta', authSource: 'WOG SSO', role: 'Duty Officer', status: 'Active', lastLogin: '2026-06-13T20:44:00Z' },
  { id: '4', name: 'Ranger John', email: 'john.doe@ranger.com.sg', phone: '+65 9333 4444', department: 'Security & Ranger Service', orgUnit: 'Siloso Beach Patrol', authSource: 'Non-SSO', role: 'Responder', status: 'Active', lastLogin: '2026-06-13T19:30:00Z' },
  { id: '5', name: 'Admin Root', email: 'admin.root@sdc.gov.sg', phone: '+65 9111 0005', department: 'Information Technology', orgUnit: 'System Administrators', authSource: 'Non-SSO', role: 'System Administrator', status: 'Active', lastLogin: '2026-06-13T23:38:00Z' },
  { id: '6', name: 'Liaison Officer', email: 'liaison@sdc.gov.sg', phone: '+65 9111 2222', department: 'Corporate Communications', orgUnit: 'Public Relations', authSource: 'WOG SSO', role: 'Stakeholder', status: 'Active', lastLogin: '2026-06-12T14:10:00Z' },
  { id: '7', name: 'Analyst Sarah', email: 'sarah.analyst@sdc.gov.sg', phone: '+65 9111 0007', department: 'Business Continuity', orgUnit: 'Operational Resilience', authSource: 'WOG SSO', role: 'Operational Resilience Analyst', status: 'Active', lastLogin: '2026-06-12T09:00:00Z' },
  { id: '8', name: 'Recipient Tony', email: 'tony.stark@partner.com.sg', phone: '+65 9111 0008', department: 'Sentosa Cove Joint Committee', orgUnit: 'External Stakeholder', authSource: 'WOG SSO', role: 'Broadcast Recipient', status: 'Active', lastLogin: '2026-06-10T11:20:00Z' },
  { id: '9', name: 'Contractor Bob', email: 'bob.builder@coporate.com', phone: '+65 9111 0009', department: 'Facilities Maintenance', orgUnit: 'Engie Facility Team', authSource: 'Non-SSO', role: 'Non-SDC Term Contractor', status: 'Active', lastLogin: '2026-06-13T08:15:00Z' },
  { id: '10', name: 'Ranger Dave', email: 'dave.doe@ranger.com.sg', phone: '+65 9333 8888', department: 'Security & Ranger Service', orgUnit: 'Siloso Beach Patrol', authSource: 'Non-SSO', role: 'Responder', status: 'Active', lastLogin: 'Never' },
  { id: '11', name: 'Ranger Sarah', email: 'sarah.doe@ranger.com.sg', phone: '+65 9333 5555', department: 'Security & Ranger Service', orgUnit: 'Siloso Beach Patrol', authSource: 'Non-SSO', role: 'Responder', status: 'Active', lastLogin: 'Never' },
  { id: '12', name: 'Ranger Mike', email: 'mike.doe@ranger.com.sg', phone: '+65 9333 9999', department: 'Security & Ranger Service', orgUnit: 'Siloso Beach Patrol', authSource: 'Non-SSO', role: 'Responder', status: 'Active', lastLogin: 'Never' },
  { id: '13', name: 'Ranger Alex', email: 'alex.doe@ranger.com.sg', phone: '+65 9333 6666', department: 'Security & Ranger Service', orgUnit: 'Siloso Beach Patrol', authSource: 'Non-SSO', role: 'Responder', status: 'Active', lastLogin: 'Never' },
  { id: '14', name: 'Ranger Tommy', email: 'tommy.doe@ranger.com.sg', phone: '+65 9333 7777', department: 'Security & Ranger Service', orgUnit: 'Siloso Beach Patrol', authSource: 'Non-SSO', role: 'Responder', status: 'Active', lastLogin: 'Never' }
];

export function getUsers(): UserAccount[] {
  if (typeof window === 'undefined') {
    return DEFAULT_USERS;
  }
  const stored = localStorage.getItem('admin_users');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return DEFAULT_USERS;
    }
  }
  // Initialize on first retrieval
  localStorage.setItem('admin_users', JSON.stringify(DEFAULT_USERS));
  return DEFAULT_USERS;
}

export function saveUsers(users: UserAccount[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('admin_users', JSON.stringify(users));
  }
}
