/**
 * Event Log Routes
 *
 * Tracks user activity in the system:
 * - POST /events - Log an event
 * - GET /events - Query events by eId, lccn, or instanceId
 */

const express = require('express');
const { COLLECTIONS } = require('../db/collections');
const { requireAuth } = require('../middleware/jwtAuth');

/**
 * Hostname-to-region map for event tracking.
 * Matches the domain config in config/domains.js.
 */
const REGION_MAP = {
  'localhost':                  'dev',
  'preprod-3001.id.loc.gov':   'staging',
  'editor.id.loc.gov':         'production',
};

/**
 * Resolve region from request hostname.
 * @param {object} req - Express request
 * @returns {string} region label ("dev", "staging", "production", or "unknown")
 */
function resolveRegion(req) {
  const raw = req.headers['x-forwarded-host'] || req.headers['host'] || '';
  const hostname = raw.split(':')[0].toLowerCase().trim();
  return REGION_MAP[hostname] || 'unknown';
}

/**
 * Parse an eId string: strip leading "e" and convert to number.
 * @param {string|number} raw - e.g. "e1772907836100" or 1772907836100
 * @returns {number|null}
 */
function parseEid(raw) {
  if (raw === undefined || raw === null) return null;
  const stripped = String(raw).replace(/^e/i, '');
  const num = Number(stripped);
  return Number.isFinite(num) ? num : null;
}

/**
 * Parse an LCCN string: strip leading whitespace and non-digit characters,
 * convert to number.
 * @param {string|number} raw - e.g. "  2001059208" or "n2001059208"
 * @returns {number|null}
 */
function parseLccn(raw) {
  if (raw === undefined || raw === null) return null;
  const stripped = String(raw).replace(/^[^0-9]+/, '');
  const num = Number(stripped);
  return Number.isFinite(num) ? num : null;
}

/**
 * Parse an instanceId: extract the last path segment if it's a URL.
 * @param {string} raw - e.g. "http://id.loc.gov/resources/instances/12618072" or "12618072"
 * @returns {string|null}
 */
function parseInstanceId(raw) {
  if (raw === undefined || raw === null) return null;
  const segments = String(raw).split('/');
  return segments[segments.length - 1] || String(raw);
}

/**
 * Create event log routes
 * @param {object} options - Configuration options
 * @param {function} options.getDb - Function to get database instance
 * @returns {Router} Express router
 */
