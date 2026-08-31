import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Error: MONGODB_URI not found in environment.');
  process.exit(1);
}

const dbName = process.env.MONGODB_DB_NAME || undefined;

// Dynamic today string (e.g. 2026-08-31)
const todayStr = new Date().toISOString().slice(0, 10);
const todayDateStr = todayStr.replace(/-/g, '');

const DEFAULT_BROADCAST_TEMPLATES = [
  {
    id: 'tpl-closure',
    category: 'Closure Broadcast',
    name: 'Standard Closure Broadcast',
    subject: '[SDC] Incident Closed: {incident_title}',
    body:
      'INCIDENT CLOSURE NOTICE\n\nCase ID: {case_id}\nIncident ID: {incident_id}\nTitle: {incident_title}\nClassification: {incident_type} — {incident_subtype}\nLocation: {location}\nCrisis Level: {crisis_level}\nClosed At: {closed_at}\nClosed By: {closed_by}\n\nSummary: {summary}\n\nThis is an automated closure dispatch from the Sentosa CMS.',
    status: 'Active',
  },
  {
    id: 'tpl-eod',
    category: 'End-of-Day Interim Broadcast',
    name: 'End-of-Day Interim Broadcast',
    subject: '[SDC] End-of-Day Interim Update: {incident_title}',
    body:
      'END-OF-DAY INTERIM UPDATE\n\nCase ID: {case_id}\nIncident ID: {incident_id}\nTitle: {incident_title}\nClassification: {incident_type} — {incident_subtype}\nLocation: {location}\nCrisis Level: {crisis_level}\nCurrent Status: {status}\n\nSummary of progress to date: {summary}\n\nThis incident remains open and under management. Issued by the Duty Manager on duty.',
    status: 'Active',
  },
  {
    id: 'tpl-weather',
    category: 'Weather Advisory Broadcast',
    name: 'Weather Advisory Broadcast',
    subject: '[SDC] Weather Advisory: {incident_title}',
    body:
      'WEATHER ADVISORY\n\n{summary}\n\nLocation(s) affected: {location}\nIssued At: {time}\n\nPlease take appropriate precautions. Issued by the authorised Duty Officer.',
    status: 'Active',
  },
];

const DEFAULT_BROADCAST_MATRIX = [
  { id: 'mat-l1', crisisLevels: ['Level 1'], broadcastType: 'Closure Broadcast', incidentTypes: ['Any'], recipientGroups: ['SDC Crisis Command'], deliveryChannels: ['Email', 'Push Notification'], templateId: 'tpl-closure', status: 'Active' },
  { id: 'mat-l2', crisisLevels: ['Level 2'], broadcastType: 'Closure Broadcast', incidentTypes: ['Any'], recipientGroups: ['SDC Crisis Command'], deliveryChannels: ['Email', 'Push Notification'], templateId: 'tpl-closure', status: 'Active' },
  { id: 'mat-l3', crisisLevels: ['Level 3'], broadcastType: 'Closure Broadcast', incidentTypes: ['Any'], recipientGroups: ['SDC Crisis Command'], deliveryChannels: ['Email', 'Push Notification'], templateId: 'tpl-closure', status: 'Active' },
  { id: 'mat-l4', crisisLevels: ['Level 4'], broadcastType: 'Closure Broadcast', incidentTypes: ['Any'], recipientGroups: ['Beach Operators & F&B Tenants'], deliveryChannels: ['Email'], templateId: 'tpl-closure', status: 'Active' },
  { id: 'mat-l5', crisisLevels: ['Level 5'], broadcastType: 'Closure Broadcast', incidentTypes: ['Any'], recipientGroups: ['Beach Operators & F&B Tenants'], deliveryChannels: ['Email'], templateId: 'tpl-closure', status: 'Active' },
  { id: 'mat-eod-l1', crisisLevels: ['Level 1'], broadcastType: 'End-of-Day Interim Broadcast', incidentTypes: ['Any'], recipientGroups: ['SDC Crisis Command'], deliveryChannels: ['Email', 'Push Notification'], templateId: 'tpl-eod', status: 'Active' },
  { id: 'mat-eod-l2', crisisLevels: ['Level 2'], broadcastType: 'End-of-Day Interim Broadcast', incidentTypes: ['Any'], recipientGroups: ['SDC Crisis Command'], deliveryChannels: ['Email', 'Push Notification'], templateId: 'tpl-eod', status: 'Active' },
  { id: 'mat-eod-l3', crisisLevels: ['Level 3'], broadcastType: 'End-of-Day Interim Broadcast', incidentTypes: ['Any'], recipientGroups: ['SDC Crisis Command'], deliveryChannels: ['Email', 'Push Notification'], templateId: 'tpl-eod', status: 'Active' },
  { id: 'mat-eod-l4', crisisLevels: ['Level 4'], broadcastType: 'End-of-Day Interim Broadcast', incidentTypes: ['Any'], recipientGroups: ['Beach Operators & F&B Tenants'], deliveryChannels: ['Email'], templateId: 'tpl-eod', status: 'Active' },
  { id: 'mat-eod-l5', crisisLevels: ['Level 5'], broadcastType: 'End-of-Day Interim Broadcast', incidentTypes: ['Any'], recipientGroups: ['Beach Operators & F&B Tenants'], deliveryChannels: ['Email'], templateId: 'tpl-eod', status: 'Active' },
  { id: 'mat-weather-1', crisisLevels: ['Any'], broadcastType: 'Weather Advisory Broadcast', incidentTypes: ['Any'], recipientGroups: ['Beach Operators & F&B Tenants', 'Sentosa Cove Residents'], deliveryChannels: ['Email'], templateId: 'tpl-weather', status: 'Active' },
];

const DEFAULT_BROADCAST_CHANNELS = [
  { id: 'ch-email', name: 'Email', details: 'Host: smtp.sdc.gov.sg | Encryption: STARTTLS | Port: 587 (mock gateway)', status: 'Active' },
  { id: 'ch-push', name: 'Push Notification', details: 'In-app System Notifications (CMS / UCS / Staff App)', status: 'Active' },
];

const DEFAULT_BROADCAST_CONFIG = {
  id: 'singleton',
  endOfDayTime: '20:00',
  closureRequiredCategories: ['Operational Incident'],
  eodExcludedCategories: ['Informational / Exercise Records', 'Backdated Incident'],
  eodMinCrisisLevel: 4,
  eodExcludedStatuses: ['Closed', 'Pending Endorsement'],
  eodSchedulerEnabled: true,
};

