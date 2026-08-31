/**
 * Deletes legacy inline base64 attachments from MongoDB.
 *
 * Run:  npm run db:purge-base64          (dry run — reports, changes nothing)
 *       npm run db:purge-base64 -- --apply
 *
 * Why: attachments used to be stored as `data:image/...;base64,...` strings
 * INSIDE the documents. On production 2026-08-19 that was 3.02 MB of a 3.32 MB
 * /api/cases response, and one case document had reached 1.69 MB against
 * MongoDB's hard 16 MB per-document limit. New uploads go to Vercel Blob and
 * store only a URL, so these old blobs are dead weight.
 *
 * Only strings starting with "data:" are removed — Blob URLs are left alone,
 * which makes the script safe to re-run.
 */
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set. Run via: npm run db:purge-base64');
  process.exit(1);
}

const isBase64 = (v) => typeof v === 'string' && v.startsWith('data:');

/** Strips base64 entries in place. Returns [removedCount, bytesFreed]. */
function stripArray(arr) {
  if (!Array.isArray(arr)) return [0, 0];
  let n = 0, bytes = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (isBase64(arr[i])) { bytes += arr[i].length; arr.splice(i, 1); n++; }
  }
  return [n, bytes];
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20_000 });

try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || undefined);

  let totalRemoved = 0, totalBytes = 0, docsTouched = 0;

  const report = (collection, id, removed, bytes) => {
    if (removed === 0) return;
    totalRemoved += removed; totalBytes += bytes; docsTouched++;
    console.log(`  ${collection}/${id}: ${removed} blob(s), ${(bytes / 1024).toFixed(0)} KB`);
  };

  // ── incidents: top-level attachments + every log entry's attachments ───────
  for (const doc of await db.collection('incidents').find({}).toArray()) {
    let removed = 0, bytes = 0;
    let [n, b] = stripArray(doc.attachments); removed += n; bytes += b;
    for (const entry of doc.log ?? []) {
      [n, b] = stripArray(entry.attachments); removed += n; bytes += b;
    }
    if (removed > 0) {
      report('incidents', doc.id, removed, bytes);
      if (APPLY) await db.collection('incidents').updateOne(
        { _id: doc._id }, { $set: { attachments: doc.attachments ?? [], log: doc.log ?? [] } });
    }
  }

  // ── faults / occurrences: a flat attachments array ────────────────────────
  for (const collection of ['faults', 'occurrences']) {
    for (const doc of await db.collection(collection).find({}).toArray()) {
      const [removed, bytes] = stripArray(doc.attachments);
      if (removed > 0) {
        report(collection, doc.id, removed, bytes);
        if (APPLY) await db.collection(collection).updateOne(
          { _id: doc._id }, { $set: { attachments: doc.attachments } });
      }
    }
  }

  // ── tasks: attachments plus base64 inside comment images ──────────────────
  for (const doc of await db.collection('tasks').find({}).toArray()) {
    let [removed, bytes] = stripArray(doc.attachments);
    for (const comment of doc.comments ?? []) {
      const [n, b] = stripArray(comment.images); removed += n; bytes += b;
    }
    if (removed > 0) {
      report('tasks', doc.id, removed, bytes);
      if (APPLY) await db.collection('tasks').updateOne(
        { _id: doc._id }, { $set: { attachments: doc.attachments ?? [], comments: doc.comments ?? [] } });
    }
  }

  console.log(
    `\n${APPLY ? 'Removed' : 'WOULD remove'} ${totalRemoved} base64 blob(s) ` +
    `across ${docsTouched} document(s), freeing ${(totalBytes / 1024 / 1024).toFixed(2)} MB.`,
  );
  if (!APPLY) console.log('Dry run — nothing was changed. Re-run with:  npm run db:purge-base64 -- --apply');
} finally {
  await client.close();
}
