const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// 1. Standard Template based on updated specifications:
// Event Name: required
// Event Type: required
// Start Date: required (DD/MM/YYYY HH:mm)
// End Date: required (DD/MM/YYYY HH:mm)
// Event Location: required
// Road Name: Optional
// Building Name: Optional
// Level: Optional
// Description: Optional
const standardData = [
  {
    'Event Name': 'Sentosa Beach Volleyball Championship',
    'Event Type': 'Sports & Recreation',
    'Start Date': '15/09/2026 08:00',
    'End Date': '15/09/2026 18:00',
    'Event Location': 'Siloso Beach Station',
    'Road Name': 'Siloso Beach Walk',
    'Building Name': 'Siloso Beach Station',
    'Level': 'Level 1',
    'Description': 'Annual regional beach volleyball tournament and championship matches.'
  },
  {
    'Event Name': 'Palawan Sunset Food Festival',
    'Event Type': 'F&B',
    'Start Date': '16/09/2026 16:00',
    'End Date': '16/09/2026 22:30',
    'Event Location': 'Palawan Food Court',
    'Road Name': 'Palawan Beach Walk',
    'Building Name': 'Palawan Food Court',
    'Level': 'Level 1',
    'Description': 'Outdoor street food pop-ups and live acoustic music.'
  },
  {
    'Event Name': 'Cable Car Maintenance & Inspection',
    'Event Type': 'Works',
    'Start Date': '18/09/2026 06:00',
    'End Date': '18/09/2026 10:00',
    'Event Location': 'Cable Car Station',
    'Road Name': 'Imbiah Road',
    'Building Name': 'Cable Car Station',
    'Level': 'Ground Level',
    'Description': 'Scheduled monthly safety check and cable inspection.'
  },
  {
    'Event Name': 'Costa Sands Hospitality Workshop',
    'Event Type': 'Internal',
    'Start Date': '19/09/2026 10:00',
    'End Date': '19/09/2026 15:00',
    'Event Location': 'Costa Sands Resort',
    'Road Name': 'Siloso Beach Walk',
    'Building Name': 'Costa Sands Resort',
    'Level': 'Ground Floor',
    'Description': 'Hospitality training session for resort operations staff.'
  },
  {
    'Event Name': 'Ministerial Delegation Visit',
    'Event Type': 'VIP / Dignitary',
    'Start Date': '22/09/2026 14:00',
    'End Date': '22/09/2026 17:00',
    'Event Location': 'Costa Sands Resort',
    'Road Name': 'Siloso Beach Walk',
    'Building Name': 'Costa Sands Resort',
    'Level': 'Ground Floor',
    'Description': 'Official island infrastructure review tour with ministry delegates.'
  }
];

function createCSV(data) {
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => `"${(row[h] || '').replace(/"/g, '""')}"`).join(','));
  return [headers.join(','), ...rows].join('\n');
}

function saveFiles(baseDir) {
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  // 1. Standard CSV & XLSX
  const standardCsv = createCSV(standardData);
  fs.writeFileSync(path.join(baseDir, 'Events_Upload_Template.csv'), standardCsv, 'utf-8');

  const wbStandard = XLSX.utils.book_new();
  const wsStandard = XLSX.utils.json_to_sheet(standardData);
  XLSX.utils.book_append_sheet(wbStandard, wsStandard, 'Events');
  XLSX.writeFile(wbStandard, path.join(baseDir, 'Events_Upload_Template.xlsx'));

  console.log(`Generated templates successfully in: ${baseDir}`);
}

// Generate in workspace root and public folder
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(__dirname, 'public');

saveFiles(rootDir);
saveFiles(publicDir);
