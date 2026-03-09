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

      const doc = {
        timestamp: new Date(),
        username,
        eventType,
      };

      const parsedEid = parseEid(eId);
      if (parsedEid !== null) doc.eId = parsedEid;

      const parsedLccn = parseLccn(lccn);
      if (parsedLccn !== null) doc.lccn = parsedLccn;

      const parsedInstanceId = parseInstanceId(instanceId);
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
   * Query params: eId, lccn, instanceId, username, limit (default 100)
   */
  router.get('/events', requireAuth, async (req, res) => {
    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: 'Database not connected' });

      const query = {};
      if (req.query.eId) {
        const parsed = parseEid(req.query.eId);
        if (parsed !== null) query.eId = parsed;
      }
      if (req.query.lccn) {
        const parsed = parseLccn(req.query.lccn);
        if (parsed !== null) query.lccn = parsed;
      }
      if (req.query.instanceId) {
        query.instanceId = parseInstanceId(req.query.instanceId);
      }
      if (req.query.username) {
        query.username = req.query.username;
      }

      const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);

      const events = await db.collection(COLLECTIONS.EVENT_LOG)
        .find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();

      return res.json({ results: events });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createEventsRoutes };