const DEFAULT_GROUPS = [
  {
    id: 'grp-1',
    name: 'SDC Crisis Command',
    description: 'SDC executive leaders and emergency operational response units.',
    status: 'Active',
    members: [
      { id: 'm-1', name: 'DM Gan', type: 'Internal', email: 'gan.sh@sdc.gov.sg', phone: '+65 9876 5432' },
      { id: 'm-2', name: 'DO Shin Feng', type: 'Internal', email: 'shin.feng@sdc.gov.sg', phone: '+65 9123 4567' },
      { id: 'm-3', name: 'Police Liaison Officer', type: 'External', email: 'spf_liaison@spf.gov.sg', phone: '+65 9991 1111' },
      { id: 'm-4', name: 'SCDF Commander', type: 'External', email: 'scdf_command@scdf.gov.sg', phone: '+65 8888 9999' }
    ]
  },
  {
    id: 'grp-2',
    name: 'Sentosa Cove Residents',
    description: 'Sentosa Cove joint committee, security gates and community liaison representatives.',
    status: 'Active',
    members: [
      { id: 'm-5', name: 'Cove Management Office', type: 'External', email: 'cove_mgr@cove.com.sg', phone: '+65 6789 0123' },
      { id: 'm-6', name: 'North Gate Security Post', type: 'External', email: 'northgate@cove.com.sg', phone: '+65 6789 0124' }
    ]
  },
  {
    id: 'grp-3',
    name: 'Beach Operators & F&B Tenants',
    description: 'Siloso, Palawan, and Tanjong beach food, beverage, and water sports operators.',
    status: 'Active',
    members: [
      { id: 'm-7', name: 'Ola Beach Club Mgr', type: 'External', email: 'mgr@olabeachclub.com', phone: '+65 6276 6522' },
      { id: 'm-8', name: 'Tanjong Beach Club Duty Desk', type: 'External', email: 'desk@tanjongbeachclub.com', phone: '+65 6270 7998' },
      { id: 'm-9', name: 'Rumours Beach Club Leader', type: 'External', email: 'lead@rumours.com.sg', phone: '+65 6970 0625' }
    ]
  }
];

