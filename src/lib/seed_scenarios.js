const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

const defaultSubStructures = {
  "emergencyServices": {
    "policeAtScene": false,
    "officerNameRank": "",
    "policeIncidentNo": "",
    "classification": "",
    "respondingUnit": "",
    "ambulanceScdfType": "",
    "ambulanceOfficerName": "",
    "ambulanceCallSign": "",
    "ambulanceRespondingUnit": "",
    "ambulanceArrivalTime": "",
    "hospitalConveyedTo": ""
  },
  "mediaInvolvement": {
    "mediaAtScene": false,
    "mediaName": "",
    "commsNotified": false
  },
  "propertyDamage": {
    "sdcPropertyDamaged": false,
    "description": ""
  },
  "vehiclesInvolved": [],
  "personalInjuries": [],
  "personsInvolved": [],
  "cctvBwc": [],
  "slaveIncidents": []
};

const demoCases = [
  {
    "id": "CASE-DEMO-STANDARD",
    "title": "Demo: Beach Station Water Leak",
    "status": "Closed",
    "createdAt": "2026-06-12T08:00:00+07:00",
    "createdBy": "system",
    "closedAt": "2026-06-12T09:00:00+07:00",
    "closedBy": "DM Gan"
  },
  {
    "id": "CASE-DEMO-PROACTIVE",
    "title": "Demo: Unattended Bag Spotted",
    "status": "Closed",
    "createdAt": "2026-06-12T09:00:00+07:00",
    "createdBy": "Ranger Dave",
    "closedAt": "2026-06-12T09:20:00+07:00",
    "closedBy": "Ranger Dave"
  },
  {
    "id": "CASE-DEMO-BACKDATED",
    "title": "Demo: Snake Encounter (Backdated)",
    "status": "Closed",
    "createdAt": "2026-06-12T08:30:00+07:00",
    "createdBy": "Controller Steve",
    "closedAt": "2026-06-12T08:35:00+07:00",
    "closedBy": "Controller Steve"
  },
  {
    "id": "CASE-DEMO-ONGOING",
    "title": "Demo: Siloso Beach Outage",
    "status": "Active",
    "createdAt": "2026-06-12T10:00:00+07:00",
    "createdBy": "system",
    "closedAt": null,
    "closedBy": null
  },
  {
    "id": "CASE-DEMO-OPERATIONAL",
    "title": "Demo: SDC HQ Fire Drill",
    "status": "Closed",
    "createdAt": "2026-06-12T14:00:00+07:00",
    "createdBy": "Safety Coordinator",
    "closedAt": "2026-06-12T14:20:00+07:00",
    "closedBy": "Safety Coordinator"
  },
  {
    "id": "CASE-DEMO-RETURNED",
    "title": "Demo: Missing Child (Returned)",
    "status": "Active",
    "createdAt": "2026-06-12T11:00:00+07:00",
    "createdBy": "Controller Steve",
    "closedAt": null,
    "closedBy": null
  }
];

