import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Error: MONGODB_URI not found in environment.');
  process.exit(1);
}

const SOURCE_DB_NAME = 'sentosa-cms';
const TARGET_DB_NAME = process.env.TARGET_DB_NAME || 'sentosa-cms-dev';

async function cloneDatabase() {
  console.log(`Connecting to MongoDB cluster...`);
  const client = new MongoClient(uri);
  await client.connect();

  try {
    const sourceDb = client.db(SOURCE_DB_NAME);
    const targetDb = client.db(TARGET_DB_NAME);

    console.log(`Cloning from "${SOURCE_DB_NAME}" -> "${TARGET_DB_NAME}"...`);

    const collections = await sourceDb.listCollections().toArray();
    console.log(`Found ${collections.length} collections in "${SOURCE_DB_NAME}".`);

    for (const colInfo of collections) {
      const colName = colInfo.name;
      if (colName.startsWith('system.')) continue;

      const sourceCol = sourceDb.collection(colName);
      const targetCol = targetDb.collection(colName);

      // 1. Copy documents
      const docs = await sourceCol.find({}).toArray();
      if (docs.length > 0) {
        // Clear target collection first if exists
        await targetCol.deleteMany({});
        await targetCol.insertMany(docs);
      }
      console.log(`  ✓ Collection "${colName}": copied ${docs.length} documents.`);

      // 2. Copy indexes
      const indexes = await sourceCol.indexes();
      for (const idx of indexes) {
        if (idx.name === '_id_') continue;
        const key = idx.key;
        const options = {
          name: idx.name,
          unique: idx.unique || false,
          sparse: idx.sparse || false,
          background: true,
        };
        if (idx.expireAfterSeconds !== undefined) {
          options.expireAfterSeconds = idx.expireAfterSeconds;
        }
        await targetCol.createIndex(key, options);
      }
      console.log(`  ✓ Indexes for "${colName}": copied ${indexes.length - 1} custom index(es).`);
    }

    console.log(`\n🎉 Successfully cloned database "${SOURCE_DB_NAME}" to "${TARGET_DB_NAME}"!`);
  } catch (err) {
    console.error('Error during cloning:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

cloneDatabase();