const sampleBroadcasts = [
  // ── 1. Weather Advisory Broadcasts (Canonical type: 'Weather Advisory') ─────
  {
    id: `SEN/BC/${todayDateStr}/001`,
    caseId: `SEN/CI/${todayDateStr}/001`,
    incidentId: `SEN/IR/${todayDateStr}/0001`,
    type: "Weather Advisory",
    recipients: [
      "operations@sentosa.gov.sg",
      "beach_rangers@sentosa.gov.sg",
      "fb_tenants@sentosa.gov.sg"
    ],
    recipientGroups: ["Beach Operators & F&B Tenants", "SDC Crisis Command"],
    templateId: "tpl-weather",
    templateUsed: "Weather Advisory Broadcast",
    subject: "[SDC] Weather Advisory: High Heat & UV Index Alert",
    contentDefault: "WEATHER ADVISORY\n\nHigh Temperature Advisory: Heat index exceeds 34°C. First aid posts fully equipped. Stay hydrated.\n\nLocation(s) affected: Siloso Beach, Palawan Beach, Tanjong Beach\nIssued At: 2026-08-31T10:00:00+07:00\n\nPlease take appropriate precautions. Issued by the authorised Duty Officer.",
    contentDispatched: "High Temperature Advisory: Heat index exceeds 34°C across all beach sectors. First aid posts fully equipped with ice packs and oral rehydration salts. All outdoor staff advised to take 15-minute rest rotations.",
    sentAt: `${todayStr}T10:00:00+07:00`,
    sentBy: "Duty Manager Gan",
    status: "SENT",
    deliveryAttempts: 1,
    deliveryCounts: { sent: 3, delivered: 3, failed: 0, pending: 0 },
    acknowledgedCount: 3,
    dispatchedBy: "Duty Manager Gan",
    dispatchedAt: `${todayStr}T10:00:00+07:00`,
    channels: ["Email", "Push Notification"],
    contentEditConfirmed: true,
    crisisLevel: "Level 3",
    incidentType: "Safety / Medical",
    incidentSubType: "Heat Stroke / Exhaustion",
    incidentTitle: "Medical Emergency: Heat Exhaustion @ Siloso Beach",
    createdAt: `${todayStr}T09:55:00+07:00`,
    queuedBy: "Duty Manager Gan",
    recipientStatus: [
      { email: "operations@sentosa.gov.sg", status: "Delivered", at: `${todayStr}T10:00:05+07:00` },
      { email: "beach_rangers@sentosa.gov.sg", status: "Delivered", at: `${todayStr}T10:00:08+07:00` },
      { email: "fb_tenants@sentosa.gov.sg", status: "Delivered", at: `${todayStr}T10:00:12+07:00` }
    ]
  },
  {
    id: `SEN/BC/${todayDateStr}/002`,
    caseId: `SEN/CI/${todayDateStr}/002`,
    incidentId: `SEN/IR/${todayDateStr}/0002`,
    type: "Weather Advisory",
    recipients: [
      "cablecar_ops@mountfaber.com.sg",
      "beach_rangers@sentosa.gov.sg",
      "island_security@sentosa.gov.sg",
      "ferry_terminal@sentosa.gov.sg"
    ],
    recipientGroups: ["Beach Operators & F&B Tenants", "Sentosa Cove Residents"],
    templateId: "tpl-weather",
    templateUsed: "Weather Advisory Broadcast",
    subject: "[SDC] Weather Advisory: Cat 1 Lightning & Thunderstorm Warning",
    contentDefault: "WEATHER ADVISORY\n\nCategory 1 Lightning Warning active for Sentosa Island and surrounding waters. Suspend outdoor water activities and seek immediate shelter.\n\nLocation(s) affected: Island-wide\nIssued At: 2026-08-31T14:30:00+07:00\n\nPlease take appropriate precautions. Issued by the authorised Duty Officer.",
    contentDispatched: "Category 1 Lightning Warning active for Sentosa Island and surrounding waters. All beach lagoons closed for swimming. Cable car line on temporary standby. Please advise guests to seek shelter at covered pavilions.",
    sentAt: `${todayStr}T14:30:00+07:00`,
    sentBy: "Controller Steve",
    status: "SENT",
    deliveryAttempts: 1,
    deliveryCounts: { sent: 4, delivered: 4, failed: 0, pending: 0 },
    acknowledgedCount: 4,
    dispatchedBy: "Controller Steve",
    dispatchedAt: `${todayStr}T14:30:00+07:00`,
    channels: ["Email", "Push Notification", "SMS"],
    contentEditConfirmed: true,
    crisisLevel: "Level 2",
    incidentType: "Environmental",
    incidentSubType: "Lightning Risk",
    incidentTitle: "Severe Thunderstorm & Lightning Alert",
    createdAt: `${todayStr}T14:25:00+07:00`,
    queuedBy: "Controller Steve",
    recipientStatus: [
      { email: "cablecar_ops@mountfaber.com.sg", status: "Delivered", at: `${todayStr}T14:30:04+07:00` },
      { email: "beach_rangers@sentosa.gov.sg", status: "Delivered", at: `${todayStr}T14:30:06+07:00` },
      { email: "island_security@sentosa.gov.sg", status: "Delivered", at: `${todayStr}T14:30:09+07:00` },
      { email: "ferry_terminal@sentosa.gov.sg", status: "Delivered", at: `${todayStr}T14:30:11+07:00` }
    ]
  },

  // ── 2. Closure Broadcasts (Canonical type: 'Closure') ───────────────────────
  {
    id: `SEN/BC/${todayDateStr}/003`,
    caseId: `SEN/CI/${todayDateStr}/005`,
    incidentId: `SEN/IR/${todayDateStr}/0005`,
    type: "Closure",
    recipients: [
      "crisis_command@sentosa.gov.sg",
      "executive_office@sentosa.gov.sg",
      "spf_sentosa@spf.gov.sg"
    ],
    recipientGroups: ["SDC Crisis Command"],
    templateId: "tpl-closure",
    templateUsed: "Standard Closure Broadcast",
    subject: "[SDC] Incident Closed: VIP Advisory: State Delegation Visit @ Capella",
    contentDefault: `INCIDENT CLOSURE NOTICE\n\nCase ID: SEN/CI/${todayDateStr}/005\nIncident ID: SEN/IR/${todayDateStr}/0005\nTitle: VIP Advisory: State Delegation Visit @ Capella\nClassification: VIP / Escort — State Delegation\nLocation: Capella Singapore, 1 The Knolls\nCrisis Level: Level 2\nClosed At: ${todayStr}T10:00:00+07:00\nClosed By: Duty Manager Gan\n\nSummary: Foreign dignitary motorcade cleared Sentosa Gateway without incident.\n\nThis is an automated closure dispatch from the Sentosa CMS.`,
    contentDispatched: `INCIDENT CLOSURE NOTICE\n\nCase ID: SEN/CI/${todayDateStr}/005\nIncident ID: SEN/IR/${todayDateStr}/0005\nTitle: VIP Advisory: State Delegation Visit @ Capella\nClassification: VIP / Escort — State Delegation\nLocation: Capella Singapore, 1 The Knolls\nCrisis Level: Level 2\nClosed At: ${todayStr}T10:00:00+07:00\nClosed By: Duty Manager Gan\n\nSummary: Foreign dignitary motorcade cleared Sentosa Gateway at 09:55 without incident. All traffic diversions and escort cordons stood down. Regular traffic resumed.`,
    sentAt: `${todayStr}T10:00:00+07:00`,
    sentBy: "Duty Manager Gan",
    status: "SENT",
    deliveryAttempts: 1,
    deliveryCounts: { sent: 3, delivered: 3, failed: 0, pending: 0 },
    acknowledgedCount: 3,
    dispatchedBy: "Duty Manager Gan",
    dispatchedAt: `${todayStr}T10:00:00+07:00`,
    channels: ["Email", "Push Notification"],
    contentEditConfirmed: true,
    crisisLevel: "Level 2",
    incidentType: "Security / VIP",
    incidentSubType: "State Delegation Escort",
    incidentTitle: "VIP Advisory: State Delegation Visit @ Capella",
    createdAt: `${todayStr}T09:58:00+07:00`,
    queuedBy: "Duty Manager Gan",
    recipientStatus: [
      { email: "crisis_command@sentosa.gov.sg", status: "Delivered", at: `${todayStr}T10:00:05+07:00` },
      { email: "executive_office@sentosa.gov.sg", status: "Delivered", at: `${todayStr}T10:00:08+07:00` },
      { email: "spf_sentosa@spf.gov.sg", status: "Delivered", at: `${todayStr}T10:00:10+07:00` }
    ]
  },
  {
    id: `SEN/BC/${todayDateStr}/004`,
    caseId: `SEN/CI/${todayDateStr}/006`,
    incidentId: `SEN/IR/${todayDateStr}/0006`,
    type: "Closure",
    recipients: [
      "crisis_command@sentosa.gov.sg",
      "attractions_ops@sentosa.gov.sg"
    ],
    recipientGroups: ["SDC Crisis Command"],
    templateId: "tpl-closure",
    templateUsed: "Standard Closure Broadcast",
    subject: "[SDC] Incident Closed: Monorail Track 2 Signaling Fault @ Imbiah",
    contentDefault: `INCIDENT CLOSURE NOTICE\n\nCase ID: SEN/CI/${todayDateStr}/006\nIncident ID: SEN/IR/${todayDateStr}/0006\nTitle: Monorail Track 2 Signaling Fault @ Imbiah\nClassification: Transit / Mechanical — Track Signaling\nLocation: Imbiah Station, Platform 2\nCrisis Level: Level 3\nClosed At: ${todayStr}T11:45:00+07:00\nClosed By: Duty Manager Gan\n\nSummary: Signal calibration completed and safety test train cleared. Dual-track service restored.\n\nThis is an automated closure dispatch from the Sentosa CMS.`,
    contentDispatched: `INCIDENT CLOSURE NOTICE\n\nCase ID: SEN/CI/${todayDateStr}/006\nIncident ID: SEN/IR/${todayDateStr}/0006\nTitle: Monorail Track 2 Signaling Fault @ Imbiah\nClassification: Transit / Mechanical — Track Signaling\nLocation: Imbiah Station, Platform 2\nCrisis Level: Level 3\nClosed At: ${todayStr}T11:45:00+07:00\nClosed By: Duty Manager Gan\n\nSummary: Signal calibration completed and safety test train cleared. Dual-track service restored. All station dwell times returned to normal 3-minute headway.`,
    status: "PENDING",
    deliveryAttempts: 0,
    channels: ["Email", "Push Notification"],
    crisisLevel: "Level 3",
    incidentType: "Transit / Operations",
    incidentSubType: "Monorail Fault",
    incidentTitle: "Monorail Track 2 Signaling Fault @ Imbiah",
    createdAt: `${todayStr}T11:45:00+07:00`,
    queuedBy: "Duty Manager Gan"
  },

  // ── 3. End-of-Day Interim Broadcasts (Canonical type: 'End-of-Day') ─────────
  {
    id: `SEN/BC/${todayDateStr}/005`,
    caseId: `SEN/CI/${todayDateStr}/001`,
    incidentId: `SEN/IR/${todayDateStr}/0001`,
    type: "End-of-Day",
    recipients: [
      "crisis_command@sentosa.gov.sg",
      "duty_directors@sentosa.gov.sg"
    ],
    recipientGroups: ["SDC Crisis Command"],
    templateId: "tpl-eod",
    templateUsed: "End-of-Day Interim Broadcast",
    subject: "[SDC] End-of-Day Interim Update: Medical Emergency: Heat Exhaustion @ Siloso Beach",
    contentDefault: "END-OF-DAY INTERIM UPDATE\n\nCase ID: SEN/CI/20260831/001\nIncident ID: SEN/IR/20260831/0001\nTitle: Medical Emergency: Heat Exhaustion @ Siloso Beach\nClassification: Safety / Medical — Heat Stroke / Exhaustion\nLocation: Siloso Beach Front, Tower 2\nCrisis Level: Level 3\nCurrent Status: Live (Assigned)\n\nSummary of progress to date: Female guest stabilized on site by Ranger John and conveyed to SGH via SCDF.\n\nThis incident remains open and under management. Issued by the Duty Manager on duty.",
    contentDispatched: "END-OF-DAY INTERIM UPDATE\n\nCase ID: SEN/CI/20260831/001\nIncident ID: SEN/IR/20260831/0001\nTitle: Medical Emergency: Heat Exhaustion @ Siloso Beach\nClassification: Safety / Medical — Heat Stroke / Exhaustion\nLocation: Siloso Beach Front, Tower 2\nCrisis Level: Level 3\nCurrent Status: Live (Assigned)\n\nCarry-forward Note: Patient (Ms. Tan Mei Ling) admitted to SGH Ward 42 for observation, stable. SDC guest relations officer contacted family. Case remains open pending discharge confirmation tomorrow.",
    sentAt: `${todayStr}T20:15:00+07:00`,
    sentBy: "Duty Manager Gan",
    status: "SENT",
    deliveryAttempts: 1,
    deliveryCounts: { sent: 2, delivered: 2, failed: 0, pending: 0 },
    acknowledgedCount: 2,
    dispatchedBy: "Duty Manager Gan",
    dispatchedAt: `${todayStr}T20:15:00+07:00`,
    channels: ["Email", "Push Notification"],
    contentEditConfirmed: true,
    carryForwardSummary: "Patient admitted to SGH Ward 42 for observation, stable. Awaiting discharge confirmation tomorrow.",
    crisisLevel: "Level 3",
    incidentType: "Safety / Medical",
    incidentSubType: "Heat Stroke / Exhaustion",
    incidentTitle: "Medical Emergency: Heat Exhaustion @ Siloso Beach",
    createdAt: `${todayStr}T20:00:00+07:00`,
    queuedBy: "system",
    eodDate: todayStr,
    recipientStatus: [
      { email: "crisis_command@sentosa.gov.sg", status: "Delivered", at: `${todayStr}T20:15:05+07:00` },
      { email: "duty_directors@sentosa.gov.sg", status: "Delivered", at: `${todayStr}T20:15:08+07:00` }
    ]
  },
  {
    id: `SEN/BC/${todayDateStr}/006`,
    caseId: `SEN/CI/${todayDateStr}/002`,
    incidentId: `SEN/IR/${todayDateStr}/0002`,
    type: "End-of-Day",
    recipients: [
      "crisis_command@sentosa.gov.sg",
      "horticulture_team@sentosa.gov.sg"
    ],
    recipientGroups: ["SDC Crisis Command"],
    templateId: "tpl-eod",
    templateUsed: "End-of-Day Interim Broadcast",
    subject: "[SDC] End-of-Day Interim Update: Environmental: Fallen Branch blocking Imbiah Trail",
    contentDefault: "END-OF-DAY INTERIM UPDATE\n\nCase ID: SEN/CI/20260831/002\nIncident ID: SEN/IR/20260831/0002\nTitle: Environmental: Fallen Branch blocking Imbiah Trail\nClassification: Environmental — Fallen Tree\nLocation: Imbiah Nature Trail, Trail Marker 4\nCrisis Level: Level 4\nCurrent Status: Live (Assigned)\n\nSummary of progress to date: Fallen branch cut down and moved to trail berm. Main pedestrian path reopened with safety cones. Final arboriculture check scheduled at 07:30 tomorrow.\n\nThis incident remains open and under management. Issued by the Duty Manager on duty.",
    contentDispatched: "END-OF-DAY INTERIM UPDATE\n\nCase ID: SEN/CI/20260831/002\nIncident ID: SEN/IR/20260831/0002\nTitle: Environmental: Fallen Branch blocking Imbiah Trail\nClassification: Environmental — Fallen Tree\nLocation: Imbiah Nature Trail, Trail Marker 4\nCrisis Level: Level 4\nCurrent Status: Live (Assigned)\n\nSummary of progress to date: Fallen branch cut down and moved to trail berm. Main pedestrian path reopened with safety cones. Final arboriculture check scheduled at 07:30 tomorrow.\n\nThis incident remains open and under management. Issued by the Duty Manager on duty.",
    status: "PENDING",
    deliveryAttempts: 0,
    channels: ["Email"],
    crisisLevel: "Level 4",
    incidentType: "Environmental",
    incidentSubType: "Fallen Tree",
    incidentTitle: "Environmental: Fallen Branch blocking Imbiah Trail",
    createdAt: `${todayStr}T20:00:00+07:00`,
    queuedBy: "system",
    eodDate: todayStr
  },

  // ── 4. Manual / Operational Advisory Broadcasts (Canonical type: 'Manual') ──
  {
    id: `SEN/BC/${todayDateStr}/007`,
    caseId: `SEN/CI/${todayDateStr}/003`,
    incidentId: `SEN/IR/${todayDateStr}/0003`,
    type: "Manual",
    recipients: [
      "express_monorail_ops@sentosa.gov.sg",
      "island_security@sentosa.gov.sg",
      "guest_services@sentosa.gov.sg"
    ],
    recipientGroups: ["Beach Operators & F&B Tenants", "SDC Crisis Command"],
    templateId: "tpl-manual-ops",
    templateUsed: "Operational Advisory Notice",
    subject: "[SDC Operational Advisory] Temporary Security Cordon @ Beach Station Platform 1",
    contentDefault: "OPERATIONAL ADVISORY\n\nTemporary security cordon established at Beach Station Platform 1 due to unattended item inspection. Please direct incoming guests to Platform 2 for southbound boarding.\n\nIssued by: Controller Steve",
    contentDispatched: "OPERATIONAL ADVISORY\n\nTemporary security cordon established at Beach Station Platform 1 due to unattended bag inspection. Train boarding diverted to Platform 2 with 4 additional rangers assisting crowd flow. K9 team en-route (ETA 10 mins).",
    sentAt: `${todayStr}T10:50:00+07:00`,
    sentBy: "Controller Steve",
    status: "SENT",
    deliveryAttempts: 1,
    deliveryCounts: { sent: 3, delivered: 3, failed: 0, pending: 0 },
    acknowledgedCount: 3,
    dispatchedBy: "Controller Steve",
    dispatchedAt: `${todayStr}T10:50:00+07:00`,
    channels: ["Email", "SMS", "Push Notification"],
    contentEditConfirmed: true,
    crisisLevel: "Level 3",
    incidentType: "Security",
    incidentSubType: "Suspicious Object",
    incidentTitle: "Security: Unattended Bag @ Beach Station Monorail",
    createdAt: `${todayStr}T10:48:00+07:00`,
    queuedBy: "Controller Steve",
    recipientStatus: [
      { email: "express_monorail_ops@sentosa.gov.sg", status: "Delivered", at: `${todayStr}T10:50:04+07:00` },
      { email: "island_security@sentosa.gov.sg", status: "Delivered", at: `${todayStr}T10:50:06+07:00` },
      { email: "guest_services@sentosa.gov.sg", status: "Delivered", at: `${todayStr}T10:50:09+07:00` }
    ]
  },
  {
    id: `SEN/BC/${todayDateStr}/008`,
    caseId: `SEN/CI/${todayDateStr}/005`,
    incidentId: `SEN/IR/${todayDateStr}/0005`,
    type: "Manual",
    recipients: [
      "sentosa_cove_residents@cove.sg",
      "w_hotel_ops@marriott.com",
      "one15_marina@one15.sg"
    ],
    recipientGroups: ["Sentosa Cove Residents"],
    templateId: "tpl-manual-event",
    templateUsed: "Community Event & Noise Advisory",
    subject: "[SDC Community Advisory] Central Beach Fireworks Display & Acoustic Calibration",
    contentDefault: "COMMUNITY ADVISORY\n\nScheduled fireworks and laser calibration at Central Beach Bazaar between 20:45 - 21:05. Low-altitude pyrotechnics with sound dampening measures in effect.\n\nIssued by: Community Relations",
    contentDispatched: "COMMUNITY ADVISORY\n\nSpecial Evening Fireworks Display & Sound Calibration will take place tonight at Central Beach Bazaar between 20:45 - 21:05. Pyrotechnics will be restricted to < 60m altitude to minimize residential impact. Thank you for your kind understanding.",
    sentAt: `${todayStr}T16:00:00+07:00`,
    sentBy: "Duty Manager Gan",
    status: "SENT",
    deliveryAttempts: 1,
    deliveryCounts: { sent: 3, delivered: 3, failed: 0, pending: 0 },
    acknowledgedCount: 3,
    dispatchedBy: "Duty Manager Gan",
    dispatchedAt: `${todayStr}T16:00:00+07:00`,
    channels: ["Email"],
    contentEditConfirmed: true,
    crisisLevel: "Level 5",
    incidentType: "Community / Events",
    incidentSubType: "Fireworks Advisory",
    incidentTitle: "Central Beach Fireworks Display Notice",
    createdAt: `${todayStr}T15:55:00+07:00`,
    queuedBy: "Duty Manager Gan",
    recipientStatus: [
      { email: "sentosa_cove_residents@cove.sg", status: "Delivered", at: `${todayStr}T16:00:04+07:00` },
      { email: "w_hotel_ops@marriott.com", status: "Delivered", at: `${todayStr}T16:00:07+07:00` },
      { email: "one15_marina@one15.sg", status: "Delivered", at: `${todayStr}T16:00:09+07:00` }
    ]
  }
];

