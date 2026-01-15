/**
 * User Preferences Routes
 *
 * Handles user preference management:
 * - POST /prefs/:user - Save user preferences
 * - GET /prefs/:user - Get user preferences
 */

const express = require('express');
const { COLLECTIONS } = require('../db/collections');

/**
 * Create user preferences routes
 * @param {object} options - Configuration options
 * @param {function} options.getDb - Function to get database instance
 * @param {object} options.mongo - MongoDB module (for ObjectID)
 * @returns {Router} Express router
 */
function createPrefsRoutes(options) {
  const router = express.Router();
  const { getDb, mongo } = options;

  /**
   * POST /prefs/:user - Save user preferences
   */
  router.post('/prefs/:user', async (req, res) => {
    const user = req.params.user;
    const newPrefs = req.body;

    try {
      const db = getDb();
      if (!db) {
        return res.status(500).json({ msg: 'Database not connected' });
      }

      const doc = await db.collection(COLLECTIONS.USER_PREFS).findOne({ user });

      if (!doc) {
        await db.collection(COLLECTIONS.USER_PREFS).insertOne({
          user,
          prefs: JSON.stringify(newPrefs)
        });
        return res.status(200).json({ msg: 'Success!' });
      } else {
        await db.collection(COLLECTIONS.USER_PREFS).updateOne(
          { _id: new mongo.ObjectId(doc._id) },
          { $set: { prefs: JSON.stringify(newPrefs) } }
        );
        return res.status(200).json({ msg: 'updated' });
      }
    } catch (err) {
      return res.status(500).json({ msg: 'Error: ' + err.message });
    }
  });

  /**
   * GET /prefs/:user - Get user preferences
   */
  router.get('/prefs/:user', async (req, res) => {
    const user = req.params.user;

    try {
      const db = getDb();
      if (!db) {
        return res.status(500).json({ result: 'Database not connected' });
      }

      const doc = await db.collection(COLLECTIONS.USER_PREFS).findOne({ user });

      if (!doc) {
        return res.status(200).json({ result: {} });
      }

      try {
        const prefs = JSON.parse(doc.prefs);
        return res.status(200).json({ result: prefs });
      } catch (parseErr) {
        return res.status(500).json({ result: 'Failed to parse prefs: ' + parseErr.message });
      }
    } catch (err) {
      return res.status(500).json({ result: 'Error: ' + err.message });
    }
  });

  return router;
}

module.exports = { createPrefsRoutes };
