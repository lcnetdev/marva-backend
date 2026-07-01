/**
 * Activity Streams Routes
 *
 * Exposes a public, harvestable ActivityStreams 2.0 / EMM feed of published
 * records, newest first.
 *
 * - GET /activitystreams/:env            - OrderedCollection (entry point: totalItems, first, last)
 * - GET /activitystreams/:env/:page      - OrderedCollectionPage (the actual items)
 *
 * :env is 'production' or 'staging' (mapped to resourcesProduction / resourcesStaging).
 * :page is a 1-based page number; page 1 holds the most-recently published items.
 *
 * Only records with index.status === 'published' are included. Ordering is by
 * index.timestamp descending. Both the status filter and the timestamp sort are
 * served by existing indexes, so no schema/index changes are required.
 *
 * The feed is intentionally unauthenticated so external aggregators can harvest it,
 * matching the other read-only /allrecords endpoints.
 */

const express = require('express');
const { COLLECTIONS } = require('../db/collections');

// Number of items per OrderedCollectionPage.
const PAGE_SIZE = 100;

// Public base path used to build self / next / prev / partOf links. Behind the
// nginx reverse proxy the feed lives at /marva/util/activitystreams; override
// with ACTIVITYSTREAMS_BASE_URL for other deployments.
const BASE_PATH = (process.env.ACTIVITYSTREAMS_BASE_URL || '/marva/util/activitystreams')
  .replace(/\/+$/, '');

// JSON-LD context shared by the collection and its pages.
const AS_CONTEXT = [
  'https://www.w3.org/ns/activitystreams#',
  'https://emm-spec.org/0.1/context.json',
  {
    madsrdf: 'http://www.loc.gov/mads/rdf/v1#',
    skos: 'http://www.w3.org/2004/02/skos/core#',
    bf: 'http://id.loc.gov/ontologies/bibframe/'
  }
];

// env -> collection name
const ENV_COLLECTIONS = {
  production: COLLECTIONS.RESOURCES_PRODUCTION,
  staging: COLLECTIONS.RESOURCES_STAGING
};

/**
 * Wrap a value in an array (dropping null/undefined), so single-valued and
 * multi-valued index fields are handled uniformly.
 * @param {*} value
 * @returns {Array}
 */
function asArray(value) {
  if (Array.isArray(value)) return value.filter(v => v != null);
  if (value == null) return [];
  return [value];
}

/**
 * Map profiletypes (e.g. ["Work", "Instance"]) to prefixed types (["bf:Work", ...]).
 * @param {Array|string} profiletypes
 * @returns {string[]}
 */
function toBibframeTypes(profiletypes) {
  return asArray(profiletypes).map(t => `bf:${t}`);
}

/**
 * Map externalid URIs to ActivityStreams Link objects pointing at the RDF/XML
 * serialization, e.g. http://id.loc.gov/resources/works/123 ->
 * { type: "Link", href: "http://id.loc.gov/resources/works/123.rdf", mediaType: "application/rdf+xml" }
 * @param {Array|string} externalid
 * @returns {object[]}
 */
function toUrlLinks(externalid) {
  return asArray(externalid).map(href => ({
    type: 'Link',
    href: `${href}.rdf`,
    mediaType: 'application/rdf+xml'
  }));
}

/**
 * Convert a record's index timestamp (unix seconds) into an ISO-8601 UTC string,
 * e.g. 1773242742 -> "2026-03-11T15:25:42Z". Falls back to the raw index.time
 * string when no numeric timestamp is available.
 * @param {object} index
 * @returns {string|null}
 */