// Rich Cases for today
const allCases = [
  { id: `SEN/CI/${todayDateStr}/001`, title: "Medical Emergency: Heat Exhaustion @ Siloso Beach", status: "Active", createdAt: `${todayStr}T09:15:00+07:00`, createdBy: "Controller Steve", closedAt: null, closedBy: null },
  { id: `SEN/CI/${todayDateStr}/002`, title: "Environmental: Fallen Branch blocking Imbiah Trail", status: "Active", createdAt: `${todayStr}T08:30:00+07:00`, createdBy: "Ranger Dave", closedAt: null, closedBy: null },
  { id: `SEN/CI/${todayDateStr}/003`, title: "Security: Unattended Bag @ Beach Station Monorail", status: "Pending Triage", createdAt: `${todayStr}T10:45:00+07:00`, createdBy: "Public Phone", closedAt: null, closedBy: null },
  { id: `SEN/CI/${todayDateStr}/004`, title: "Facilities: Water Leakage @ Palawan Restrooms", status: "Active", createdAt: `${todayStr}T07:20:00+07:00`, createdBy: "Cleaner Supervisor", closedAt: null, closedBy: null },
  { id: `SEN/CI/${todayDateStr}/005`, title: "VIP Advisory: State Delegation Visit @ Capella", status: "Closed", createdAt: `${todayStr}T07:00:00+07:00`, createdBy: "Controller Steve", closedAt: `${todayStr}T10:00:00+07:00`, closedBy: "Duty Manager Gan" },
  { id: `SEN/CI/${todayDateStr}/006`, title: "Transit: Monorail Track 2 Signaling Fault @ Imbiah", status: "Closed", createdAt: `${todayStr}T09:00:00+07:00`, createdBy: "Controller Steve", closedAt: `${todayStr}T11:45:00+07:00`, closedBy: "Duty Manager Gan" },
  { id: `SEN/CI/${todayDateStr}/007`, title: "Crowd Control @ Wings of Time Amphitheatre", status: "Closed", createdAt: `${todayStr}T19:00:00+07:00`, createdBy: "Controller Steve", closedAt: `${todayStr}T21:30:00+07:00`, closedBy: "Duty Manager Gan" }
];

