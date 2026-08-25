import fs from 'fs';
import path from 'path';

// TypeScript Interfaces mapping to SDC CMS database schema
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
  msigSerialNo?: string;
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
  status: string;
}

export interface Incident {
  id: string;
  caseId: string;
  title: string;
  dateTime: string;
  type: string;
  subType: string;
  priority: string;
  crisisLevel: number;
  reporterName: string;
  requestedBy: string;
  createdBy: string;
  category: string;
  status: string;
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
  slaveIncidents: SlaveIncident[];
  acknowledgedAt?: string;
  onSiteAt?: string;
  completedAt?: string;
  closedAt?: string;
  closedBy?: string;
}

const defaultSubStructures = {
  emergencyServices: {
    policeAtScene: false,
    officerNameRank: "",
    policeIncidentNo: "",
    classification: "",
    respondingUnit: "",
    ambulanceScdfType: "",
    ambulanceOfficerName: "",
    ambulanceCallSign: "",
    ambulanceRespondingUnit: "",
    ambulanceArrivalTime: "",
    hospitalConveyedTo: ""
  },
  mediaInvolvement: {
    mediaAtScene: false,
    mediaName: "",
    commsNotified: false
  },
  propertyDamage: {
    sdcPropertyDamaged: false,
    description: ""
  },
  vehiclesInvolved: [],
  personalInjuries: [],
  personsInvolved: [],
  cctvBwc: [],
  slaveIncidents: [],
  completionRemarks: ""
};