const demoIncidents = [
  {
    "id": "SEN/IR/20260612/9001",
    "caseId": "CASE-DEMO-STANDARD",
    "title": "Demo: Beach Station Water Leak",
    "dateTime": "2026-06-12T08:00:00+07:00",
    "type": "Facilities",
    "subType": "Water Leak",
    "priority": "Medium",
    "crisisLevel": 4,
    "reporterName": "Guest Services Desk",
    "requestedBy": "Guest Call-in",
    "createdBy": "system",
    "status": "Closed",
    "assignedTo": "Ranger John",
    "location": {
      "road": "Siloso Beach Walk",
      "building": "Beach Station",
      "levelSpace": "Level 1 Escalator Area",
      "postalCode": "098997",
      "tags": ["Beachfront"],
      "lat": 1.25,
      "lng": 103.83
    },
    "log": [
      { "eventNumber": 1, "date": "2026-06-12", "time": "08:00:00", "description": "Incident logged under Case ID CASE-DEMO-STANDARD. Classification: Facilities - Water Leak." },
      { "eventNumber": 2, "date": "2026-06-12", "time": "08:05:00", "description": "Dispatch requested. Responder assigned: Ranger John." },
      { "eventNumber": 3, "date": "2026-06-12", "time": "08:10:00", "description": "Responder John acknowledged dispatch." },
      { "eventNumber": 4, "date": "2026-06-12", "time": "08:15:00", "description": "Responder John confirmed arrival on-site. Temporary wet floor sign deployed." },
      { "eventNumber": 5, "date": "2026-06-12", "time": "08:45:00", "description": "Cleaning crew cleared wet patch. Aircon technician patched pipe." },
      { "eventNumber": 6, "date": "2026-06-12", "time": "08:50:00", "description": "Responder John marked ground activities completed. Remarks: Leak isolated and area dried." },
      { "eventNumber": 7, "date": "2026-06-12", "time": "09:00:00", "description": "Incident approved and closed by Duty Manager Gan." }
    ],
    "summary": "Water leakage from Level 2 air-conditioning duct at Beach Station, causing floor wetness. Closed after repair and review.",
    "completionRemarks": "Leak isolated and area dried.",
    "category": "Operational Incident",
    ...defaultSubStructures
  },
  {
    "id": "SEN/IR/20260612/9002",
    "caseId": "CASE-DEMO-PROACTIVE",
    "title": "Demo: Unattended Bag Spotted",
    "dateTime": "2026-06-12T09:00:00+07:00",
    "type": "Security",
    "subType": "Abandoned Property",
    "priority": "Low",
    "crisisLevel": 4,
    "reporterName": "Ranger Dave",
    "requestedBy": "Ranger Field Patrol",
    "createdBy": "Ranger Dave",
    "status": "Closed",
    "assignedTo": "Ranger Dave",
    "location": {
      "road": "Palawan Beach Walk",
      "building": "Palawan Food Court",
      "levelSpace": "Seating area",
      "postalCode": "098997",
      "tags": ["Beachfront"],
      "lat": 1.25,
      "lng": 103.83
    },
    "log": [
      { "eventNumber": 1, "date": "2026-06-12", "time": "09:00:00", "description": "Spotted unattended backpack near Palawan Beach food court during routine patrol. Proactive case initialized." },
      { "eventNumber": 2, "date": "2026-06-12", "time": "09:02:00", "description": "Ranger Dave established safety cordon and monitored backpack." },
      { "eventNumber": 3, "date": "2026-06-12", "time": "09:15:00", "description": "Owner returned to claim backpack. Verified details and released property." },
      { "eventNumber": 4, "date": "2026-06-12", "time": "09:20:00", "description": "Incident marked completed and closed on-site." }
    ],
    "summary": "Ranger Dave proactively spotted and resolved an unattended backpack near Palawan Beach on patrol. Returned bag to owner.",
    "completionRemarks": "Bag returned to verified owner. Cordon removed.",
    "category": "Operational Incident",
    ...defaultSubStructures
  },
  {
    "id": "SEN/IR/20260612/9003",
    "caseId": "CASE-DEMO-BACKDATED",
    "title": "Demo: Snake Encounter (Backdated)",
    "dateTime": "2026-06-11T14:30:00+07:00",
    "type": "Safety / Medical",
    "subType": "Animal Encounter",
    "priority": "Medium",
    "crisisLevel": 4,
    "reporterName": "Trail Ranger",
    "requestedBy": "Ranger Field Patrol",
    "createdBy": "Controller Steve",
    "status": "Closed",
    "assignedTo": "External Pest Control",
    "location": {
      "road": "Imbiah Trail",
      "building": "Main footpath",
      "levelSpace": "Near ticket booth",
      "postalCode": "098997",
      "tags": ["Nature Area"],
      "lat": 1.25,
      "lng": 103.83
    },
    "log": [
      { "eventNumber": 1, "date": "2026-06-11", "time": "14:30:00", "description": "[BACKDATED EVENT] Python spotted crossing footpath. Pest control vendor contacted." },
      { "eventNumber": 2, "date": "2026-06-11", "time": "15:00:00", "description": "[BACKDATED EVENT] Pest control arrived, successfully relocated snake, path cleared." },
      { "eventNumber": 3, "date": "2026-06-12", "time": "08:30:00", "description": "Delayed log entry filed in CMS by Controller Steve. Justification: Late receipt of contractor capture report." },
      { "eventNumber": 4, "date": "2026-06-12", "time": "08:35:00", "description": "Incident closed immediately as historical record." }
    ],
    "summary": "Delayed log entry of yesterday's Python crossing Imbiah Trail. Relocated by pest control.",
    "completionRemarks": "Relocated snake, path cleared.",
    "category": "Backdated Incident",
    ...defaultSubStructures
  },
  {
    "id": "SEN/IR/20260612/9004",
    "caseId": "CASE-DEMO-ONGOING",
    "title": "Demo: Siloso Beach Outage",
    "dateTime": "2026-06-12T10:00:00+07:00",
    "type": "Facilities",
    "subType": "Power Outage",
    "priority": "High",
    "crisisLevel": 4,
    "reporterName": "UCS Alarm System",
    "requestedBy": "UCS Power Feed",
    "createdBy": "system",
    "status": "Live (On-Site)",
    "assignedTo": "Ranger Sarah",
    "location": {
      "road": "Siloso Beach Walk",
      "building": "Kiosk Sector 3",
      "levelSpace": "All kiosks",
      "postalCode": "098997",
      "tags": ["Beachfront"],
      "lat": 1.25,
      "lng": 103.83
    },
    "log": [
      { "eventNumber": 1, "date": "2026-06-12", "time": "10:00:00", "description": "Outage alert triggered for Siloso Kiosk zone. Incident created." },
      { "eventNumber": 2, "date": "2026-06-12", "time": "10:05:00", "description": "Ranger Sarah dispatched to kiosk site." },
      { "eventNumber": 3, "date": "2026-06-12", "time": "10:12:00", "description": "Ranger Sarah confirmed arrival. Blackout affecting 3 commercial retail stalls." },
      { "eventNumber": 4, "date": "2026-06-12", "time": "10:20:00", "description": "[MANUAL] [Ranger Log] Kiosk managers briefed, safety advisories issued." },
      { "eventNumber": 5, "date": "2026-06-12", "time": "10:30:00", "description": "Public sector warning broadcast issued to surrounding retail properties." },
      { "eventNumber": 6, "date": "2026-06-12", "time": "11:00:00", "description": "[MANUAL] [Ranger Log] SP Group electricians arrived on-site and began isolation checks." }
    ],
    "summary": "Active power failure affecting multiple kiosks on Siloso Beach Walk. SP Group technicians investigating on-site.",
    "completionRemarks": "",
    "category": "Operational Incident",
    ...defaultSubStructures
  },
  {
    "id": "SEN/IR/20260612/9005",
    "caseId": "CASE-DEMO-OPERATIONAL",
    "title": "Demo: SDC HQ Fire Drill",
    "dateTime": "2026-06-12T14:00:00+07:00",
    "type": "Safety / Medical",
    "subType": "Others",
    "priority": "Low",
    "crisisLevel": 4,
    "reporterName": "Safety Dept",
    "requestedBy": "IIOC Controller",
    "createdBy": "Safety Coordinator",
    "status": "Closed",
    "assignedTo": "HQ Fire Wardens",
    "location": {
      "road": "Sentosa Gateway",
      "building": "SDC HQ Building",
      "levelSpace": "All floors",
      "postalCode": "098269",
      "tags": ["Drill", "Office"],
      "lat": 1.25,
      "lng": 103.83
    },
    "log": [
      { "eventNumber": 1, "date": "2026-06-12", "time": "14:00:00", "description": "HQ Evacuation Drill siren triggered. Drill commenced." },
      { "eventNumber": 2, "date": "2026-06-12", "time": "14:05:00", "description": "Floor fire wardens cleared all offices. Assembly check started." },
      { "eventNumber": 3, "date": "2026-06-12", "time": "14:15:00", "description": "Drill completed successfully. Evacuation duration: 5m 12s." },
      { "eventNumber": 4, "date": "2026-06-12", "time": "14:20:00", "description": "Compliance report uploaded. Drill closed." }
    ],
    "summary": "Evacuation fire drill conducted at SDC headquarters building. Evacuation time logged: 5m 12s.",
    "completionRemarks": "Fire drill completed successfully. Evacuation time: 5m 12s.",
    "category": "Informational / Exercise Records",
    ...defaultSubStructures
  },
  {
    "id": "SEN/IR/20260612/9006",
    "caseId": "CASE-DEMO-RETURNED",
    "title": "Demo: Missing Child (Returned)",
    "dateTime": "2026-06-12T11:00:00+07:00",
    "type": "Safety / Medical",
    "subType": "Others",
    "priority": "High",
    "crisisLevel": 3,
    "reporterName": "Mother (Mrs. Tan)",
    "requestedBy": "Walk-in Guest",
    "createdBy": "Controller Steve",
    "status": "Returned",
    "assignedTo": "Ranger John",
    "location": {
      "road": "Siloso Beach Walk",
      "building": "Siloso Restrooms",
      "levelSpace": "Immediate vicinity",
      "postalCode": "098997",
      "tags": ["Beachfront"],
      "lat": 1.25,
      "lng": 103.83
    },
    "log": [
      { "eventNumber": 1, "date": "2026-06-12", "time": "11:00:00", "description": "Mrs. Tan reported 6-year-old son missing near restrooms. Search dispatch initiated." },
      { "eventNumber": 2, "date": "2026-06-12", "time": "11:02:00", "description": "Ranger John dispatched for foot patrol sweep." },
      { "eventNumber": 3, "date": "2026-06-12", "time": "11:08:00", "description": "Ranger John acknowledged dispatch." },
      { "eventNumber": 4, "date": "2026-06-12", "time": "11:15:00", "description": "Ranger John arrived on-site and commenced sweeps." },
      { "eventNumber": 5, "date": "2026-06-12", "time": "11:45:00", "description": "Child located safe by Ranger John and reunited with mother." },
      { "eventNumber": 6, "date": "2026-06-12", "time": "11:50:00", "description": "Ranger John submitted ground resolution report." },
      { "eventNumber": 7, "date": "2026-06-12", "time": "11:55:00", "description": "Incident RETURNED by Duty Manager Gan. Reason: Please attach BWC footage bookmark and confirm police reporting status." }
    ],
    "summary": "A 6-year-old child reported missing near the Siloso Beach restrooms. The report was returned by supervisor for missing BWC footage bookmarks.",
    "completionRemarks": "Child reunited safe. Report returned by DM for BWC attachment.",
    "category": "Operational Incident",
    ...defaultSubStructures
  }
];

