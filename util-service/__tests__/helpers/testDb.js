const { MongoClient } = require('mongodb');

let client = null;
let db = null;

/**
 * Connect to the test database
 */
async function connectTestDb() {
  if (client && db) {
    return db;
  }

  const uri = global.__MONGO_URI__;
  client = await MongoClient.connect(uri);
  db = client.db('bfe2_test');
  return db;
}

/**
 * Close the test database connection
 */
async function closeTestDb() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

/**
 * Get the test database instance
 */
function getTestDb() {
  return db;
}

/**
 * Get the MongoDB client
 */
function getTestClient() {
  return client;
}

/**
 * Seed a collection with test data
 */
async function seedCollection(collectionName, data) {
  const database = await connectTestDb();
  const collection = database.collection(collectionName);

  if (Array.isArray(data)) {
    if (data.length > 0) {
      await collection.insertMany(data);
    }
  } else {
    await collection.insertOne(data);
  }

  return collection;
}

/**
 * Clear a collection
 */
async function clearCollection(collectionName) {
  const database = await connectTestDb();
  try {
    await database.collection(collectionName).deleteMany({});
  } catch (err) {
    // Collection might not exist, that's ok
  }
}

/**
 * Clear all collections
 */
async function clearAllCollections() {
  const database = await connectTestDb();
  const collections = await database.listCollections().toArray();

  for (const collection of collections) {
    await database.collection(collection.name).deleteMany({});
  }
}

/**
 * Get a collection reference
 */
async function getCollection(collectionName) {
  const database = await connectTestDb();
  return database.collection(collectionName);
}

/**
 * Find documents in a collection
 */
async function findInCollection(collectionName, query = {}) {
  const database = await connectTestDb();
  return database.collection(collectionName).find(query).toArray();
}

/**
 * Find one document in a collection
 */
async function findOneInCollection(collectionName, query = {}) {
  const database = await connectTestDb();
  return database.collection(collectionName).findOne(query);
}

module.exports = {
  connectTestDb,
  closeTestDb,
  getTestDb,
  getTestClient,
  seedCollection,
  clearCollection,
  clearAllCollections,
  getCollection,
  findInCollection,
  findOneInCollection
};