function createEventsRoutes(options) {
  const router = express.Router();
  const { getDb } = options;

  // Cached username → full name map, refreshed at most once per hour
  let userNameMap = null;
  let userNameMapAge = 0;
  const USER_MAP_TTL = 60 * 60 * 1000; // 1 hour

  async function getUserNameMap() {
    const now = Date.now();
    if (userNameMap && (now - userNameMapAge) < USER_MAP_TTL) return userNameMap;
    try {
      const db = getDb();
      if (!db) return userNameMap || {};
      const users = await db.collection(COLLECTIONS.USERS)
        .find({}, { projection: { _id: 0, username: 1, name: 1 } })
        .toArray();
      userNameMap = {};
      for (const u of users) {
        if (u.username) userNameMap[u.username] = u.name || '';
      }
      userNameMapAge = now;
    } catch (e) {
      // Keep stale cache on error
      if (!userNameMap) userNameMap = {};
    }
    return userNameMap;
  }

  /**
   * Attach `name` to each event (and SAVED_RECORD metadata entries).
   */
  function enrichWithNames(events, nameMap) {
    for (const evt of events) {
      if (evt.username && nameMap[evt.username]) {
        evt.name = nameMap[evt.username];
      }
      if (Array.isArray(evt.metadata)) {
        for (const m of evt.metadata) {
          if (m.user && nameMap[m.user]) {
            m.name = nameMap[m.user];
          }
        }
      }
    }
  }

  /**
   * POST /events - Log an event
   * Body: { username, eventType, eId?, lccn?, instanceId?, metadata? }
   * JWT username must match body username
   */
  router.post('/events', requireAuth, async (req, res) => {
    const { username, eventType, eId, lccn, instanceId, metadata } = req.body;
    if (!username || !eventType) {
      return res.status(400).json({ error: 'username and eventType are required' });
    }
    if (req.user.username !== username) {
      return res.status(403).json({ error: 'Forbidden: token does not match username' });
    }
    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: 'Database not connected' });

      const now = new Date();
      const parsedEid = parseEid(eId);
      let parsedLccn = parseLccn(lccn);
      const parsedInstanceId = parseInstanceId(instanceId);
      const region = resolveRegion(req);

      // LCAP_SYNC_REQ: extract LCCN from metadata[0]
      if (eventType === 'LCAP_SYNC_REQ' && Array.isArray(metadata) && metadata.length > 0) {
        const extracted = parseLccn(metadata[0]);
        if (extracted !== null) parsedLccn = extracted;
      }

      // SAVED_RECORD: one doc per eId, append save entries to metadata array
      if (eventType === 'SAVED_RECORD' && parsedEid !== null) {
        const result = await db.collection(COLLECTIONS.EVENT_LOG).updateOne(
          { eventType: 'SAVED_RECORD', eId: parsedEid },
          {
            $set: { timestamp: now },
            $push: { metadata: { user: username, time: now.toISOString() } },
            $setOnInsert: {
              username,
              eventType: 'SAVED_RECORD',
              eId: parsedEid,
              region,
              ...(parsedLccn !== null && { lccn: parsedLccn }),
              ...(parsedInstanceId !== null && { instanceId: parsedInstanceId }),
            },
          },
          { upsert: true }
        );
        return res.status(201).json({ msg: 'Event logged', upserted: !!result.upsertedId });
      }

      // All other event types: insert a new document
      const doc = {
        timestamp: now,
        username,
        eventType,
        region,
      };

      if (parsedEid !== null) doc.eId = parsedEid;
      if (parsedLccn !== null) doc.lccn = parsedLccn;
      if (parsedInstanceId !== null) doc.instanceId = parsedInstanceId;

      if (metadata !== undefined) {
        doc.metadata = Array.isArray(metadata) ? metadata : [metadata];
      }

      await db.collection(COLLECTIONS.EVENT_LOG).insertOne(doc);
      return res.status(201).json({ msg: 'Event logged' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /events - Query events
   * Query params: eId, lccn, instanceId, username, region, limit (default 100)
   *
   * region: "all" returns all regions; omit to auto-detect from hostname;
   *         or pass "dev", "staging", "production" explicitly.
   *
   * LCCN queries also fetch related events by eId: if the LCCN result set
   * contains eIds, those eIds are used to find additional events that may
   * not have the LCCN (e.g. early saves before LCCN was assigned).
   */
  router.get('/events', requireAuth, async (req, res) => {
    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: 'Database not connected' });

      // Region filter: "all" skips filter, otherwise auto-detect from host
      const regionParam = (req.query.region || '').toLowerCase().trim();
      const regionFilter = regionParam === 'all' ? null : (regionParam || resolveRegion(req));

      const baseQuery = {};
      if (regionFilter) baseQuery.region = regionFilter;
      if (req.query.instanceId) baseQuery.instanceId = parseInstanceId(req.query.instanceId);
      if (req.query.username) baseQuery.username = req.query.username;

      const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
      const collection = db.collection(COLLECTIONS.EVENT_LOG);

      // If querying by LCCN, also gather related eIds and interleave
      if (req.query.lccn) {
        const parsedLccn = parseLccn(req.query.lccn);
        if (parsedLccn === null) {
          return res.json({ results: [] });
        }

        // Step 1: find events matching the LCCN
        const lccnQuery = { ...baseQuery, lccn: parsedLccn };
        const lccnEvents = await collection.find(lccnQuery)
          .sort({ timestamp: -1 }).limit(limit).toArray();

        // Step 2: collect eIds from the LCCN results
        const eIds = new Set();
        for (const evt of lccnEvents) {
          if (evt.eId != null) eIds.add(evt.eId);
        }

        // Also include an explicitly requested eId
        if (req.query.eId) {
          const parsed = parseEid(req.query.eId);
          if (parsed !== null) eIds.add(parsed);
        }

        // Step 3: find events by those eIds that weren't already in LCCN results
        let eidEvents = [];
        if (eIds.size > 0) {
          const eidQuery = { ...baseQuery, eId: { $in: [...eIds] }, lccn: { $ne: parsedLccn } };
          eidEvents = await collection.find(eidQuery)
            .sort({ timestamp: -1 }).limit(limit).toArray();
        }

        // Step 4: merge and sort by timestamp descending, dedupe by _id
        const seen = new Set();
        const merged = [...lccnEvents, ...eidEvents]
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .filter(evt => {
            const id = evt._id.toString();
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          })
          .slice(0, limit);

        const nameMap = await getUserNameMap();
        enrichWithNames(merged, nameMap);
        return res.json({ results: merged });
      }

      // Standard query (no LCCN)
      if (req.query.eId) {
        const parsed = parseEid(req.query.eId);
        if (parsed !== null) baseQuery.eId = parsed;
      }

      const events = await collection.find(baseQuery)
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();

      const nameMap = await getUserNameMap();
      enrichWithNames(events, nameMap);
      return res.json({ results: events });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createEventsRoutes };
