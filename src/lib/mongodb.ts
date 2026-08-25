import { MongoClient, MongoClientOptions } from 'mongodb';

const uri = process.env.MONGODB_URI as string;

if (!uri) {
  throw new Error('Please define MONGODB_URI in .env.local');
}

/**
 * Serverless-friendly pool settings.
 *
 * On Vercel each function instance handles one request at a time, so a large
 * pool buys nothing — but a pool that closes its sockets between invocations
 * costs a full TLS + SCRAM handshake (3-5 round trips) on the next call, which
 * is the single most expensive thing we do when Atlas is in another region.
 * maxIdleTimeMS keeps sockets alive across warm invocations instead.
 */
const options: MongoClientOptions = {
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 60_000,
  // Fail fast enough that a dead Atlas surfaces as an error instead of a hung
  // request, but slow enough to ride out a cross-region blip.
  serverSelectionTimeoutMS: 15_000,
  socketTimeoutMS: 45_000,
  retryWrites: true,
  retryReads: true,
};

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

/**
 * Cache the connection promise on globalThis in EVERY environment, not just
 * development.
 *
 * The previous version only cached in development, so in production the module
 * scope was the only thing holding the client. Any re-evaluation of this module
 * (route isolation, a new lambda instance) started a brand new connection and
 * paid the handshake again. Caching on globalThis makes warm invocations reuse
 * whatever connection already exists.
 */
if (!global._mongoClientPromise) {
  global._mongoClientPromise = new MongoClient(uri, options).connect();
}

const clientPromise: Promise<MongoClient> = global._mongoClientPromise;

export default clientPromise;
