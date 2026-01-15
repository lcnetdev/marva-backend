/**
 * Error Reporting Routes
 *
 * Handles error report management:
 * - POST /error/report - Submit error report
 * - GET /error/report - Get all error reports
 * - GET /error/:errorId - Get specific error report
 */

const express = require('express');
const { COLLECTIONS } = require('../db/collections');

/**
 * Create error reporting routes
 * @param {object} options - Configuration options
 * @param {function} options.getDb - Function to get database instance
 * @param {object} options.mongo - MongoDB module (for ObjectID)
 * @returns {Router} Express router
 */
function createErrorsRoutes(options) {
  const router = express.Router();
  const { getDb, mongo } = options;

  /**
   * POST /error/report - Submit an error report
   */
  router.post('/error/report', async (req, res) => {
    try {
      const db = getDb();
      if (!db) {
        return res.json({ result: false, error: 'Database not connected' });
      }

      const body = { ...req.body };

      // Stringify activeProfile if it's an object
      if (body.activeProfile && typeof body.activeProfile === 'object') {
        body.activeProfile = JSON.stringify(body.activeProfile);
      }

      await db.collection(COLLECTIONS.ERROR_REPORTS).insertOne(body);

      return res.json({ result: true, error: null });
    } catch (err) {
      return res.json({ result: false, error: err.message });
    }
  });

  /**
   * GET /error/report - Get all error reports (summary)
   */
  router.get('/error/report', async (req, res) => {
    try {
      const db = getDb();
      if (!db) {
        return res.json([]);
      }

      const results = await db.collection(COLLECTIONS.ERROR_REPORTS)
        .find({})
        .toArray();

      // Format for listing
      const formatted = results.map(doc => ({
        id: doc._id,
        eId: doc.eId,
        desc: doc.desc,
        contact: doc.contact
      }));

      return res.json(formatted.reverse());
    } catch (err) {
      return res.json([]);
    }
  });

  /**
   * GET /error/:errorId - Get specific error report (returns activeProfile)
   */
  router.get('/error/:errorId', async (req, res) => {
    // Validate ObjectID format
    try {
      new mongo.ObjectId(req.params.errorId);
    } catch {
      return res.json(false);
    }

    try {
      const db = getDb();
      if (!db) {
        return res.json(false);
      }

      const doc = await db.collection(COLLECTIONS.ERROR_REPORTS).findOne({
        _id: new mongo.ObjectId(req.params.errorId)
      });

      if (!doc) {
        return res.json(false);
      }

      // Parse and return the activeProfile
      const profile = JSON.parse(doc.activeProfile);
      return res.type('json').send(JSON.stringify(profile, null, 2) + '\n');
    } catch (err) {
      return res.json(false);
    }
  });

  return router;
}

module.exports = { createErrorsRoutes };
