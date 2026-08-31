/**
 * Creates the indexes the app's query patterns actually need.
 *
 * Run:  npm run db:indexes
 * (reads MONGODB_URI from .env.local via node --env-file)
 *
 * Every index here is non-unique on purpose. `id` *should* be unique, but a
 * unique index would fail to build if the demo data already contains a
 * duplicate — and failing the whole script over demo noise is not worth it.
 * Uniqueness is enforced by the upsert-by-id writes in src/lib/db.ts.
 *
 * createIndex is idempotent: re-running this is safe and cheap.
 */
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set. Run with: node --env-file=.env.local scripts/create-indexes.mjs');
  process.exit(1);
}

/** collection -> [ [keys, options], ... ] */
const INDEXES = {
  cases:            [[{ id: 1 }], [{ status: 1 }], [{ createdAt: -1 }]],
  incidents:        [[{ id: 1 }], [{ caseId: 1 }], [{ status: 1 }], [{ dateTime: -1 }]],
  faults:           [[{ id: 1 }], [{ caseId: 1 }]],
  tasks:            [[{ id: 1 }], [{ caseId: 1 }], [{ status: 1 }]],
  occurrences:      [[{ id: 1 }], [{ caseId: 1 }], [{ dateTime: -1 }]],
  events:           [[{ id: 1 }], [{ seriesId: 1 }], [{ startDateTime: -1 }]],
  nops:             [[{ id: 1 }]],
  broadcasts:       [[{ id: 1 }], [{ caseId: 1 }], [{ incidentId: 1 }], [{ createdAt: -1 }]],
  auditLogs:        [[{ timestamp: -1 }], [{ correlationId: 1 }], [{ module: 1, timestamp: -1 }]],
  recurrenceSeries: [[{ id: 1 }]],
  notifications:    [[{ id: 1 }], [{ recipientRole: 1, timestamp: -1 }], [{ timestamp: -1 }]],
  crises:           [[{ id: 1 }], [{ sourceIncidentId: 1, status: 1 }], [{ status: 1 }]],
  crisisRecipients: [[{ id: 1 }], [{ crisisId: 1 }], [{ ackToken: 1 }]],
  crisisDispatches: [[{ crisisId: 1 }]],
  crisisAuditLog:   [[{ crisisId: 1 }], [{ timestamp: -1 }]],
};

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20_000 });

try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || undefined);
  let created = 0;

  for (const [collection, specs] of Object.entries(INDEXES)) {
    for (const [keys, options = {}] of specs) {
      try {
        const name = await db.collection(collection).createIndex(keys, { background: true, ...options });
        created += 1;
        console.log(`  ✓ ${collection}.${name}`);
      } catch (err) {
        console.warn(`  ✗ ${collection} ${JSON.stringify(keys)} — ${err.message}`);
      }
    }
  }

  console.log(`\nDone. ${created} indexes ensured.`);
} finally {
  await client.close();
}