function toIsoDate(index) {
  const ts = index.timestamp;
  if (typeof ts === 'number' && Number.isFinite(ts)) {
    return new Date(ts * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  return index.time || null;
}

/**
 * Pick the object identifier: the BIBFRAME Work URI from externalid when present
 * (e.g. http://id.loc.gov/resources/works/123), otherwise fall back to the
 * internal eid.
 * @param {object} index
 * @returns {string|null}
 */
function pickObjectId(index) {
  const workUri = asArray(index.externalid)
    .find(uri => typeof uri === 'string' && /\/resources\/works\//.test(uri));
  return workUri || index.eid || null;
}

/**
 * Build a single ActivityStreams "Update" item from a record's index block.
 * @param {object} index - the record.index sub-document
 * @returns {object}
 */
function buildActivityItem(index = {}) {
  const published = toIsoDate(index);
  const object = {
    id: pickObjectId(index),
    title: index.title || null,
    updated: published,
    type: toBibframeTypes(index.profiletypes),
    url: toUrlLinks(index.externalid)
  };

  // BIBFRAME identifier extension — valid JSON-LD because "bf" is declared in
  // @context. Describes the resource, so it lives on the object.
  if (index.lccn) {
    object['bf:identifiedBy'] = [
      { type: 'bf:Lccn', value: index.lccn }
    ];
  }

  return {
    type: 'Update',
    published,
    actor: index.user || null,
    object
  };
}

/**
 * Create activity stream routes
 * @param {object} options - Configuration options
 * @param {function} options.getDb - Function to get database instance
 * @returns {Router} Express router
 */
function createActivityStreamsRoutes(options) {
  const router = express.Router();
  const { getDb } = options;

  const collectionUrl = (env) => `${BASE_PATH}/${env}`;
  const pageUrl = (env, page) => `${collectionUrl(env)}/${page}`;

  /**
   * GET /activitystreams/:env
   * Entry-point OrderedCollection describing the feed and linking to first/last pages.
   */
  router.get('/activitystreams/:env', async (req, res) => {
    const env = req.params.env;
    const collectionName = ENV_COLLECTIONS[env];
    if (!collectionName) {
      return res.status(404).json({ error: `Unknown environment '${env}'. Use 'production' or 'staging'.` });
    }

    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: 'Database not connected' });

      const totalItems = await db.collection(collectionName)
        .countDocuments({ 'index.status': 'published' });
      const lastPage = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

      res.json({
        '@context': AS_CONTEXT,
        summary: `Activity stream of published ${env} resources`,
        type: 'OrderedCollection',
        id: collectionUrl(env),
        totalItems,
        first: pageUrl(env, 1),
        last: pageUrl(env, lastPage)
      });
    } catch (err) {
      console.error('activitystreams collection error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /activitystreams/:env/:page
   * OrderedCollectionPage of published records, newest first.
   */
  router.get('/activitystreams/:env/:page', async (req, res) => {
    const env = req.params.env;
    const collectionName = ENV_COLLECTIONS[env];
    if (!collectionName) {
      return res.status(404).json({ error: `Unknown environment '${env}'. Use 'production' or 'staging'.` });
    }

    // Express 5 no longer supports inline path regexes, so validate the page here.
    const page = Number(req.params.page);
    if (!Number.isInteger(page) || page < 1) {
      return res.status(404).json({ error: `Invalid page '${req.params.page}'. Use a positive integer.` });
    }

    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: 'Database not connected' });

      const collection = db.collection(collectionName);
      const query = { 'index.status': 'published' };

      const totalItems = await collection.countDocuments(query);
      const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

      const docs = await collection
        .find(query)
        .project({ index: 1 })
        .sort({ 'index.timestamp': -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .toArray();

      const body = {
        '@context': AS_CONTEXT,
        summary: `Page ${page} of ${totalPages} pages in ${collectionUrl(env)}`,
        type: 'OrderedCollectionPage',
        id: pageUrl(env, page),
        partOf: collectionUrl(env),
        startIndex: (page - 1) * PAGE_SIZE,
        orderedItems: docs.map(d => buildActivityItem(d.index))
      };

      // prev is newer, next is older; only include them when they exist.
      if (page > 1) body.prev = pageUrl(env, page - 1);
      if (page < totalPages) body.next = pageUrl(env, page + 1);

      res.json(body);
    } catch (err) {
      console.error('activitystreams page error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createActivityStreamsRoutes };