// Rich Incidents for today
const allIncidents = [
  {
    id: `SEN/IR/${todayDateStr}/0001`,
    caseId: `SEN/CI/${todayDateStr}/001`,
    title: "Medical Emergency: Heat Exhaustion @ Siloso Beach",
    dateTime: `${todayStr}T09:15:00+07:00`,
    type: "Safety / Medical",
    subType: "Heat Stroke / Exhaustion",
    priority: "High",
    crisisLevel: 3,
    reporterName: "Lifeguard Station 2",
    requestedBy: "Guest Call-in",
    createdBy: "Controller Steve",
    category: "Operational Incident",
    status: "Live (Assigned)",
    location: { road: "Siloso Beach Walk", building: "Siloso Beach Front", levelSpace: "Tower 2", nearAt: "Lifeguard Post", commonName: "Siloso Beach", postalCode: "098997", tags: ["Beachfront", "Public"], lat: 1.2562, lng: 103.8124 },
    log: [{ eventNumber: 1, date: todayStr, time: "09:15:00", description: "Guest collapsed near Tower 2 showing signs of heat exhaustion." }],
    emergencyServices: { policeAtScene: false, officerNameRank: "", policeIncidentNo: "", classification: "Medical", respondingUnit: "SCDF Ambulance 112", ambulanceScdfType: "SCDF", ambulanceOfficerName: "Staff Sgt. Lee", ambulanceCallSign: "AMB-112", ambulanceRespondingUnit: "Telok Blangah Fire Station", ambulanceArrivalTime: "09:32", hospitalConveyedTo: "Singapore General Hospital" },
    mediaInvolvement: { mediaAtScene: false, mediaName: "", commsNotified: false },
    propertyDamage: { sdcPropertyDamaged: false, description: "" },
    vehiclesInvolved: [], personalInjuries: [{ name: "Tan Mei Ling", address: "Block 124 Bukit Merah View", age: 28, gender: "Female", contactNumber: "+65 9123 4567", clinicHospitalAttended: "Singapore General Hospital", msigFormIssued: true, msigSerialNo: "MSIG-2026-8891", under16: false }],
    personsInvolved: [{ guestOrNonGuest: "Guest", type: "Guest", name: "Tan Mei Ling", address: "Block 124 Bukit Merah View", age: 28, gender: "Female", contactNumber: "+65 9123 4567", roleInvolvement: "Patient", injuryDetails: "Heat exhaustion, dehydration" }],
    cctvBwc: [], summary: "Female guest experienced heat exhaustion during beach run. Stabilized on site by Ranger John and conveyed to SGH via SCDF.", completionRemarks: "", slaveIncidents: [], attachments: [],
    responders: [{ responderId: "Ranger John", assignedBy: "Controller Steve", assignedAt: `${todayStr}T09:18:00+07:00`, status: "Active", lifecycleStatus: "On-Site", acknowledgedAt: `${todayStr}T09:20:00+07:00`, onSiteAt: `${todayStr}T09:25:00+07:00` }],
    assignedTo: ["Ranger John"]
  },
  {
    id: `SEN/IR/${todayDateStr}/0002`,
    caseId: `SEN/CI/${todayDateStr}/002`,
    title: "Environmental: Fallen Branch blocking Imbiah Trail",
    dateTime: `${todayStr}T08:30:00+07:00`,
    type: "Environmental",
    subType: "Fallen Tree",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Ranger Dave",
    requestedBy: "Ranger Field Patrol",
    createdBy: "Ranger Dave",
    category: "Operational Incident",
    status: "Live (Assigned)",
    location: { road: "Imbiah Road", building: "Imbiah Nature Trail", levelSpace: "Trail Marker 4", nearAt: "Cable Car Station", commonName: "Imbiah Trail", postalCode: "099705", tags: ["Nature Area", "Pedestrian"], lat: 1.2550, lng: 103.8180 },
    log: [{ eventNumber: 1, date: todayStr, time: "08:30:00", description: "Large tree branch down across main walkway." }],
    emergencyServices: { policeAtScene: false, officerNameRank: "", policeIncidentNo: "", classification: "", respondingUnit: "", ambulanceScdfType: "None", ambulanceOfficerName: "", ambulanceCallSign: "", ambulanceRespondingUnit: "", ambulanceArrivalTime: "", hospitalConveyedTo: "" },
    mediaInvolvement: { mediaAtScene: false, mediaName: "", commsNotified: false },
    propertyDamage: { sdcPropertyDamaged: true, description: "Minor fence dent" },
    vehiclesInvolved: [], personalInjuries: [], personsInvolved: [], cctvBwc: [],
    summary: "Fallen branch blocking pedestrian footpath at Imbiah Trail. Horticulture team cutting debris.", completionRemarks: "", slaveIncidents: [], attachments: [],
    responders: [{ responderId: "Ranger Alex", assignedBy: "Controller Steve", assignedAt: `${todayStr}T08:35:00+07:00`, status: "Active", lifecycleStatus: "On-Site", acknowledgedAt: `${todayStr}T08:37:00+07:00`, onSiteAt: `${todayStr}T08:45:00+07:00` }],
    assignedTo: ["Ranger Alex"]
  },
  {
    id: `SEN/IR/${todayDateStr}/0003`,
    caseId: `SEN/CI/${todayDateStr}/003`,
    title: "Security: Unattended Bag @ Beach Station Monorail",
    dateTime: `${todayStr}T10:45:00+07:00`,
    type: "Security",
    subType: "Suspicious Object",
    priority: "High",
    crisisLevel: 3,
    reporterName: "Station Master Kumar",
    requestedBy: "Public Phone",
    createdBy: "Controller Steve",
    category: "Operational Incident",
    status: "Live",
    location: { road: "Beach View", building: "Beach Station", levelSpace: "Platform 1", nearAt: "Bench 3", commonName: "Beach Station Monorail", postalCode: "098604", tags: ["Transit", "Public"], lat: 1.2515, lng: 103.8175 },
    log: [{ eventNumber: 1, date: todayStr, time: "10:45:00", description: "Unattended black backpack found under bench at Platform 1." }],
    emergencyServices: { policeAtScene: false, officerNameRank: "", policeIncidentNo: "", classification: "Security", respondingUnit: "SPF K9 Unit (Dispatched)", ambulanceScdfType: "None", ambulanceOfficerName: "", ambulanceCallSign: "", ambulanceRespondingUnit: "", ambulanceArrivalTime: "", hospitalConveyedTo: "" },
    mediaInvolvement: { mediaAtScene: false, mediaName: "", commsNotified: false },
    propertyDamage: { sdcPropertyDamaged: false, description: "" },
    vehiclesInvolved: [], personalInjuries: [], personsInvolved: [], cctvBwc: [],
    summary: "Unattended backpack under Platform 1 bench. Platform cordoned off; trains diverted to Platform 2.", completionRemarks: "", slaveIncidents: [], attachments: [],
    responders: [], assignedTo: []
  },
  {
    id: `SEN/IR/${todayDateStr}/0004`,
    caseId: `SEN/CI/${todayDateStr}/004`,
    title: "Facilities: Water Leakage @ Palawan Restrooms",
    dateTime: `${todayStr}T07:20:00+07:00`,
    type: "Facilities",
    subType: "Plumbing Leak",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Cleaner Supervisor Wong",
    requestedBy: "Facilities Hotline",
    createdBy: "Cleaner Supervisor",
    category: "Operational Incident",
    status: "Live",
    location: { road: "Palawan Beach Walk", building: "Palawan Central Restrooms", levelSpace: "Block B", nearAt: "Lifeguard Post 3", commonName: "Palawan Restrooms", postalCode: "098234", tags: ["Facilities", "Restrooms"], lat: 1.2488, lng: 103.8225 },
    log: [{ eventNumber: 1, date: todayStr, time: "07:20:00", description: "Water leaking from ceiling drywall in female restroom. Water valve isolated." }],
    emergencyServices: { policeAtScene: false, officerNameRank: "", policeIncidentNo: "", classification: "", respondingUnit: "", ambulanceScdfType: "None", ambulanceOfficerName: "", ambulanceCallSign: "", ambulanceRespondingUnit: "", ambulanceArrivalTime: "", hospitalConveyedTo: "" },
    mediaInvolvement: { mediaAtScene: false, mediaName: "", commsNotified: false },
    propertyDamage: { sdcPropertyDamaged: true, description: "Ceiling drywall water damage" },
    vehiclesInvolved: [], personalInjuries: [], personsInvolved: [], cctvBwc: [],
    summary: "Ceiling water pipe burst in Palawan Restrooms Block B. Plumber dispatched to repair.", completionRemarks: "", slaveIncidents: [], attachments: [],
    responders: [], assignedTo: []
  },
  {
    id: `SEN/IR/${todayDateStr}/0005`,
    caseId: `SEN/CI/${todayDateStr}/005`,
    title: "VIP Advisory: State Delegation Visit @ Capella",
    dateTime: `${todayStr}T07:00:00+07:00`,
    type: "Security / VIP",
    subType: "State Delegation Escort",
    priority: "High",
    crisisLevel: 2,
    reporterName: "SPF Protocol Officer",
    requestedBy: "Ministry of Foreign Affairs",
    createdBy: "Controller Steve",
    category: "Operational Incident",
    status: "Closed",
    location: { road: "The Knolls", building: "Capella Singapore", levelSpace: "Grand Ballroom & Lobby", nearAt: "Main Entrance", commonName: "Capella Hotel", postalCode: "098297", tags: ["VIP", "Security"], lat: 1.2494, lng: 103.8252 },
    log: [{ eventNumber: 1, date: todayStr, time: "07:00:00", description: "VIP motorcade arrived via Sentosa Gateway." }],
    emergencyServices: { policeAtScene: true, officerNameRank: "Insp. Kelvin Teo", policeIncidentNo: "SPF/SEN/20260831/0088", classification: "VIP Escort", respondingUnit: "SPF Traffic & Sentosa Division", ambulanceScdfType: "None", ambulanceOfficerName: "", ambulanceCallSign: "", ambulanceRespondingUnit: "", ambulanceArrivalTime: "", hospitalConveyedTo: "" },
    mediaInvolvement: { mediaAtScene: false, mediaName: "", commsNotified: false },
    propertyDamage: { sdcPropertyDamaged: false, description: "" },
    vehiclesInvolved: [], personalInjuries: [], personsInvolved: [], cctvBwc: [],
    summary: "High-level state delegation bilateral meeting at Capella. Concluded safely without traffic disruption.", completionRemarks: "Visit completed successfully. Escort stood down.", closedAt: `${todayStr}T10:00:00+07:00`, closedBy: "Duty Manager Gan", slaveIncidents: [], attachments: [],
    responders: [], assignedTo: []
  },
  {
    id: `SEN/IR/${todayDateStr}/0006`,
    caseId: `SEN/CI/${todayDateStr}/006`,
    title: "Transit: Monorail Track 2 Signaling Fault @ Imbiah",
    dateTime: `${todayStr}T09:00:00+07:00`,
    type: "Transit / Operations",
    subType: "Monorail Fault",
    priority: "Normal",
    crisisLevel: 3,
    reporterName: "Monorail Control Lead",
    requestedBy: "Monorail Operations",
    createdBy: "Controller Steve",
    category: "Operational Incident",
    status: "Closed",
    location: { road: "Imbiah Road", building: "Imbiah Monorail Station", levelSpace: "Platform 2", nearAt: "Switching Point 4", commonName: "Imbiah Station", postalCode: "099705", tags: ["Transit", "Monorail"], lat: 1.2550, lng: 103.8180 },
    log: [{ eventNumber: 1, date: todayStr, time: "09:00:00", description: "Track 2 signal sensor calibration warning." }],
    emergencyServices: { policeAtScene: false, officerNameRank: "", policeIncidentNo: "", classification: "", respondingUnit: "", ambulanceScdfType: "None", ambulanceOfficerName: "", ambulanceCallSign: "", ambulanceRespondingUnit: "", ambulanceArrivalTime: "", hospitalConveyedTo: "" },
    mediaInvolvement: { mediaAtScene: false, mediaName: "", commsNotified: false },
    propertyDamage: { sdcPropertyDamaged: false, description: "" },
    vehiclesInvolved: [], personalInjuries: [], personsInvolved: [], cctvBwc: [],
    summary: "Track 2 signaling sensor recalibrated. Safety run passed successfully.", completionRemarks: "Dual track operation resumed.", closedAt: `${todayStr}T11:45:00+07:00`, closedBy: "Duty Manager Gan", slaveIncidents: [], attachments: [],
    responders: [], assignedTo: []
  }
];