const demoOccurrences = [
  {
    "id": "OCC-DEMO-9001",
    "caseId": "CASE-DEMO-STANDARD",
    "user": "Ranger John",
    "dateTime": "2026-06-12T08:50:00+07:00",
    "topic": "Escalator leak resolved",
    "content": "Assisted cleaning crew and isolated AC duct leak at Beach Station L1 escalator. Cleaned up water."
  },
  {
    "id": "OCC-DEMO-9002",
    "caseId": "CASE-DEMO-PROACTIVE",
    "user": "Ranger Dave",
    "dateTime": "2026-06-12T09:20:00+07:00",
    "topic": "Patrol: Unattended Bag Released",
    "content": "Released unattended backpack containing snorkeling gear to verified owner during Palawan Beach patrol."
  },
  {
    "id": "OCC-DEMO-9003",
    "caseId": "CASE-DEMO-BACKDATED",
    "user": "Controller Steve",
    "dateTime": "2026-06-12T08:30:00+07:00",
    "topic": "Backdated Python Capture Logged",
    "content": "Pest control relocated a python yesterday afternoon at Imbiah footpath. Logged historical entry in system."
  },
  {
    "id": "OCC-DEMO-9005",
    "caseId": "CASE-DEMO-OPERATIONAL",
    "user": "Safety Coordinator",
    "dateTime": "2026-06-12T14:20:00+07:00",
    "topic": "SDC HQ Evacuation Drill Completed",
    "content": "SDC headquarters building successfully completed annual evacuation drill. All fire wardens cleared floors in 5m 12s."
  },
  {
    "id": "OCC-DEMO-9006",
    "caseId": "CASE-DEMO-RETURNED",
    "user": "DM Gan",
    "dateTime": "2026-06-12T11:55:00+07:00",
    "topic": "Report Returned: Missing Child",
    "content": "Returned Ranger report for Mrs Tan's missing child case due to missing BWC backup video bookmarks."
  }
];

