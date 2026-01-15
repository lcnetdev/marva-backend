/**
 * LDP (Linked Data Platform) Service
 *
 * Handles storage and retrieval of RDF/XML records in MongoDB.
 * Replaces the ldpjs service functionality.
 */

const { extractIndexFromRdf } = require('../utils/rdfParser');

// Collection names for staging and production environments
const COLLECTIONS = {
  staging: 'resourcesStaging',
  production: 'resourcesProduction'
};

/**
 * Get the collection name for an environment
 * @param {string} env - Environment ('staging' or 'production')
 * @returns {string} Collection name
 */
function getCollectionName(env) {
  return COLLECTIONS[env] || COLLECTIONS.staging;
}

/**
 * Store an RDF/XML record
 * @param {object} db - MongoDB database instance
 * @param {string} env - Environment ('staging' or 'production')
 * @param {string} eid - Record EID
 * @param {string} rdfContent - RDF/XML content
 * @param {object} cache - In-memory cache objects { byEid, byUser }
 * @returns {Promise<object>} Result with status
 */
async function storeRecord(db, env, eid, rdfContent, cache = null) {
  const collectionName = getCollectionName(env);
  const collection = db.collection(collectionName);

  // Extract index fields from the RDF/XML
  const index = extractIndexFromRdf(rdfContent);

  // URL eid takes precedence over embedded eid
  index.eid = eid;

  // Check if record exists
  const existingDoc = await collection.findOne({ 'index.eid': eid });

  if (existingDoc) {
    // Update existing record
    await collection.updateOne(
      { _id: existingDoc._id },
      { $set: { index, data: rdfContent } }
    );
  } else {
    // Insert new record
    await collection.insertOne({ index, data: rdfContent });
  }

  // Update in-memory cache if provided
  if (cache) {
    const { byEid, byUser } = cache;
    if (byEid) {
      byEid[eid] = index;
    }
    if (byUser && index.user) {
      if (!byUser[index.user]) {
        byUser[index.user] = {};
      }
      byUser[index.user][eid] = index;
    }
  }

  return { status: 'success', eid, env };
}

/**
 * Retrieve an RDF/XML record
 * @param {object} db - MongoDB database instance
 * @param {string} env - Environment ('staging' or 'production')
 * @param {string} eid - Record EID
 * @returns {Promise<string|null>} RDF/XML content or null if not found
 */
async function getRecord(db, env, eid) {
  const collectionName = getCollectionName(env);
  const collection = db.collection(collectionName);

  const doc = await collection.findOne({ 'index.eid': eid });

  if (!doc) {
    return null;
  }

  // Support both new format (data field) and old ldpjs format (versions[0].content)
  if (doc.data) {
    return doc.data;
  }

  if (doc.versions && doc.versions.length > 0 && doc.versions[0].content) {
    return doc.versions[0].content;
  }

  return null;
}

/**
 * Delete an RDF/XML record (soft delete - marks status as 'deleted')
 * @param {object} db - MongoDB database instance
 * @param {string} env - Environment ('staging' or 'production')
 * @param {string} eid - Record EID
 * @param {object} cache - In-memory cache objects { byEid, byUser }
 * @returns {Promise<boolean>} True if record was found and deleted
 */
async function deleteRecord(db, env, eid, cache = null) {
  const collectionName = getCollectionName(env);
  const collection = db.collection(collectionName);

  const doc = await collection.findOne({ 'index.eid': eid });

  if (!doc) {
    return false;
  }

  // Soft delete - update status
  await collection.updateOne(
    { _id: doc._id },
    { $set: { 'index.status': 'deleted' } }
  );

  // Update in-memory cache if provided
  if (cache) {
    const { byEid, byUser } = cache;
    if (byEid && byEid[eid]) {
      byEid[eid].status = 'deleted';
    }
    if (byUser && doc.index?.user && byUser[doc.index.user]?.[eid]) {
      byUser[doc.index.user][eid].status = 'deleted';
    }
  }

  return true;
}

/**
 * Check if a record exists
 * @param {object} db - MongoDB database instance
 * @param {string} env - Environment ('staging' or 'production')
 * @param {string} eid - Record EID
 * @returns {Promise<boolean>} True if record exists
 */
async function recordExists(db, env, eid) {
  const collectionName = getCollectionName(env);
  const collection = db.collection(collectionName);

  const count = await collection.countDocuments({ 'index.eid': eid }, { limit: 1 });
  return count > 0;
}

module.exports = {
  storeRecord,
  getRecord,
  deleteRecord,
  recordExists,
  getCollectionName,
  COLLECTIONS
};