// Rich Tasks for today
const allTasks = [
  { id: `SEN/TA/${todayDateStr}/001`, caseId: `SEN/CI/${todayDateStr}/001`, title: "Conduct Post-Emergency Heat Check at Siloso First Aid Post", description: "Replenish oral rehydration salts and check ice packs supply.", assignee: "Ranger John", priority: "High", dueDate: `${todayStr}T17:00:00+07:00`, status: "In Progress", createdBy: "Controller Steve", createdDate: `${todayStr}T09:30:00+07:00`, attachments: [] },
  { id: `SEN/TA/${todayDateStr}/002`, caseId: `SEN/CI/${todayDateStr}/002`, title: "Inspect Imbiah Trail Tree Canopy for Loose Branches", description: "Arboriculture team visual inspection along Trail Markers 1-8.", assignee: "Horticulture Team", priority: "Normal", dueDate: `${todayStr}T18:00:00+07:00`, status: "Assigned", createdBy: "Ranger Dave", createdDate: `${todayStr}T09:00:00+07:00`, attachments: [] },
  { id: `SEN/TA/${todayDateStr}/003`, caseId: `SEN/CI/${todayDateStr}/004`, title: "Replace Ruptured Water Valve Joint in Palawan Restroom Block B", description: "Plumber replacement of 2-inch PVC junction.", assignee: "Facilities Plumber", priority: "Normal", dueDate: `${todayStr}T20:00:00+07:00`, status: "In Progress", createdBy: "Cleaner Supervisor", createdDate: `${todayStr}T08:00:00+07:00`, attachments: [] },
  { id: `SEN/TA/${todayDateStr}/004`, caseId: `SEN/CI/${todayDateStr}/005`, title: "Collect Traffic Cones & Stand Down Security Perimeter @ Capella", description: "Return all temporary barriers to South Zone depot.", assignee: "Traffic Team", priority: "Low", dueDate: `${todayStr}T12:00:00+07:00`, status: "Closed", createdBy: "Controller Steve", createdDate: `${todayStr}T07:30:00+07:00`, closedAt: `${todayStr}T11:00:00+07:00`, closedBy: "Traffic Lead", attachments: [] }
];