const demoTasks = [
  {
    "id": "TASK-DEMO-9004",
    "caseId": "CASE-DEMO-ONGOING",
    "title": "Notify Retail Operations team",
    "description": "Call operations lead to verify backups for cold-storage facilities at affected kiosks.",
    "assignee": "Ranger Sarah",
    "priority": "High",
    "dueDate": "2026-06-12T12:00:00+07:00",
    "status": "In Progress",
    "createdBy": "Controller Steve",
    "createdDate": "2026-06-12T10:05:00+07:00",
    "attachments": []
  }
];

const demoFaults = [
  {
    "id": "SEN/FR/20260612/9001",
    "caseId": "CASE-DEMO-STANDARD",
    "faultType": "Facilities",
    "faultSubType": "Water Leak",
    "location": {
      "road": "Siloso Beach Walk",
      "building": "Beach Station",
      "levelSpace": "Level 1 Escalator Area",
      "postalCode": "098997",
      "tags": ["Beachfront"],
      "lat": 1.25,
      "lng": 103.83
    },
    "description": "Water leakage from Level 2 air-conditioning duct at Beach Station.",
    "attachments": [],
    "status": "Closed",
    "cmmsTicketId": "CMMS-DEMO-9001",
    "createdBy": "system",
    "createdAt": "2026-06-12T08:00:00+07:00",
    "submittedAt": "2026-06-12T08:00:00+07:00"
  }
];

