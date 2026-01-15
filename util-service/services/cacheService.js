/**
 * Cache Service
 *
 * Manages in-memory caches for staging and production records.
 * Provides:
 * - Initial cache population from database
 * - Change stream watchers for real-time updates
 * - Cache accessors
 */

const { COLLECTIONS } = require('../db/collections');
const { config } = require('../config');

// In-memory caches
const cache = {
  staging: {
    byEid: {},
    byUser: {}
  },
  production: {
    byEid: {},
    byUser: {}
  }
};

/**
 * Get cache for environment
 * @param {string} env - 'staging' or 'production'
 * @returns {object} Cache object { byEid, byUser }
 */
function getCache(env) {
  return env === 'production' ? cache.production : cache.staging;
}

/**
 * Get staging cache
 * @returns {object} Staging cache { byEid, byUser }
 */
function getStagingCache() {
  return cache.staging;
}

/**
 * Get production cache
 * @returns {object} Production cache { byEid, byUser }
 */
function getProductionCache() {
  return cache.production;
}

/**
 * Normalize username (replace double spaces)
 * @param {string} user - Username to normalize
 * @returns {string} Normalized username
 */
function normalizeUser(user) {
  try {
    return user?.replace(/  /g, ' ') || user;
  } catch {
    return user;
  }
}

/**
 * Add or update a record in the cache
 * @param {string} env - 'staging' or 'production'
 * @param {object} doc - Document with index and _id
 */
function updateCacheEntry(env, doc) {
  if (!doc?.index?.eid) return;

  const { byEid, byUser } = getCache(env);
  const index = doc.index;

  // Add to byEid cache
  byEid[index.eid] = { ...index, _id: doc._id };

  // Add to byUser cache
  if (index.user) {
    const userName = normalizeUser(index.user);
    if (!byUser[userName]) {
      byUser[userName] = {};
    }
    byUser[userName][index.eid] = { ...index, _id: doc._id };
  }
}

/**
 * Remove a record from the cache by _id
 * @param {string} env - 'staging' or 'production'
 * @param {string} deletedId - The _id of the deleted document
 */
function removeCacheEntry(env, deletedId) {
  const { byEid, byUser } = getCache(env);
  const deletedIdStr = deletedId.toString();

  for (const eid in byEid) {
    if (byEid[eid]._id?.toString() === deletedIdStr) {
      const user = byEid[eid].user;
      delete byEid[eid];
      if (user && byUser[user]) {
        delete byUser[user][eid];
      }
      break;
    }
  }
}

/**
 * Populate cache from database
 * @param {object} db - MongoDB database instance
 * @param {string} env - 'staging' or 'production'
 * @returns {Promise<void>}
 */
async function populateCache(db, env) {
  const collectionName = env === 'production'
    ? COLLECTIONS.RESOURCES_PRODUCTION
    : COLLECTIONS.RESOURCES_STAGING;

  const now = Math.floor(Date.now() / 1000);
  const ageLimit = config.cache.ageLimitForAllRecords;

  const cursor = db.collection(collectionName).find({});

  await cursor.forEach((doc) => {
    if (!doc.index) return;

    // Only cache recent records
    const age = (now - doc.index.timestamp) / 60 / 60 / 24;
    if (age <= ageLimit) {
      updateCacheEntry(env, doc);
    }
  });

  const { byEid } = getCache(env);
  console.log(`Populated ${env} cache with ${Object.keys(byEid).length} records`);
}

/**
 * Setup change stream watcher for a collection
 * @param {object} db - MongoDB database instance
 * @param {string} env - 'staging' or 'production'
 * @param {object} mongo - MongoDB module (for ObjectID)
 */
function setupChangeStream(db, env, mongo) {
  const collectionName = env === 'production'
    ? COLLECTIONS.RESOURCES_PRODUCTION
    : COLLECTIONS.RESOURCES_STAGING;

  db.collection(collectionName).watch().on('change', async (data) => {
    // Handle delete operations
    if (data.operationType === 'delete') {
      removeCacheEntry(env, data.documentKey['_id']);
      return;
    }

    // Handle insert/update - fetch the document
    try {
      const doc = await db.collection(collectionName).findOne({
        '_id': new mongo.ObjectId(data.documentKey['_id'])
      });

      if (doc) {
        updateCacheEntry(env, doc);
      }
    } catch (err) {
      console.error(`Error processing ${env} change stream:`, err);
    }
  });

  console.log(`Change stream watcher setup for ${env}`);
}

/**
 * Initialize all caches and change streams
 * @param {object} db - MongoDB database instance
 * @param {object} mongo - MongoDB module (for ObjectID)
 * @returns {Promise<void>}
 */
async function initializeCaches(db, mongo) {
  // Populate caches
  await populateCache(db, 'staging');
  await populateCache(db, 'production');

  // Setup change streams
  setupChangeStream(db, 'staging', mongo);
  setupChangeStream(db, 'production', mongo);
}

/**
 * Clear all caches (useful for testing)
 */
function clearCaches() {
  cache.staging.byEid = {};
  cache.staging.byUser = {};
  cache.production.byEid = {};
  cache.production.byUser = {};
}

module.exports = {
  getCache,
  getStagingCache,
  getProductionCache,
  updateCacheEntry,
  removeCacheEntry,
  populateCache,
  setupChangeStream,
  initializeCaches,
  clearCaches
};