// Rich Events for today
const allEvents = [
  { id: `EVT-2026-0001`, name: "Siloso Beach Sunset Acoustic Session", startDateTime: `${todayStr}T17:00:00+07:00`, endDateTime: `${todayStr}T21:00:00+07:00`, location: { road: "Siloso Beach Walk", building: "Siloso Beach Stage", levelSpace: "Main Deck", nearAt: "Ola Beach Club", commonName: "Siloso Beach", postalCode: "098997", tags: ["Entertainment", "Public"], lat: 1.2562, lng: 103.8124 }, type: "Entertainment", description: "Live acoustic performances with crowd control marshals deployed.", createdBy: "Events Team", createdAt: `${todayStr}T08:00:00+07:00` },
  { id: `EVT-2026-0002`, name: "Central Beach Fireworks & Light Show", startDateTime: `${todayStr}T20:45:00+07:00`, endDateTime: `${todayStr}T21:05:00+07:00`, location: { road: "Beach View", building: "Central Beach Bazaar", levelSpace: "Promenade", nearAt: "Wings of Time", commonName: "Central Beach", postalCode: "098604", tags: ["Fireworks", "Public"], lat: 1.2515, lng: 103.8175 }, type: "Fireworks", description: "Nightly pyrotechnic display with acoustic dampening.", createdBy: "Events Team", createdAt: `${todayStr}T08:00:00+07:00` }
];