// 30 realistic Sentosa operational incident scenarios covering all statuses, categories, sources, and crisis levels
export const mockIncidents: Incident[] = [
  // STANDARD INCIDENTS
  {
    id: "SEN/IR/20260612/8001",
    caseId: "CASE-DEMO-8001",
    title: "Siloso Restroom Slip & Fall",
    dateTime: "2026-06-12T08:15:00+07:00",
    type: "Safety / Medical",
    subType: "Slip & Fall",
    priority: "High",
    crisisLevel: 4,
    reporterName: "Mrs. Chan (Public)",
    requestedBy: "Public Phone",
    createdBy: "Controller Steve",
    category: "Operational Incident",
    status: "Closed",
    assignedTo: "Ranger John",
    location: {
      road: "Siloso Beach Walk",
      building: "Restroom Block 2",
      levelSpace: "Level 1 corridor",
      nearAt: "Near hand dryers",
      commonName: "Siloso Beach Restroom 2",
      postalCode: "098997",
      tags: ["Siloso Zone", "Beachfront"],
      lat: 1.2562,
      lng: 103.8124
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "08:15:00", description: "Call received from guest reporting an elderly woman slipped near restrooms. First aid dispatch initiated." },
      { eventNumber: 2, date: "2026-06-12", time: "08:18:00", description: "Ranger John dispatched with medical kit." },
      { eventNumber: 3, date: "2026-06-12", time: "08:24:00", description: "Ranger John arrived. Guest conscious but sprained ankle. Administered cold compress." },
      { eventNumber: 4, date: "2026-06-12", time: "08:45:00", description: "Guest escorted to Beach Station clinic. Wet floor warning sign posted." },
      { eventNumber: 5, date: "2026-06-12", time: "09:00:00", description: "Incident endorsed and closed by DM Gan." }
    ],
    ...defaultSubStructures,
    summary: "Elderly guest slipped on wet floor near Siloso Restrooms. ranger assisted guest to clinic. Area dried.",
    closedAt: "2026-06-12T09:00:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8002",
    caseId: "CASE-DEMO-8002",
    title: "Missing Child near Palawan Bridge",
    dateTime: "2026-06-12T09:30:00+07:00",
    type: "Safety / Medical",
    subType: "Others",
    priority: "High",
    crisisLevel: 3,
    reporterName: "Mr. Lee (Father)",
    requestedBy: "Public Phone",
    createdBy: "Controller Steve",
    category: "Operational Incident",
    status: "Live",
    assignedTo: "",
    location: {
      road: "Palawan Beach Walk",
      building: "Suspension Bridge Gatehouse",
      levelSpace: "Muster point",
      nearAt: "Beach side",
      commonName: "Palawan Suspension Bridge",
      postalCode: "098997",
      tags: ["Palawan Zone"],
      lat: 1.2518,
      lng: 103.8202
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "09:30:00", description: "Logged walk-in parent report of missing 5-year-old boy wearing red shirt. Broadcast lookouts issued." }
    ],
    ...defaultSubStructures,
    summary: "5-year-old boy missing near Palawan suspension bridge gatehouse. Description shared across patrol radios."
  },
  {
    id: "SEN/IR/20260612/8003",
    caseId: "CASE-DEMO-8003",
    title: "Lost Passport at Wings of Time",
    dateTime: "2026-06-12T10:10:00+07:00",
    type: "Security",
    subType: "Theft",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Tourist James (Email)",
    requestedBy: "Public Email",
    createdBy: "Controller Steve",
    category: "Operational Incident",
    status: "Live",
    assignedTo: "Ranger Sarah",
    location: {
      road: "Beach View",
      building: "Wings of Time Amphitheatre",
      levelSpace: "Row K",
      nearAt: "Under seats",
      commonName: "Wings of Time",
      postalCode: "098997",
      tags: ["Beach View Zone"],
      lat: 1.2512,
      lng: 103.8182
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "10:10:00", description: "Guest emailed reporting passport lost during yesterday's final show. Assigned Ranger Sarah to query lost & found vault." }
    ],
    ...defaultSubStructures,
    summary: "Foreign guest lost passport at Wings of Time Row K during night show. Search and checklist initiated."
  },
  {
    id: "SEN/IR/20260612/8004",
    caseId: "CASE-DEMO-8004",
    title: "Giddiness Emergency at Tanjong Club",
    dateTime: "2026-06-12T10:45:00+07:00",
    type: "Safety / Medical",
    subType: "Fainting/Giddiness",
    priority: "High",
    crisisLevel: 2,
    reporterName: "Club Manager (Tanjong)",
    requestedBy: "Public Phone",
    createdBy: "Controller Steve",
    category: "Operational Incident",
    status: "Live (Acknowledged)",
    assignedTo: "Ranger John",
    location: {
      road: "Tanjong Beach Walk",
      building: "Tanjong Beach Club",
      levelSpace: "Pool deck seating",
      nearAt: "Daybed 14",
      commonName: "Tanjong Beach Club",
      postalCode: "098997",
      tags: ["Tanjong Zone"],
      lat: 1.2488,
      lng: 103.8273
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "10:45:00", description: "Call-in from Tanjong Beach Club manager reporting female guest fainted. SCDF ambulance alerted." },
      { eventNumber: 2, date: "2026-06-12", time: "10:48:00", description: "Ranger John acknowledged dispatch and is en route with AED." }
    ],
    ...defaultSubStructures,
    summary: "Female guest experienced heat stroke/fainting at Tanjong daybeds. Ranger John responding; SCDF en route.",
    acknowledgedAt: "2026-06-12T10:48:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8005",
    caseId: "CASE-DEMO-8005",
    title: "Guest Dispute at Siloso Carpark",
    dateTime: "2026-06-12T11:15:00+07:00",
    type: "Security",
    subType: "Crowd Control",
    priority: "Normal",
    crisisLevel: 3,
    reporterName: "Patrol Ranger Dave",
    requestedBy: "Ranger Patrol",
    createdBy: "Ranger Dave",
    category: "Operational Incident",
    status: "Live (On-Site)",
    assignedTo: "Ranger Dave",
    location: {
      road: "Siloso Beach Walk",
      building: "Beach Station Carpark",
      levelSpace: "Lot 42",
      nearAt: "Cashcard machine",
      commonName: "Beach Station Carpark",
      postalCode: "098997",
      tags: ["Siloso Zone"],
      lat: 1.2514,
      lng: 103.8188
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "11:15:00", description: "Ranger Dave spotted dispute between two drivers over parking space. Standing-by to de-escalate." },
      { eventNumber: 2, date: "2026-06-12", time: "11:20:00", description: "Arrived at lot 42. Initiating mediation." }
    ],
    ...defaultSubStructures,
    summary: "Verbal dispute between two motorists over parking lot. Ranger Dave mediating on-site.",
    onSiteAt: "2026-06-12T11:20:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8006",
    caseId: "CASE-DEMO-8006",
    title: "Unauthorized Drone at Fort Siloso",
    dateTime: "2026-06-12T11:40:00+07:00",
    type: "Security",
    subType: "Trespass",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Security Guard Tan",
    requestedBy: "Public Phone",
    createdBy: "Controller Steve",
    category: "Operational Incident",
    status: "Live",
    assignedTo: "Ranger John",
    location: {
      road: "Siloso Road",
      building: "Fort Siloso Skywalk",
      levelSpace: "Viewing tower",
      nearAt: "Surveillance mast",
      commonName: "Fort Siloso",
      postalCode: "099981",
      tags: ["Siloso Zone", "Historical"],
      lat: 1.2592,
      lng: 103.8082
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "11:40:00", description: "Guard reported hobbyist flying DJI drone over restricted heritage site. Ranger dispatched." },
      { eventNumber: 2, date: "2026-06-12", time: "12:10:00", description: "Ranger John arrived. Pilot packed up and fled scene before ranger contact. Unable to identify offender." }
    ],
    ...defaultSubStructures,
    summary: "Illegal drone flight reported. Pilot fled before ranger arrival; no action taken."
  },
  {
    id: "SEN/IR/20260612/8007",
    caseId: "CASE-DEMO-8007",
    title: "Damaged Barrier at Beach Depot",
    dateTime: "2026-06-12T12:00:00+07:00",
    type: "Facilities",
    subType: "Others",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Shuttle Driver Ali",
    requestedBy: "Ranger Patrol",
    createdBy: "Controller Steve",
    category: "Operational Incident",
    status: "Live (Completed)",
    assignedTo: "Ranger John",
    location: {
      road: "Beach View",
      building: "Shuttle Parking Depot",
      levelSpace: "Entrance Gate A",
      nearAt: "Barrier arm",
      commonName: "Beach Shuttle Depot",
      postalCode: "098997",
      tags: ["Facilities"],
      lat: 1.2509,
      lng: 103.8192
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "12:00:00", description: "Tram driver reported barrier gate damaged. Ranger dispatched." },
      { eventNumber: 2, date: "2026-06-12", time: "12:08:00", description: "Ranger John acknowledged dispatch." },
      { eventNumber: 3, date: "2026-06-12", time: "12:15:00", description: "Ranger John arrived. Cordon established, gate arm manual override enabled. Resolution remarks logged." }
    ],
    ...defaultSubStructures,
    summary: "Entrance barrier arm damaged. Cordoned and manually opened for trams. Ground work complete.",
    completedAt: "2026-06-12T12:15:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8008",
    caseId: "CASE-DEMO-8008",
    title: "Theft from Tanjong Deckchairs",
    dateTime: "2026-06-12T12:30:00+07:00",
    type: "Security",
    subType: "Theft",
    priority: "Normal",
    crisisLevel: 3,
    reporterName: "Ranger Dave",
    requestedBy: "Ranger Patrol",
    createdBy: "Ranger Dave",
    category: "Operational Incident",
    status: "Pending Endorsement",
    assignedTo: "Ranger Dave",
    location: {
      road: "Tanjong Beach Walk",
      building: "Tanjong Beach Deckchair Sector 2",
      levelSpace: "Beachfront",
      nearAt: "Deckchair 48",
      commonName: "Tanjong Beach Walk",
      postalCode: "098997",
      tags: ["Tanjong Zone"],
      lat: 1.2482,
      lng: 103.8288
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "12:30:00", description: "Ranger Dave flagged by guest reporting bag stolen while swimming. Commencing police report liaison." },
      { eventNumber: 2, date: "2026-06-12", time: "13:00:00", description: "Assisted guest to file police report SPF-302. Ground investigation closed." }
    ],
    ...defaultSubStructures,
    summary: "Theft of guest belongings from deckchair. Police report filed. Submitted to supervisor.",
    completedAt: "2026-06-12T13:00:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8009",
    caseId: "CASE-DEMO-8009",
    title: "Water Leak at Tanjong Restrooms",
    dateTime: "2026-06-12T13:00:00+07:00",
    type: "Facilities",
    subType: "Water Leak",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Visitor Smith",
    requestedBy: "Public Email",
    createdBy: "Controller Steve",
    category: "Operational Incident",
    status: "Returned",
    assignedTo: "Ranger Sarah",
    location: {
      road: "Tanjong Beach Walk",
      building: "Tanjong Public Restrooms",
      levelSpace: "Male toilet L1",
      nearAt: "Urinal bay",
      commonName: "Tanjong Restrooms",
      postalCode: "098997",
      tags: ["Facilities"],
      lat: 1.2485,
      lng: 103.8268
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "13:00:00", description: "Email alert regarding toilet floor flooding. Dispatching Ranger Sarah." },
      { eventNumber: 2, date: "2026-06-12", time: "13:30:00", description: "Ranger Sarah marked completed. Returned by DM Gan: 'Please state CMMS ticket ID created for repairs.'" }
    ],
    ...defaultSubStructures,
    summary: "Water leak in Tanjong toilet. Ground report returned by supervisor for missing CMMS verification."
  },
  {
    id: "SEN/IR/20260612/8010",
    caseId: "CASE-DEMO-8010",
    title: "Minor Vehicle Collision Sentosa Gate",
    dateTime: "2026-06-12T13:30:00+07:00",
    type: "Security",
    subType: "Others",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Gantry Officer Rahim",
    requestedBy: "Public Phone",
    createdBy: "Controller Steve",
    category: "Operational Incident",
    status: "Closed",
    assignedTo: "Ranger John",
    location: {
      road: "Sentosa Gateway",
      building: "Main Admission Gantry",
      levelSpace: "Lane 4",
      nearAt: "Touch gantry card reader",
      commonName: "Sentosa Gateway Admission",
      postalCode: "098269",
      tags: ["Admission Zone"],
      lat: 1.2642,
      lng: 103.8234
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "13:30:00", description: "Rahim reported minor tail-end bump in Lane 4. Dispatching Ranger John." },
      { eventNumber: 2, date: "2026-06-12", time: "13:50:00", description: "Drivers exchanged details. Vehicle moved out of lane. Closed by DM Gan." }
    ],
    ...defaultSubStructures,
    summary: "Rear-end collision at admission gantry Lane 4. Cleared quickly, no injuries.",
    closedAt: "2026-06-12T14:00:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8011",
    caseId: "CASE-DEMO-8011",
    title: "Bee Nest on Imbiah Trail",
    dateTime: "2026-06-12T14:00:00+07:00",
    type: "Safety / Medical",
    subType: "Animal Encounter",
    priority: "Normal",
    crisisLevel: 3,
    reporterName: "SCDF Dispatch Liaison",
    requestedBy: "Government Agency",
    createdBy: "Controller Steve",
    category: "Operational Incident",
    status: "Closed",
    assignedTo: "Ranger John",
    location: {
      road: "Imbiah Road",
      building: "Imbiah Trail footpath",
      levelSpace: "Wooden stairs near gazebo",
      nearAt: "Tree branch",
      commonName: "Imbiah Trail Boardwalk",
      postalCode: "098997",
      tags: ["Nature Zone"],
      lat: 1.2538,
      lng: 103.8145
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "14:00:00", description: "SCDF informed SDC of swarm nest. Cordon established by Ranger John." },
      { eventNumber: 2, date: "2026-06-12", time: "15:30:00", description: "Contractor exterminator removed nest. Cordon removed. Closed." }
    ],
    ...defaultSubStructures,
    summary: "Bee nest removed from Imbiah Trail wooden staircase path. Resolved by pest contractor.",
    closedAt: "2026-06-12T16:00:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8012",
    caseId: "CASE-DEMO-8012",
    title: "Oil Sheen off Palawan Beach",
    dateTime: "2026-06-12T14:30:00+07:00",
    type: "Safety / Medical",
    subType: "Others",
    priority: "High",
    crisisLevel: 1,
    reporterName: "Maritime Authority (MPA)",
    requestedBy: "Government Agency",
    createdBy: "Controller Steve",
    category: "Operational Incident",
    status: "Closed",
    assignedTo: "Ranger Sarah",
    location: {
      road: "Palawan Beach Walk",
      building: "Sea shoreline sector",
      levelSpace: "Waterfront",
      nearAt: "Beach shoreline",
      commonName: "Palawan Beach Shoreline",
      postalCode: "098997",
      tags: ["Palawan Zone", "Critical"],
      lat: 1.2505,
      lng: 103.8228
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "14:30:00", description: "MPA alerted Sentosa to localized fuel spill drifting towards Palawan. Ranger Sarah dispatched to verify. SDC environmental taskforce mobilized." },
      { eventNumber: 2, date: "2026-06-12", time: "17:30:00", description: "Containment booms deployed. Oil sheen dissipated. Closed." }
    ],
    ...defaultSubStructures,
    summary: "Fuel/oil sheen detected off Palawan Beach shoreline. Containment booms deployed; safety clear confirmed.",
    closedAt: "2026-06-12T18:00:00+07:00"
  },

  // PROACTIVE INCIDENTS
  {
    id: "SEN/IR/20260612/8013",
    caseId: "CASE-DEMO-8013",
    title: "Proactive: Briefcase at Beach Station",
    dateTime: "2026-06-12T09:15:00+07:00",
    type: "Security",
    subType: "Abandoned Property",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Ranger Dave",
    requestedBy: "Ranger Patrol",
    createdBy: "Ranger Dave",
    category: "Operational Incident",
    status: "Closed",
    assignedTo: "Ranger Dave",
    location: {
      road: "Beach View",
      building: "Beach Station Monorail Gantry",
      levelSpace: "Concourse ticketing",
      nearAt: "Locker bay",
      commonName: "Beach Station",
      postalCode: "098997",
      tags: ["Beach View Zone", "Proactive"],
      lat: 1.2515,
      lng: 103.8185
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "09:15:00", description: "Spotted unattended brown briefcase near monorail locker bay. Cordon established." },
      { eventNumber: 2, date: "2026-06-12", time: "09:30:00", description: "Owner claimed item. Checked security IDs. Resolved and closed on-site." }
    ],
    ...defaultSubStructures,
    summary: "Briefcase spotted during routine patrol. Returned to owner.",
    closedAt: "2026-06-12T09:35:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8014",
    caseId: "CASE-DEMO-8014",
    title: "Proactive: Illegal Parking Siloso Walk",
    dateTime: "2026-06-12T10:00:00+07:00",
    type: "Security",
    subType: "Others",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Ranger Sarah",
    requestedBy: "Ranger Patrol",
    createdBy: "Ranger Sarah",
    category: "Operational Incident",
    status: "Closed",
    assignedTo: "Ranger Sarah",
    location: {
      road: "Siloso Beach Walk",
      building: "Pedestrian pathway",
      levelSpace: "Emergency fire access lane",
      nearAt: "Coasting tram stop",
      commonName: "Siloso Beach Walk Lane",
      postalCode: "098997",
      tags: ["Siloso Zone", "Proactive"],
      lat: 1.2558,
      lng: 103.8148
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "10:00:00", description: "Private delivery van parked in emergency access lane. Summoned driver." },
      { eventNumber: 2, date: "2026-06-12", time: "10:10:00", description: "Driver moved vehicle immediately. Logged incident closed." }
    ],
    ...defaultSubStructures,
    summary: "Van parked illegally in fire lane. Driver relocated vehicle after ranger advisory.",
    closedAt: "2026-06-12T10:15:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8015",
    caseId: "CASE-DEMO-8015",
    title: "Proactive: Broken Plank Fort Siloso",
    dateTime: "2026-06-12T10:30:00+07:00",
    type: "Facilities",
    subType: "Others",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Ranger John",
    requestedBy: "Ranger Patrol",
    createdBy: "Ranger John",
    category: "Operational Incident",
    status: "Closed",
    assignedTo: "Ranger John",
    location: {
      road: "Siloso Road",
      building: "Fort Siloso Viewing Tower",
      levelSpace: "Foot bridge deck",
      nearAt: "Plank number 12",
      commonName: "Fort Siloso Bridge",
      postalCode: "099981",
      tags: ["Facilities", "Proactive"],
      lat: 1.2588,
      lng: 103.8089
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "10:30:00", description: "Ranger spotted rotting wood deck plank. Cordoned area." },
      { eventNumber: 2, date: "2026-06-12", time: "11:00:00", description: "Facilities contractor replaced plank. Cordon removed. Closed." }
    ],
    ...defaultSubStructures,
    summary: "Rotten walkway plank cordoned off and replaced by facilities contractor.",
    closedAt: "2026-06-12T11:15:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8016",
    caseId: "CASE-DEMO-8016",
    title: "Proactive: First Aid Palawan Play",
    dateTime: "2026-06-12T11:00:00+07:00",
    type: "Safety / Medical",
    subType: "Injury",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Ranger Dave",
    requestedBy: "Ranger Patrol",
    createdBy: "Ranger Dave",
    category: "Operational Incident",
    status: "Closed",
    assignedTo: "Ranger Dave",
    location: {
      road: "Palawan Beach Walk",
      building: "Palawan Pirate Ship Playground",
      levelSpace: "Sand play pit",
      nearAt: "Water slide exit",
      commonName: "Palawan Playground",
      postalCode: "098997",
      tags: ["Palawan Zone", "Proactive"],
      lat: 1.2508,
      lng: 103.8218
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "11:00:00", description: "Ranger Dave saw a young child scrape knee. Administered antiseptic wipes and plaster bandage." }
    ],
    ...defaultSubStructures,
    summary: "Minor first aid administered to child who fell at playground. Resolved on-site.",
    closedAt: "2026-06-12T11:10:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8017",
    caseId: "CASE-DEMO-8017",
    title: "Proactive: Lost Card Imbiah Stop",
    dateTime: "2026-06-12T11:30:00+07:00",
    type: "Security",
    subType: "Abandoned Property",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Ranger John",
    requestedBy: "Ranger Patrol",
    createdBy: "Ranger John",
    category: "Operational Incident",
    status: "Closed",
    assignedTo: "Ranger John",
    location: {
      road: "Imbiah Road",
      building: "Imbiah Lookout Bus Stop",
      levelSpace: "Seating bench",
      nearAt: "Ad panel",
      commonName: "Imbiah Lookout Stop",
      postalCode: "098997",
      tags: ["Nature Zone", "Proactive"],
      lat: 1.2542,
      lng: 103.8164
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "11:30:00", description: "Found UOB Visa Credit Card on stop bench. Depositing into Beach Station security vault." }
    ],
    ...defaultSubStructures,
    summary: "Lost Visa credit card retrieved from bus stop and logged into SDC vault.",
    closedAt: "2026-06-12T11:45:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8018",
    caseId: "CASE-DEMO-8018",
    title: "Proactive: Damaged Fence Tanjong",
    dateTime: "2026-06-12T12:00:00+07:00",
    type: "Facilities",
    subType: "Others",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Ranger Dave",
    requestedBy: "Ranger Patrol",
    createdBy: "Ranger Dave",
    category: "Operational Incident",
    status: "Closed",
    assignedTo: "Ranger Dave",
    location: {
      road: "Tanjong Beach Walk",
      building: "Estate boundary fence",
      levelSpace: "Ground boundary",
      nearAt: "Lot 2 carpark fence",
      commonName: "Tanjong Carpark Fence",
      postalCode: "098997",
      tags: ["Tanjong Zone", "Proactive"],
      lat: 1.2478,
      lng: 103.8292
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "12:00:00", description: "Ranger Dave found wire mesh fence torn. Tied cordon tape." },
      { eventNumber: 2, date: "2026-06-12", time: "13:00:00", description: "Maintenance team patched mesh. Closed." }
    ],
    ...defaultSubStructures,
    summary: "Rotten wire mesh boundary fence temporarily cordoned and repaired.",
    closedAt: "2026-06-12T13:30:00+07:00"
  },

  // BACKDATED INCIDENTS
  {
    id: "SEN/IR/20260612/8019",
    caseId: "CASE-DEMO-8019",
    title: "Backdated: Monitor Lizard Boardwalk",
    dateTime: "2026-06-11T15:30:00+07:00",
    type: "Safety / Medical",
    subType: "Animal Encounter",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Park Warden Chan",
    requestedBy: "Controller Observation",
    createdBy: "Controller Steve",
    category: "Backdated Incident",
    status: "Closed",
    assignedTo: "Estate Management",
    location: {
      road: "Siloso Beach Walk",
      building: "Coastal Walkway boardwalk",
      levelSpace: "Sea view deck",
      nearAt: "Handrail post 18",
      commonName: "Siloso Coastal Walk",
      postalCode: "098997",
      tags: ["Siloso Zone", "Backdated"],
      lat: 1.2582,
      lng: 103.8094
    },
    log: [
      { eventNumber: 1, date: "2026-06-11", time: "15:30:00", description: "[BACKDATED] Large monitor lizard resting on deck. Escorted lizard back to forest." },
      { eventNumber: 2, date: "2026-06-12", time: "08:30:00", description: "Filed delayed compliance log for yesterday's wildlife control activity." }
    ],
    ...defaultSubStructures,
    summary: "Delayed entry for yesterday's monitor lizard boardwalk encounter; resolved by park warden.",
    closedAt: "2026-06-12T08:35:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8020",
    caseId: "CASE-DEMO-8020",
    title: "Backdated: Sprained Ankle at Siloso",
    dateTime: "2026-06-11T16:00:00+07:00",
    type: "Safety / Medical",
    subType: "Slip & Fall",
    priority: "Normal",
    crisisLevel: 3,
    reporterName: "Guest Services",
    requestedBy: "Public Phone",
    createdBy: "Controller Steve",
    category: "Backdated Incident",
    status: "Closed",
    assignedTo: "Ranger Sarah",
    location: {
      road: "Siloso Beach Walk",
      building: "Siloso Beach Sand area",
      levelSpace: "Near net 2 volleyball",
      nearAt: "Volleyball posts",
      commonName: "Siloso Beach volleyball courts",
      postalCode: "098997",
      tags: ["Siloso Zone", "Backdated"],
      lat: 1.2568,
      lng: 103.8118
    },
    log: [
      { eventNumber: 1, date: "2026-06-11", time: "16:00:00", description: "[BACKDATED] Guest sprained ankle playing volleyball. Guest services managed transport." },
      { eventNumber: 2, date: "2026-06-12", time: "09:00:00", description: "Backdated incident filed based on late guest relations email memo." }
    ],
    ...defaultSubStructures,
    summary: "Sprained ankle volleyball injury from yesterday logged post-event for insurance record.",
    closedAt: "2026-06-12T09:05:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8021",
    caseId: "CASE-DEMO-8021",
    title: "Backdated: Kiosk Shutter Jam",
    dateTime: "2026-06-10T08:00:00+07:00",
    type: "Facilities",
    subType: "Others",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Kiosk Owner Lee",
    requestedBy: "Internal SDC",
    createdBy: "Controller Steve",
    category: "Backdated Incident",
    status: "Closed",
    assignedTo: "Facilities Contractor",
    location: {
      road: "Palawan Beach Walk",
      building: "Kiosk Lot 2",
      levelSpace: "Front facade",
      nearAt: "Metal roller shutter",
      commonName: "Palawan Beach Kiosk 2",
      postalCode: "098997",
      tags: ["Facilities", "Backdated"],
      lat: 1.2502,
      lng: 103.8224
    },
    log: [
      { eventNumber: 1, date: "2026-06-10", time: "08:00:00", description: "[BACKDATED] Kiosk shutter jammed. Locksmith repaired it within 1 hour." },
      { eventNumber: 2, date: "2026-06-12", time: "09:30:00", description: "Logged historical entry from two days ago to resolve audit trail discrepancy." }
    ],
    ...defaultSubStructures,
    summary: "Jammed kiosk shutter. Repaired by contractor locksmith two days ago, logged today.",
    closedAt: "2026-06-12T09:35:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8022",
    caseId: "CASE-DEMO-8022",
    title: "Backdated: Vector Spray Audit",
    dateTime: "2026-06-09T09:00:00+07:00",
    type: "Safety / Medical",
    subType: "Others",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Vector Control Lead",
    requestedBy: "Government Agency",
    createdBy: "Controller Steve",
    category: "Backdated Incident",
    status: "Closed",
    assignedTo: "NEA Inspector",
    location: {
      road: "Sentosa Gateway",
      building: "SDC Headquarters Estate",
      levelSpace: "Outer drainage line",
      nearAt: "Perimeter storm drain",
      commonName: "SDC HQ Grounds",
      postalCode: "098269",
      tags: ["Admin", "Backdated"],
      lat: 1.2645,
      lng: 103.8242
    },
    log: [
      { eventNumber: 1, date: "2026-06-09", time: "09:00:00", description: "[BACKDATED] Scheduled NEA anti-mosquito fogging audit conducted. Passed with no breeding grounds found." },
      { eventNumber: 2, date: "2026-06-12", time: "10:00:00", description: "Compliance vector report logged late due to supervisor review backlog." }
    ],
    ...defaultSubStructures,
    summary: "Anti-dengue fogging audit logs filed for Tuesday. Passed compliance standards.",
    closedAt: "2026-06-12T10:05:00+07:00"
  },

  // ONGOING INCIDENTS
  {
    id: "SEN/IR/20260612/8023",
    caseId: "CASE-DEMO-8023",
    title: "Ongoing: Beach Plaza Outage",
    dateTime: "2026-06-12T10:00:00+07:00",
    type: "Facilities",
    subType: "Power Outage",
    priority: "High",
    crisisLevel: 2,
    reporterName: "Alarm System (UCS)",
    requestedBy: "UCS",
    createdBy: "system",
    category: "Operational Incident",
    status: "Live (On-Site)",
    assignedTo: "Ranger Sarah",
    location: {
      road: "Beach View",
      building: "Beach Station Plaza Hub",
      levelSpace: "Underground main switch room",
      nearAt: "Breaker panel B",
      commonName: "Beach Plaza Switchroom",
      postalCode: "098997",
      tags: ["Beach View Zone", "Ongoing"],
      lat: 1.2511,
      lng: 103.8189
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "10:00:00", description: "Breaker B trip alarm received. Localized blackout at ticketing offices." },
      { eventNumber: 2, date: "2026-06-12", time: "10:15:00", description: "Ranger Sarah arrived on-site. Coordinating with utility provider." }
    ],
    ...defaultSubStructures,
    summary: "Power outage affecting Beach Plaza ticketing offices. Ranger Sarah investigating with switchroom techs."
  },
  {
    id: "SEN/IR/20260612/8024",
    caseId: "CASE-DEMO-8024",
    title: "Ongoing: Monorail Crowd Surge",
    dateTime: "2026-06-12T10:30:00+07:00",
    type: "Security",
    subType: "Crowd Control",
    priority: "High",
    crisisLevel: 3,
    reporterName: "Video Analytics master",
    requestedBy: "Video Analytics",
    createdBy: "system",
    category: "Operational Incident",
    status: "Live (Acknowledged)",
    assignedTo: "Ranger John",
    location: {
      road: "Beach View",
      building: "Beach Station Monorail Platform",
      levelSpace: "Waiting bay gates",
      nearAt: "Admission turnstiles",
      commonName: "Beach Station Platform",
      postalCode: "098997",
      tags: ["Beach View Zone", "Ongoing"],
      lat: 1.2516,
      lng: 103.8181
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "10:30:00", description: "VA alert CAM-10 triggered for crowd density exceeding 4 persons per sqm." },
      { eventNumber: 2, date: "2026-06-12", time: "10:35:00", description: "Ranger John dispatch acknowledged. Moving to assist station staff in deploying barrier cordons." }
    ],
    ...defaultSubStructures,
    summary: "Monorail platform crowd surge alert. Ranger John deployed to assist with barrier gates.",
    acknowledgedAt: "2026-06-12T10:35:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8025",
    caseId: "CASE-DEMO-8025",
    title: "Ongoing: Brush Fire Mount Imbiah",
    dateTime: "2026-06-12T11:00:00+07:00",
    type: "Fire Alarm",
    subType: "Real Fire",
    priority: "High",
    crisisLevel: 4,
    reporterName: "Controller observation screen",
    requestedBy: "Controller Observation",
    createdBy: "system",
    category: "Operational Incident",
    status: "Live",
    assignedTo: "Ranger Dave",
    location: {
      road: "Imbiah Road",
      building: "Mount Imbiah forest zone",
      levelSpace: "Near old battery fort",
      nearAt: "Dry vegetation bank",
      commonName: "Mount Imbiah Forest",
      postalCode: "098997",
      tags: ["Nature Zone", "Ongoing"],
      lat: 1.2548,
      lng: 103.8138
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "11:00:00", description: "Controller observed smoke plumes on CCTV CAM-IMB-04. SCDF alerted. Ranger Dave dispatched." }
    ],
    ...defaultSubStructures,
    summary: "Localized brush fire detected in Imbiah forest vegetation bank. Ranger Dave and SCDF responding."
  },
  {
    id: "SEN/IR/20260612/8026",
    caseId: "CASE-DEMO-8026",
    title: "Ongoing: High Swell Warning Tanjong",
    dateTime: "2026-06-12T11:30:00+07:00",
    type: "Safety / Medical",
    subType: "Others",
    priority: "Normal",
    crisisLevel: 3,
    reporterName: "Met Service Agency",
    requestedBy: "Government Agency",
    createdBy: "Controller Steve",
    category: "Operational Incident",
    status: "Live (On-Site)",
    assignedTo: "Ranger Sarah",
    location: {
      road: "Tanjong Beach Walk",
      building: "Tanjong Shoreline lagoons",
      levelSpace: "Water edge",
      nearAt: "Lifeguard towers 4-5",
      commonName: "Tanjong Lagoon",
      postalCode: "098997",
      tags: ["Tanjong Zone", "Ongoing"],
      lat: 1.2472,
      lng: 103.8299
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "11:30:00", description: "High tide swell warning received. Ranger Sarah dispatched to coordinate red flag deployment with beach patrol." },
      { eventNumber: 2, date: "2026-06-12", time: "11:45:00", description: "Ranger Sarah on-site. Red warning flags raised. Swimmers advised to exit lagoon." }
    ],
    ...defaultSubStructures,
    summary: "High tidal swell warning at Tanjong Beach. Red warning flags deployed; swimming restricted on-site.",
    onSiteAt: "2026-06-12T11:45:00+07:00"
  },

  // OPERATIONAL RECORDS
  {
    id: "SEN/IR/20260612/8027",
    caseId: "CASE-DEMO-8027",
    title: "Record: SDC HQ Fire Drill",
    dateTime: "2026-06-12T14:00:00+07:00",
    type: "Safety / Medical",
    subType: "Others",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Safety Coordinator",
    requestedBy: "Internal SDC",
    createdBy: "Safety Coordinator",
    category: "Informational / Exercise Records",
    status: "Closed",
    assignedTo: "HQ Fire Wardens",
    location: {
      road: "Sentosa Gateway",
      building: "SDC Headquarters Estate",
      levelSpace: "All blocks and assembly area",
      nearAt: "Muster point lawn",
      commonName: "SDC HQ Complex",
      postalCode: "098269",
      tags: ["Compliance", "Drill"],
      lat: 1.2645,
      lng: 103.8242
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "14:00:00", description: "HQ evacuation alarms triggered. Evacuation drill commenced." },
      { eventNumber: 2, date: "2026-06-12", time: "14:15:00", description: "Assembly complete. Headcount audit finalized. Evacuation drill closed successfully." }
    ],
    ...defaultSubStructures,
    summary: "Evacuation fire drill conducted at SDC headquarters building. Evacuation time logged: 5m 12s.",
    closedAt: "2026-06-12T14:20:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8028",
    caseId: "CASE-DEMO-8028",
    title: "Record: Siren Diagnostic Test",
    dateTime: "2026-06-12T14:30:00+07:00",
    type: "Safety / Medical",
    subType: "Others",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "IIOC Supervisor Steve",
    requestedBy: "Internal SDC",
    createdBy: "Controller Steve",
    category: "Informational / Exercise Records",
    status: "Closed",
    assignedTo: "IIOC Technicians",
    location: {
      road: "Beach View",
      building: "IIOC Control Centre Room",
      levelSpace: "Diagnostic console",
      nearAt: "Siren transmitter rack",
      commonName: "IIOC Control Room",
      postalCode: "098997",
      tags: ["Maintenance", "Siren"],
      lat: 1.2512,
      lng: 103.8182
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "14:30:00", description: "Initiated diagnostic warning siren ping tests. All 8 island sectors pinged successfully." }
    ],
    ...defaultSubStructures,
    summary: "Siren system diagnostic ping test completed. All 8 siren locations operating within parameters.",
    closedAt: "2026-06-12T14:45:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8029",
    caseId: "CASE-DEMO-8029",
    title: "Record: VIP Escort Marshalling",
    dateTime: "2026-06-12T15:00:00+07:00",
    type: "Security",
    subType: "Others",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Ranger Lead Gan",
    requestedBy: "Internal SDC",
    createdBy: "Controller Steve",
    category: "Informational / Exercise Records",
    status: "Closed",
    assignedTo: "Ranger John",
    location: {
      road: "Beach View",
      building: "Wings of Time VIP Gantry",
      levelSpace: "Arrival driveway",
      nearAt: "Flag mast",
      commonName: "Wings of Time Entrance",
      postalCode: "098997",
      tags: ["Marshalling", "VIP"],
      lat: 1.2512,
      lng: 103.8182
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "15:00:00", description: "Rangers deployed to VIP driveway for traffic management during diplomatic convoy arrival." },
      { eventNumber: 2, date: "2026-06-12", time: "15:45:00", description: "Convoy departed safely. Marshalling detail stood down. Log closed." }
    ],
    ...defaultSubStructures,
    summary: "Ranger traffic marshalling and VIP arrival escort coordination for diplomatic envoys at Beach View.",
    closedAt: "2026-06-12T16:00:00+07:00"
  },
  {
    id: "SEN/IR/20260612/8030",
    caseId: "CASE-DEMO-8030",
    title: "Record: First Aid Audit",
    dateTime: "2026-06-12T15:30:00+07:00",
    type: "Safety / Medical",
    subType: "Others",
    priority: "Normal",
    crisisLevel: 4,
    reporterName: "Medical Officer Tan",
    requestedBy: "Internal SDC",
    createdBy: "Controller Steve",
    category: "Informational / Exercise Records",
    status: "Closed",
    assignedTo: "Ranger Sarah",
    location: {
      road: "Beach View",
      building: "Beach Station First Aid Post",
      levelSpace: "First aid closet",
      nearAt: "Oxygen cylinders",
      commonName: "Beach Station Clinic",
      postalCode: "098997",
      tags: ["Audit", "Medical"],
      lat: 1.2516,
      lng: 103.8183
    },
    log: [
      { eventNumber: 1, date: "2026-06-12", time: "15:30:00", description: "Completed monthly inventory check of Beach Station first aid depot. Plasters and oxygen cylinders replenished." }
    ],
    ...defaultSubStructures,
    summary: "Compliance audit and replenishment of medical stocks at SDC Beach Station First Aid Depot.",
    closedAt: "2026-06-12T16:00:00+07:00"
  }
];

