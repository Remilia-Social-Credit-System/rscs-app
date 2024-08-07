import { MongoClient, Db } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

interface MongoDBCache {
  conn: MongoClient | null;
  promise: Promise<MongoClient> | null;
}

declare global {
  var mongodb: MongoDBCache;
}

let cached = global.mongodb;

if (!cached) {
  cached = global.mongodb = { conn: null, promise: null };
}

async function connectToDatabase(): Promise<{ client: MongoClient, db: Db }> {
  if (cached.conn) {
    return { client: cached.conn, db: cached.conn.db('RSCS') };
  }

  if (!cached.promise) {
    cached.promise = MongoClient.connect(MONGODB_URI as string).then(async (client) => {
      const db = client.db('RSCS');
      const collection = db.collection('Users');

      // Update existing documents to include score and votes fields
      await collection.updateMany(
        { score: { $exists: false } },
        { $set: { score: { up: 0, down: 0 }, votes: [] } }
      );

      return client;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return { client: cached.conn, db: cached.conn.db('RSCS') };
}

export default connectToDatabase;