async function seedCompleteDatabase() {
  console.log(`Connecting to MongoDB Atlas...`);
  const client = new MongoClient(uri);
  await client.connect();

  const dbsToSeed = [dbName || 'sentosa-cms-dev', 'sentosa-cms'];

  for (const name of dbsToSeed) {
    try {
      const db = client.db(name);
      console.log(`\n========================================`);
      console.log(`Seeding Database: "${db.databaseName}"`);
      console.log(`========================================`);

      // 1. Templates
      const tplCol = db.collection('broadcastTemplates');
      for (const tpl of DEFAULT_BROADCAST_TEMPLATES) await tplCol.replaceOne({ id: tpl.id }, tpl, { upsert: true });

      // 2. Matrix
      const matCol = db.collection('broadcastMatrix');
      for (const rule of DEFAULT_BROADCAST_MATRIX) await matCol.replaceOne({ id: rule.id }, rule, { upsert: true });

      // 3. Channels
      const chCol = db.collection('broadcastChannels');
      for (const ch of DEFAULT_BROADCAST_CHANNELS) await chCol.replaceOne({ id: ch.id }, ch, { upsert: true });

      // 4. Config
      const cfgCol = db.collection('broadcastConfig');
      await cfgCol.replaceOne({ id: 'singleton' }, DEFAULT_BROADCAST_CONFIG, { upsert: true });

      // 5. Groups
      const grpCol = db.collection('distributionGroups');
      for (const grp of DEFAULT_GROUPS) await grpCol.replaceOne({ id: grp.id }, grp, { upsert: true });

      // 6. Cases
      const casesCol = db.collection('cases');
      for (const c of allCases) await casesCol.replaceOne({ id: c.id }, c, { upsert: true });

      // 7. Incidents
      const incCol = db.collection('incidents');
      for (const inc of allIncidents) await incCol.replaceOne({ id: inc.id }, inc, { upsert: true });

      // 8. Tasks
      const tasksCol = db.collection('tasks');
      for (const t of allTasks) await tasksCol.replaceOne({ id: t.id }, t, { upsert: true });

      // 9. Events
      const eventsCol = db.collection('events');
      for (const ev of allEvents) await eventsCol.replaceOne({ id: ev.id }, ev, { upsert: true });

      // 10. Broadcasts
      const bcCol = db.collection('broadcasts');
      for (const bc of sampleBroadcasts) await bcCol.replaceOne({ id: bc.id }, bc, { upsert: true });

      console.log(`✓ Synchronized all collections in "${db.databaseName}":`);
      console.log(`  - ${allCases.length} Cases (Today: ${todayStr})`);
      console.log(`  - ${allIncidents.length} Incidents`);
      console.log(`  - ${allTasks.length} Tasks`);
      console.log(`  - ${allEvents.length} Events (Today)`);
      console.log(`  - ${sampleBroadcasts.length} Broadcast Records across all Types (Pending + Sent)`);

    } catch (err) {
      console.error(`Error seeding ${name}:`, err);
    }
  }

  await client.close();
}

seedCompleteDatabase();
