const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'src', 'lib', 'db.json');

const todayStr = '2026-08-28';
const todayDate = new Date();

const richDb = {
  cases: [
    {
      id: "SEN/CI/20260828/001",
      title: "Medical Emergency: Heat Exhaustion @ Siloso Beach",
      status: "Active",
      createdAt: `${todayStr}T09:15:00+07:00`,
      createdBy: "Controller Steve",
      closedAt: null,
      closedBy: null
    },
    {
      id: "SEN/CI/20260828/002",
      title: "Environmental: Fallen Branch blocking Imbiah Trail",
      status: "Active",
      createdAt: `${todayStr}T08:30:00+07:00`,
      createdBy: "Ranger Dave",
      closedAt: null,
      closedBy: null
    },
    {
      id: "SEN/CI/20260828/003",
      title: "Security: Unattended Bag @ Beach Station Monorail",
      status: "Pending Triage",
      createdAt: `${todayStr}T10:45:00+07:00`,
      createdBy: "Public Phone",
      closedAt: null,
      closedBy: null
    },
    {
      id: "SEN/CI/20260828/004",
      title: "Facilities: Water Leakage @ Palawan Restrooms",
      status: "Active",
      createdAt: `${todayStr}T07:20:00+07:00`,
      createdBy: "Cleaner Supervisor",
      closedAt: null,
      closedBy: null
    },
    {
      id: "SEN/CI/20260828/005",
      title: "VIP Advisory: State Delegation Visit @ Capella",
      status: "Closed",
      createdAt: `${todayStr}T07:00:00+07:00`,
      createdBy: "Controller Steve",
      closedAt: `${todayStr}T10:00:00+07:00`,
      closedBy: "Duty Manager Gan"
    },
    {
      id: "SEN/CI/20260827/001",
      title: "Crowd Control @ Wings of Time Amphitheatre",
      status: "Closed",
      createdAt: "2026-08-27T19:00:00+07:00",
      createdBy: "Controller Steve",
      closedAt: "2026-08-27T21:30:00+07:00",
      closedBy: "Duty Manager Gan"
    },
    {
      id: "SEN/CI/20260827/002",
      title: "Minor Vehicle Scrape @ Sentosa Gateway B1",
      status: "Closed",
      createdAt: "2026-08-27T14:10:00+07:00",
      createdBy: "Traffic Warden",
      closedAt: "2026-08-27T15:00:00+07:00",
      closedBy: "Controller Steve"
    }
  ],
  incidents: [
    {
      id: "SEN/IR/20260828/0001",
      caseId: "SEN/CI/20260828/001",
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
      location: {
        road: "Siloso Beach Walk",
        building: "Siloso Beach Front",
        levelSpace: "Tower 2",
        nearAt: "Lifeguard Post",
        commonName: "Siloso Beach",
        postalCode: "098997",
        tags: ["Beachfront", "Public"],
        lat: 1.2562,
        lng: 103.8124
      },
      log: [
        {
          eventNumber: 1,
          date: todayStr,
          time: "09:15:00",
          description: "Guest collapsed near Tower 2 showing signs of severe heat exhaustion. First aid requested."
        },
        {
          eventNumber: 2,
          date: todayStr,
          time: "09:18:00",
          description: "Ranger John dispatched with trauma kit and AED."
        },
        {
          eventNumber: 3,
          date: todayStr,
          time: "09:25:00",
          description: "Ranger John arrived on-site. Patient conscious, receiving electrolyte hydration."
        }
      ],
      emergencyServices: {
        policeAtScene: false,
        officerNameRank: "",
        policeIncidentNo: "",
        classification: "Medical",
        respondingUnit: "SCDF Ambulance 112",
        ambulanceScdfType: "SCDF",
        ambulanceOfficerName: "Staff Sgt. Lee",
        ambulanceCallSign: "AMB-112",
        ambulanceRespondingUnit: "Telok Blangah Fire Station",
        ambulanceArrivalTime: "09:32",
        hospitalConveyedTo: "Singapore General Hospital"
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
      personalInjuries: [
        {
          name: "Tan Mei Ling",
          address: "Block 124 Bukit Merah View",
          age: 28,
          gender: "Female",
          contactNumber: "+65 9123 4567",
          clinicHospitalAttended: "Singapore General Hospital",
          msigFormIssued: true,
          msigSerialNo: "MSIG-2026-8891",
          under16: false
        }
      ],
      personsInvolved: [
        {
          guestOrNonGuest: "Guest",
          type: "Guest",
          name: "Tan Mei Ling",
          address: "Block 124 Bukit Merah View",
          age: 28,
          gender: "Female",
          contactNumber: "+65 9123 4567",
          roleInvolvement: "Patient",
          injuryDetails: "Heat exhaustion, dehydration"
        }
      ],
      cctvBwc: [
        {
          cameraNumber: "CAM-SIL-04",
          vmsTimestamp: `${todayStr} 09:14:30`,
          vmsBookmark: "BM-0914-COLLAPSE",
          bwcNumber: "BWC-RNG-03",
          bwcTimestamp: `${todayStr} 09:25:00`
        }
      ],
      summary: "Female guest experienced heat exhaustion during beach run. Stabilized on site by Ranger John and conveyed to SGH via SCDF.",
      completionRemarks: "",
      slaveIncidents: [],
      attachments: [],
      responders: [
        {
          responderId: "Ranger John",
          assignedBy: "Controller Steve",
          assignedAt: `${todayStr}T09:18:00+07:00`,
          status: "Active",
          lifecycleStatus: "On-Site",
          acknowledgedAt: `${todayStr}T09:20:00+07:00`,
          onSiteAt: `${todayStr}T09:25:00+07:00`
        }
      ],
      assignedTo: ["Ranger John"]
    },
    {
      id: "SEN/IR/20260828/0002",
      caseId: "SEN/CI/20260828/002",
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
      location: {
        road: "Imbiah Road",
        building: "Imbiah Nature Trail",
        levelSpace: "Trail Marker 4",
        nearAt: "Cable Car Station",
        commonName: "Imbiah Trail",
        postalCode: "099705",
        tags: ["Nature Area", "Pedestrian"],
        lat: 1.2550,
        lng: 103.8180
      },
      log: [
        {
          eventNumber: 1,
          date: todayStr,
          time: "08:30:00",
          description: "Large tree branch down across main walkway due to overnight wind. Pathway blocked."
        },
        {
          eventNumber: 2,
          date: todayStr,
          time: "08:35:00",
          description: "Horticulture contractor and Ranger Alex dispatched for clearance."
        }
      ],
      emergencyServices: {
        policeAtScene: false,
        officerNameRank: "",
        policeIncidentNo: "",
        classification: "",
        respondingUnit: "",
        ambulanceScdfType: "None",
        ambulanceOfficerName: "",
        ambulanceCallSign: "",
        ambulanceRespondingUnit: "",
        ambulanceArrivalTime: "",
        hospitalConveyedTo: ""
      },
      mediaInvolvement: { mediaAtScene: false, mediaName: "", commsNotified: false },
      propertyDamage: { sdcPropertyDamaged: true, description: "Minor fence dent along trail perimeter" },
      vehiclesInvolved: [],
      personalInjuries: [],
      personsInvolved: [],
      cctvBwc: [],
      summary: "Fallen branch blocking pedestrian footpath at Imbiah Trail. Horticulture team currently cutting and removing debris.",
      completionRemarks: "",
      slaveIncidents: [],
      attachments: [],
      responders: [
        {
          responderId: "Ranger Alex",
          assignedBy: "Controller Steve",
          assignedAt: `${todayStr}T08:35:00+07:00`,
          status: "Active",
          lifecycleStatus: "On-Site",
          acknowledgedAt: `${todayStr}T08:37:00+07:00`,
          onSiteAt: `${todayStr}T08:45:00+07:00`
        }
      ],
      assignedTo: ["Ranger Alex"]
    },
    {
      id: "SEN/IR/20260828/0003",
      caseId: "SEN/CI/20260828/003",
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
      location: {
        road: "Beach View",
        building: "Beach Station",
        levelSpace: "Platform 1",
        nearAt: "Bench 3",
        commonName: "Beach Station Monorail",
        postalCode: "098604",
        tags: ["Transit", "Public"],
        lat: 1.2515,
        lng: 103.8175
      },
      log: [
        {
          eventNumber: 1,
          date: todayStr,
          time: "10:45:00",
          description: "Black backpack left unattended on platform bench for > 15 mins. Safety cordon established."
        }
      ],
      emergencyServices: {
        policeAtScene: true,
        officerNameRank: "Insp. David Wong",
        policeIncidentNo: "SPF-2026-90412",
        classification: "Security Check",
        respondingUnit: "TransCom Patrol",
        ambulanceScdfType: "None",
        ambulanceOfficerName: "",
        ambulanceCallSign: "",
        ambulanceRespondingUnit: "",
        ambulanceArrivalTime: "",
        hospitalConveyedTo: ""
      },
      mediaInvolvement: { mediaAtScene: false, mediaName: "", commsNotified: false },
      propertyDamage: { sdcPropertyDamaged: false, description: "" },
      vehiclesInvolved: [],
      personalInjuries: [],
      personsInvolved: [],
      cctvBwc: [
        {
          cameraNumber: "CAM-BST-01",
          vmsTimestamp: `${todayStr} 10:30:00`,
          vmsBookmark: "BM-1030-BAG",
          bwcNumber: "",
          bwcTimestamp: ""
        }
      ],
      summary: "Security cordon placed at Beach Station Platform 1. SPF TransCom and SDC Security conducting 5W screening.",
      completionRemarks: "",
      slaveIncidents: [],
      attachments: [],
      responders: [],
      assignedTo: []
    }
  ],
  tasks: [
    {
      id: "SEN/TA/20260828/001",
      caseId: "SEN/CI/20260828/001",
      title: "Set up safety cordon and direct ambulance access",
      description: "Ensure emergency vehicle lane from Siloso Carpark to Tower 2 remains free of pedestrian traffic.",
      assignee: "Ranger John",
      assigneeType: "user",
      assignees: [{ type: "user", id: "user_ranger_john", name: "Ranger John" }],
      priority: "High",
      dueDate: `${todayStr}T12:00:00+07:00`,
      status: "In Progress",
      checklist: [
        { id: "1", text: "Place traffic cones at Beach Walk junction", isCompleted: true },
        { id: "2", text: "Guide SCDF ambulance to Tower 2", isCompleted: true },
        { id: "3", text: "Clear cordon after ambulance departs", isCompleted: false }
      ],
      comments: [
        {
          id: "c1",
          user: "Ranger John",
          timestamp: `${todayStr}T09:30:00+07:00`,
          text: "Ambulance on-site, guiding paramedics now."
        }
      ],
      attachments: [],
      createdBy: "Controller Steve",
      createdDate: `${todayStr}T09:20:00+07:00`,
      acknowledgedAt: `${todayStr}T09:22:00+07:00`,
      startedAt: `${todayStr}T09:25:00+07:00`
    },
    {
      id: "SEN/TA/20260828/002",
      caseId: "SEN/CI/20260828/002",
      title: "Horticulture chainsaw clearance & wood disposal",
      description: "Cut fallen branch into portable logs and haul away to composting facility.",
      assignee: "Ranger Alex",
      assigneeType: "user",
      assignees: [{ type: "user", id: "user_ranger_alex", name: "Ranger Alex" }],
      priority: "Normal",
      dueDate: `${todayStr}T11:00:00+07:00`,
      status: "In Progress",
      checklist: [
        { id: "1", text: "Post temporary detour signs at trail entrance", isCompleted: true },
        { id: "2", text: "Complete chainsaw cutting", isCompleted: false },
        { id: "3", text: "Sweep sawdust and reopen path", isCompleted: false }
      ],
      comments: [],
      attachments: [],
      createdBy: "Controller Steve",
      createdDate: `${todayStr}T08:35:00+07:00`,
      acknowledgedAt: `${todayStr}T08:37:00+07:00`,
      startedAt: `${todayStr}T08:45:00+07:00`
    },
    {
      id: "SEN/TA/20260828/003",
      caseId: "SEN/CI/20260828/003",
      title: "Review CCTV footage from 10:00 to 10:45",
      description: "Identify person who placed the black backpack at Platform 1.",
      assignee: "CCTV Team",
      assigneeType: "group",
      assignees: [{ type: "group", id: "grp_cctv", name: "CCTV Team" }],
      priority: "Critical",
      dueDate: `${todayStr}T11:30:00+07:00`,
      status: "Assigned",
      checklist: [
        { id: "1", text: "Retrieve video clip CAM-BST-01", isCompleted: false },
        { id: "2", text: "Extract high-resolution still of suspect/owner", isCompleted: false }
      ],
      comments: [],
      attachments: [],
      createdBy: "Controller Steve",
      createdDate: `${todayStr}T10:48:00+07:00`
    },
    {
      id: "SEN/TA/20260828/004",
      caseId: "SEN/CI/20260828/004",
      title: "Plumber pipe repair at Palawan Restrooms",
      description: "Isolate valve B4 and replace cracked copper joint.",
      assignee: "Facilities Team",
      assigneeType: "group",
      assignees: [{ type: "group", id: "grp_fac", name: "Facilities Team" }],
      priority: "Normal",
      dueDate: `${todayStr}T14:00:00+07:00`,
      status: "Created",
      checklist: [],
      comments: [],
      attachments: [],
      createdBy: "Cleaner Supervisor",
      createdDate: `${todayStr}T07:25:00+07:00`
    }
  ],
  occurrences: [
    {
      id: "SEN/ED/20260828/001",
      caseId: "SEN/CI/20260828/005",
      user: "Controller Steve",
      dateTime: `${todayStr}T07:00:00+07:00`,
      topic: "Morning Shift Briefing & VIP Movement Coordination",
      content: "Duty Controller Steve took over morning shift. Weather forecast: Fair in morning, 40% chance of showers at 16:00. VIP convoy scheduled at Capella at 08:00.",
      attachments: []
    },
    {
      id: "SEN/ED/20260828/002",
      caseId: "SEN/CI/20260828/001",
      user: "Controller Steve",
      dateTime: `${todayStr}T09:15:00+07:00`,
      topic: "Heat advisory warning broadcasted to beach kiosks",
      content: "Temperature reached 34.5°C at Siloso. All hydration points refilled, lifeguards on high alert for heat symptoms.",
      attachments: []
    },
    {
      id: "SEN/ED/20260828/003",
      caseId: "SEN/CI/20260828/003",
      user: "Duty Manager Gan",
      dateTime: `${todayStr}T10:50:00+07:00`,
      topic: "Beach Station Monorail Cordon Update",
      content: "Platform 1 temporary boarding bypass active. Trains running on 5-minute headway with minimal delay to passengers.",
      attachments: []
    }
  ],
  events: [
    {
      id: "EVT-2026-0001",
      name: "Sentosa Sunset Music Festival 2026",
      startDateTime: `${todayStr}T15:00:00+07:00`,
      endDateTime: `${todayStr}T23:00:00+07:00`,
      type: "Concert / Festival",
      description: "Live outdoor music festival on Siloso Beach. Projected attendance: 4,500 guests.",
      location: {
        road: "Siloso Beach Walk",
        building: "Siloso Beach Arena",
        levelSpace: "Zone A & B",
        nearAt: "Rumours Beach Club",
        commonName: "Siloso Beach Arena",
        postalCode: "098997",
        tags: ["Festival", "Music", "Major"],
        lat: 1.2545,
        lng: 103.8145
      },
      boundaryCoordinates: [
        { lat: 1.2555, lng: 103.8135 },
        { lat: 1.2560, lng: 103.8160 },
        { lat: 1.2535, lng: 103.8165 },
        { lat: 1.2530, lng: 103.8140 }
      ],
      createdBy: "Events Lead",
      createdAt: `${todayStr}T08:00:00+07:00`
    },
    {
      id: "EVT-2026-0002",
      name: "Palawan Kids Water Splash Challenge",
      startDateTime: `${todayStr}T10:00:00+07:00`,
      endDateTime: `${todayStr}T17:00:00+07:00`,
      type: "Family & Community",
      description: "Family inflatable obstacle course at Palawan Green.",
      location: {
        road: "Palawan Beach Walk",
        building: "Palawan Green",
        levelSpace: "Lawn Area",
        nearAt: "Beach Station",
        commonName: "Palawan Green",
        postalCode: "098997",
        tags: ["Kids", "Community"],
        lat: 1.2505,
        lng: 103.8205
      },
      boundaryCoordinates: [
        { lat: 1.2515, lng: 103.8195 },
        { lat: 1.2520, lng: 103.8215 },
        { lat: 1.2495, lng: 103.8215 },
        { lat: 1.2495, lng: 103.8195 }
      ],
      createdBy: "Events Lead",
      createdAt: `${todayStr}T08:00:00+07:00`
    }
  ],
  nops: [
    {
      id: "NOP-2026-0001",
      applicantName: "Keppel Infrastructure Pte Ltd",
      companyName: "Keppel F&S Ltd",
      workDescription: "Underground optical fiber and power grid replacement along Sentosa Gateway.",
      startDateTime: `${todayStr}T08:00:00+07:00`,
      endDateTime: `${todayStr}T18:00:00+07:00`,
      status: "Active",
      boundaryCoordinates: [
        { lat: 1.2580, lng: 103.8240 },
        { lat: 1.2590, lng: 103.8260 },
        { lat: 1.2570, lng: 103.8270 }
      ],
      documents: [
        { name: "Safety_Permit_KP2026.pdf", type: "PDF", fileUrl: "#" }
      ]
    },
    {
      id: "NOP-2026-0002",
      applicantName: "HortPark Landscaping Ltd",
      companyName: "GreenSentosa Services",
      workDescription: "Tree pruning and slope stabilization along Imbiah Road.",
      startDateTime: `${todayStr}T07:00:00+07:00`,
      endDateTime: `${todayStr}T15:00:00+07:00`,
      status: "Active",
      boundaryCoordinates: [
        { lat: 1.2540, lng: 103.8170 },
        { lat: 1.2560, lng: 103.8190 },
        { lat: 1.2530, lng: 103.8185 }
      ],
      documents: [
        { name: "Horticulture_WorkOrder_88.pdf", type: "PDF", fileUrl: "#" }
      ]
    }
  ],
  faults: [
    {
      id: "SEN/FR/20260828/001",
      caseId: "SEN/CI/20260828/004",
      faultType: "Facilities",
      faultSubType: "Plumbing / Water",
      location: {
        road: "Palawan Beach Walk",
        building: "Palawan Restrooms Block B",
        levelSpace: "Male Toilet",
        nearAt: "Cubicle 2",
        commonName: "Palawan Restrooms",
        postalCode: "098997",
        tags: ["Facilities", "Plumbing"],
        lat: 1.2505,
        lng: 103.8205
      },
      description: "Severe water leak from flush valve causing puddle near entrance.",
      attachments: [],
      status: "In Progress",
      cmmsTicketId: "CMMS-20260828-1042",
      createdBy: "Cleaner Supervisor",
      createdAt: `${todayStr}T07:20:00+07:00`,
      submittedAt: `${todayStr}T07:22:00+07:00`
    },
    {
      id: "SEN/FR/20260828/002",
      caseId: "SEN/CI/20260828/001",
      faultType: "Electrical",
      faultSubType: "Floodlight",
      location: {
        road: "Siloso Beach Walk",
        building: "Lifeguard Tower 2",
        levelSpace: "Rooftop Pole",
        nearAt: "Beach",
        commonName: "Siloso Tower 2",
        postalCode: "098997",
        tags: ["Electrical"],
        lat: 1.2562,
        lng: 103.8124
      },
      description: "Tower 2 floodlight flickering intermittently.",
      attachments: [],
      status: "Pending Submission",
      cmmsTicketId: "CMMS-20260828-1099",
      createdBy: "Controller Steve",
      createdAt: `${todayStr}T09:30:00+07:00`
    }
  ],
  broadcasts: [
    {
      id: "SEN/BC/20260828/001",
      caseId: "SEN/CI/20260828/001",
      incidentId: "SEN/IR/20260828/0001",
      type: "Weather Advisory",
      recipients: ["operations@sentosa.gov.sg", "beach_rangers@sentosa.gov.sg"],
      templateUsed: "High Heat & UV Index Alert",
      contentDispatched: "High Temperature Advisory: Heat index exceeds 34°C. First aid posts fully equipped. Stay hydrated.",
      sentAt: `${todayStr}T10:00:00+07:00`,
      sentBy: "Duty Manager Gan",
      status: "SENT",
      deliveryAttempts: 1,
      deliveryCounts: { sent: 2, delivered: 2, failed: 0, pending: 0 }
    }
  ],
  auditLogs: [
    {
      id: "AUD-20260828-001",
      timestamp: `${todayStr}T09:15:00+07:00`,
      user: "Controller Steve",
      action: "INCIDENT_CREATED",
      module: "Incidents",
      details: "Created Incident SEN/IR/20260828/0001 for Case SEN/CI/20260828/001",
      correlationId: "CORR-0828-9901"
    }
  ],
  recurrenceSeries: []
};

fs.writeFileSync(DB_PATH, JSON.stringify(richDb, null, 2), 'utf-8');
console.log('✓ Successfully generated full rich demo dataset for today into db.json!');