/**
 * Seeding helper to programmatically write these 30 mock incidents
 * directly to db.json case and incident arrays.
 */
export function seedMockData(dbPath: string): { success: boolean; count: number; error?: string } {
  try {
    if (!fs.existsSync(dbPath)) {
      return { success: false, count: 0, error: `Database file not found at: ${dbPath}` };
    }

    const raw = fs.readFileSync(dbPath, 'utf-8');
    const db = JSON.parse(raw);

    // Prepare Cases matching these 30 Incidents
    const newCases: any[] = mockIncidents.map(inc => ({
      id: inc.caseId,
      title: inc.title,
      status: inc.status === 'Closed' ? 'Closed' : 'Active',
      createdAt: inc.dateTime,
      createdBy: inc.createdBy || 'mock-data-generator',
      closedAt: inc.status === 'Closed' ? inc.dateTime : null,
      closedBy: inc.status === 'Closed' ? (inc.createdBy || 'mock-data-generator') : null
    }));

    // Helper: merge arrays uniquely by ID
    const mergeById = (targetArr: any[] = [], sourceArr: any[] = []): any[] => {
      const map = new Map(targetArr.map(item => [item.id, item]));
      sourceArr.forEach(item => map.set(item.id, item));
      return Array.from(map.values());
    };

    db.cases = mergeById(db.cases, newCases);
    db.incidents = mergeById(db.incidents, mockIncidents);

    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
    return { success: true, count: mockIncidents.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message };
  }
}
