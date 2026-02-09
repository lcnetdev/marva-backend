/**
 * Server Entry Point
 *
 * Initializes database connection, caches, and starts the Express server.
 */

const fs = require('fs');
const mongo = require('mongodb');
const MongoClient = mongo.MongoClient;

const { config } = require('./config');
const { createApp } = require('./app');
const { COLLECTIONS, ensureAllIndexes } = require('./db/collections');
const { initializeCaches, getStagingCache, getProductionCache } = require('./services/cacheService');

// State objects
let globalDb = null;
let nacoIdObj = null;
let marva001Obj = null;
let postLog = [];

// Editor versions
let editorVersion = { major: 0, minor: 0, patch: 0 };
let editorVersionStage = { major: 0, minor: 0, patch: 0 };

try {
  editorVersion = JSON.parse(fs.readFileSync('ver_prod.json', 'utf8'));
} catch {
  console.error('Missing ver_prod.json');
}

try {
  editorVersionStage = JSON.parse(fs.readFileSync('ver_stage.json', 'utf8'));
} catch {
  console.error('Missing ver_stage.json');
}

// Connect to MongoDB and start server
const uri = config.mongodb.uri;

MongoClient.connect(uri).then(async (client) => {

  console.log('Connected to MongoDB');
  const db = client.db(config.mongodb.db);
  globalDb = db;

  // Initialize NACO ID
  const nacoDoc = await db.collection(COLLECTIONS.LCCN_NACO).findOne({});
  if (!nacoDoc) {
    await db.collection(COLLECTIONS.LCCN_NACO).insertOne({ id: config.ids.nacoStart });
    nacoIdObj = await db.collection(COLLECTIONS.LCCN_NACO).findOne({});
    console.log('Inserted initial NACO ID');
  } else {
    nacoIdObj = nacoDoc;
  }

  // Initialize MARVA001 ID
  const marvaDoc = await db.collection(COLLECTIONS.MARVA_001).findOne({});
  if (!marvaDoc) {
    await db.collection(COLLECTIONS.MARVA_001).insertOne({ id: config.ids.marva001Start });
    marva001Obj = await db.collection(COLLECTIONS.MARVA_001).findOne({});
    console.log('Inserted initial MARVA001 ID');
  } else {
    marva001Obj = marvaDoc;
  }

  // Initialize user preferences collection
  const prefsDoc = await db.collection(COLLECTIONS.USER_PREFS).findOne({});
  if (!prefsDoc) {
    await db.collection(COLLECTIONS.USER_PREFS).insertOne({ user: 'test0123456789', prefs: ':)' });
  }

  // Ensure MongoDB indexes exist
  await ensureAllIndexes(db);
  console.log('MongoDB indexes ensured');

  // Initialize caches and change streams in background (don't block server startup)
  initializeCaches(db, mongo).catch(err => {
    console.error('Error initializing caches:', err);
  });

  // Create Express app
  const app = createApp({
    getDb: () => globalDb,
    mongo,
    getNacoIdObj: () => nacoIdObj,
    setNacoIdObj: (obj) => { nacoIdObj = obj; },
    getMarva001Obj: () => marva001Obj,
    setMarva001Obj: (obj) => { marva001Obj = obj; },
    editorVersion,
    editorVersionStage,
    postLog
  });

  // Start server
  const port = config.port;
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}).catch((err) => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});
