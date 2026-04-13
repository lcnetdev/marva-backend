/**
 * MongoDB Collection Constants and Helpers
 *
 * Centralizes collection names and index definitions
 */

// Collection name constants
const COLLECTIONS = {
  RESOURCES_STAGING: 'resourcesStaging',
  RESOURCES_PRODUCTION: 'resourcesProduction',
  TEMPLATES: 'templates',
  PROFILES: 'profiles',
  LCCN_NACO: 'lccnNACO',
  MARVA_001: 'marva001',
  USER_PREFS: 'userPrefs',
  ERROR_REPORTS: 'errorReports',
  USERS: 'users',
  EVENT_LOG: 'eventLog',
  FEATURE_FLAGS: 'featureFlags'
};

// Index definitions for each collection
const INDEXES = {
  [COLLECTIONS.RESOURCES_STAGING]: [
    { key: { 'index.eid': 1 }, name: 'eid_index' },
    { key: { 'index.user': 1 }, name: 'user_index' },
    { key: { 'index.timestamp': -1 }, name: 'timestamp_index' },
    { key: { 'index.status': 1 }, name: 'status_index' }
  ],
  [COLLECTIONS.RESOURCES_PRODUCTION]: [
    { key: { 'index.eid': 1 }, name: 'eid_index' },
    { key: { 'index.user': 1 }, name: 'user_index' },
    { key: { 'index.timestamp': -1 }, name: 'timestamp_index' },
    { key: { 'index.status': 1 }, name: 'status_index' }
  ],
  [COLLECTIONS.TEMPLATES]: [
    { key: { id: 1 }, name: 'id_index' },
    { key: { user: 1 }, name: 'user_index' }
  ],
  [COLLECTIONS.PROFILES]: [
    { key: { id: 1 }, name: 'id_index' }
  ],
  [COLLECTIONS.USER_PREFS]: [
    { key: { user: 1 }, name: 'user_index', unique: true }
  ],
  [COLLECTIONS.ERROR_REPORTS]: [
    { key: { timestamp: -1 }, name: 'timestamp_index' }
  ],
  [COLLECTIONS.USERS]: [
    { key: { username: 1 }, name: 'username_index', unique: true }
  ],
  [COLLECTIONS.EVENT_LOG]: [
    { key: { username: 1 }, name: 'username_index' },
    { key: { eId: 1 }, name: 'eid_index' },
    { key: { lccn: 1 }, name: 'lccn_index' },
    { key: { instanceId: 1 }, name: 'instanceId_index' },
    { key: { timestamp: -1 }, name: 'timestamp_index' }
  ],
  [COLLECTIONS.FEATURE_FLAGS]: [
    { key: { type: 1, name: 1 }, name: 'type_name_index' },
    { key: { type: 1, username: 1 }, name: 'type_username_index' },
    { key: { type: 1, feature: 1, username: 1 }, name: 'assignment_unique_index', unique: true }
  ]
};

/**
 * Ensure indexes exist for a collection
 * @param {object} db - MongoDB database instance
 * @param {string} collectionName - Name of the collection
 * @returns {Promise<void>}
 */
async function ensureIndexes(db, collectionName) {
  const indexes = INDEXES[collectionName];
  if (!indexes) return;

  const collection = db.collection(collectionName);

  for (const index of indexes) {
    try {
      await collection.createIndex(index.key, {
        name: index.name,
        unique: index.unique || false,
        background: true
      });
    } catch (err) {
      // Index might already exist, that's OK
      if (err.code !== 85 && err.code !== 86) {
        console.error(`Error creating index ${index.name} on ${collectionName}:`, err);
      }
    }
  }
}

/**
 * Ensure all indexes exist for all collections
 * @param {object} db - MongoDB database instance
 * @returns {Promise<void>}
 */
async function ensureAllIndexes(db) {
  for (const collectionName of Object.values(COLLECTIONS)) {
    await ensureIndexes(db, collectionName);
  }
}

/**
 * Get collection for resources based on environment
 * @param {string} env - Environment ('staging' or 'production')
 * @returns {string} Collection name
 */
function getResourcesCollection(env) {
  return env === 'production'
    ? COLLECTIONS.RESOURCES_PRODUCTION
    : COLLECTIONS.RESOURCES_STAGING;
}

module.exports = {
  COLLECTIONS,
  INDEXES,
  ensureIndexes,
  ensureAllIndexes,
  getResourcesCollection
};
