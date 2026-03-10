/**
 * User Routes
 *
 * Manages user metadata stored in the users collection:
 * - PUT /users/:username/catId - Update user's cataloger ID
 * - POST /users/:username/lastLogin - Touch lastLogin timestamp
 * - GET /users/:username - Get user profile
 */

const express = require('express');
const { COLLECTIONS } = require('../db/collections');
const { requireAuth } = require('../middleware/jwtAuth');

/**
 * Create user routes
 * @param {object} options - Configuration options
 * @param {function} options.getDb - Function to get database instance
 * @returns {Router} Express router
 */
function createUsersRoutes(options) {
  const router = express.Router();
  const { getDb } = options;

  /**
   * PUT /users/:username/catId - Update cataloger ID
   * Body: { "catId": "mm123" }
   * JWT username must match :username
   */
  router.put('/users/:username/catId', requireAuth, async (req, res) => {
    const { username } = req.params;
    if (req.user.username !== username) {
      return res.status(403).json({ error: 'Forbidden: token does not match username' });
    }
    const { catId } = req.body;
    if (!catId || typeof catId !== 'string') {
      return res.status(400).json({ error: 'catId is required and must be a string' });
    }
    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: 'Database not connected' });
      const result = await db.collection(COLLECTIONS.USERS).updateOne(
        { username },
        { $set: { catId, updatedAt: new Date() } }
      );
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.json({ msg: 'catId updated' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /users/:username/lastLogin - Update lastLogin timestamp
   * JWT username must match :username
   */
  router.post('/users/:username/lastLogin', requireAuth, async (req, res) => {
    const { username } = req.params;
    if (req.user.username !== username) {
      return res.status(403).json({ error: 'Forbidden: token does not match username' });
    }
    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: 'Database not connected' });
      const result = await db.collection(COLLECTIONS.USERS).updateOne(
        { username },
        { $set: { lastLogin: new Date() } }
      );
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.json({ msg: 'lastLogin updated' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /users/:username - Get user profile
   * JWT username must match :username
   */
  router.get('/users/:username', requireAuth, async (req, res) => {
    const { username } = req.params;
    if (req.user.username !== username) {
      return res.status(403).json({ error: 'Forbidden: token does not match username' });
    }
    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: 'Database not connected' });
      const user = await db.collection(COLLECTIONS.USERS).findOne(
        { username },
        { projection: { _id: 0 } }
      );
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.json(user);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /users - List all users (username, name, catId, catIdHistory)
   */
  router.get('/users', requireAuth, async (req, res) => {
    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: 'Database not connected' });
      const users = await db.collection(COLLECTIONS.USERS).find(
        {},
        { projection: { _id: 0, username: 1, name: 1, catId: 1, catIdHistory: 1 } }
      ).sort({ name: 1 }).toArray();
      return res.json({ results: users });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createUsersRoutes };