const demoBroadcasts = [
  {
    "id": "BC-DEMO-9004",
    "caseId": "CASE-DEMO-ONGOING",
    "templateName": "Retail Outage Notice",
    "channel": "SMS / Email",
    "recipientGroup": "Siloso Beach Retailers",
    "subject": "Siloso Beach Walk Outage Warning",
    "message": "Dear tenants, a sectional power outage is currently under investigation in Siloso Beach Walk. Power restoration is expected within 2 hours. Thank you.",
    "status": "SENT",
    "sentBy": "Controller Steve",
    "sentAt": "2026-06-12T10:30:00+07:00"
  }
];

try {
  if (!fs.existsSync(DB_PATH)) {
    console.error('db.json not found at: ' + DB_PATH);
    process.exit(1);
  }

  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  const db = JSON.parse(raw);

  // Helper to merge arrays uniquely by ID
  const mergeById = (targetArr, demoArr) => {
    const map = new Map(targetArr.map(item => [item.id, item]));
    demoArr.forEach(item => map.set(item.id, item));
    return Array.from(map.values());
  };

  db.cases = mergeById(db.cases || [], demoCases);
  db.incidents = mergeById(db.incidents || [], demoIncidents);
  db.occurrences = mergeById(db.occurrences || [], demoOccurrences);
  db.tasks = mergeById(db.tasks || [], demoTasks);
  db.faults = mergeById(db.faults || [], demoFaults);
  db.broadcasts = mergeById(db.broadcasts || [], demoBroadcasts);

  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  console.log('Successfully seeded 6 demo scenarios in db.json with complete sub-structures!');
} catch (err) {
  console.error('Failed to seed scenarios:', err);
  process.exit(1);
}
