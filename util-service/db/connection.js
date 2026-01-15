/**
 * MongoDB Connection Management
 *
 * Provides a centralized connection to MongoDB with:
 * - Single shared connection across the application
 * - Reconnection handling
 * - Connection state tracking
 */

const { MongoClient } = require('mongodb');

// Default connection settings
const DEFAULT_URI = 'mongodb://mongo:27017/';
const DEFAULT_DB = 'bfe2';

// Connection state
let client = null;
let db = null;
let isConnected = false;

/**
 * Connect to MongoDB
 * @param {object} options - Connection options
 * @param {string} options.uri - MongoDB connection URI
 * @param {string} options.dbName - Database name
 * @returns {Promise<object>} Database instance
 */
async function connect(options = {}) {
  const uri = options.uri || process.env.MONGO_URI || DEFAULT_URI;
  const dbName = options.dbName || process.env.MONGO_DB || DEFAULT_DB;

  if (isConnected && db) {
    return db;
  }

  try {
    client = await MongoClient.connect(uri);

    db = client.db(dbName);
    isConnected = true;

    console.log(`Connected to MongoDB: ${dbName}`);

    // Handle connection events
    client.on('close', () => {
      console.log('MongoDB connection closed');
      isConnected = false;
    });

    client.on('error', (err) => {
      console.error('MongoDB connection error:', err);
      isConnected = false;
    });

    return db;
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    throw err;
  }
}

/**
 * Get the current database instance
 * @returns {object|null} Database instance or null if not connected
 */
function getDb() {
  return db;
}

/**
 * Get the current client instance
 * @returns {object|null} MongoClient instance or null if not connected
 */
function getClient() {
  return client;
}

/**
 * Check if connected to MongoDB
 * @returns {boolean} Connection status
 */
function isDbConnected() {
  return isConnected && db !== null;
}

/**
 * Close the MongoDB connection
 * @returns {Promise<void>}
 */
async function close() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    isConnected = false;
    console.log('MongoDB connection closed');
  }
}

/**
 * Get a collection from the database
 * @param {string} collectionName - Name of the collection
 * @returns {object} MongoDB collection
 */
function getCollection(collectionName) {
  if (!db) {
    throw new Error('Database not connected. Call connect() first.');
  }
  return db.collection(collectionName);
}

module.exports = {
  connect,
  getDb,
  getClient,
  getCollection,
  isDbConnected,
  close,
  DEFAULT_URI,
  DEFAULT_DB
};
