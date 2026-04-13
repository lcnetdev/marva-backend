/**
 * Feature Flag Routes
 *
 * Admin endpoints (deploy password auth):
 * - GET /feature-flags - List all features
 * - POST /feature-flags - Create a feature
 * - DELETE /feature-flags/:name - Delete a feature and its assignments
 * - GET /feature-flags/:name/users - List users assigned to a feature
 * - POST /feature-flags/:name/users - Assign users to a feature
 * - DELETE /feature-flags/:name/users/:username - Remove user from a feature
 * - GET /feature-flags/users-list - List all users (for admin UI)
 *
 * Client endpoint (JWT auth):
 * - GET /my-features - Get authenticated user's enabled features
 */

const express = require('express');
const { COLLECTIONS } = require('../db/collections');
const { hasDeployAuth } = require('../config');
const { requireAuth } = require('../middleware/jwtAuth');

/**
 * Create feature flag routes
 * @param {object} options - Configuration options
 * @param {function} options.getDb - Function to get database instance
 * @returns {Router} Express router
 */
function createFeatureFlagRoutes(options) {
  const router = express.Router();
  const { getDb } = options;

  // ============================================
  // CLIENT ENDPOINT
  // ============================================

  /**
   * GET /my-features - Get the authenticated user's enabled features
   * Returns { features: ["flag-a", "flag-b"] }
   */
  router.get('/my-features', requireAuth, async (req, res) => {
    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: 'Database not connected' });

      const col = db.collection(COLLECTIONS.FEATURE_FLAGS);

      const enabledFeatures = await col
        .find({ type: 'feature', enabled: true })
        .project({ name: 1, _id: 0 })
        .toArray();
      const enabledSet = new Set(enabledFeatures.map(f => f.name));

      const assignments = await col
        .find({ type: 'assignment', username: req.user.username })
        .project({ feature: 1, _id: 0 })
        .toArray();

      const features = assignments
        .map(a => a.feature)
        .filter(name => enabledSet.has(name));

      return res.json({ features });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  /**
   * GET /feature-flags/users-list - List all users for admin autocomplete
   */
  router.get('/feature-flags/users-list', async (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }
    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: 'Database not connected' });

      const users = await db.collection(COLLECTIONS.USERS)
        .find({}, { projection: { _id: 0, username: 1, name: 1 } })
        .sort({ name: 1 })
        .toArray();

      return res.json({ users });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /feature-flags - List all defined features with user counts
   */
  router.get('/feature-flags', async (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }
    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: 'Database not connected' });

      const col = db.collection(COLLECTIONS.FEATURE_FLAGS);

      const features = await col
        .find({ type: 'feature' })
        .sort({ createdAt: -1 })
        .toArray();

      // Count assignments per feature
      const assignments = await col
        .find({ type: 'assignment' })
        .project({ feature: 1, _id: 0 })
        .toArray();

      const countMap = {};
      for (const a of assignments) {
        countMap[a.feature] = (countMap[a.feature] || 0) + 1;
      }

      const results = features.map(f => ({
        name: f.name,
        description: f.description || '',
        enabled: f.enabled,
        userCount: countMap[f.name] || 0,
        createdAt: f.createdAt
      }));

      return res.json({ features: results });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /feature-flags - Create a new feature
   * Body: { name: "slug", description: "..." }
   */
  router.post('/feature-flags', async (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }
    const { name, description } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required and must be a string' });
    }
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!slug) {
      return res.status(400).json({ error: 'name must contain valid characters' });
    }
    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: 'Database not connected' });

      const col = db.collection(COLLECTIONS.FEATURE_FLAGS);

      const existing = await col.findOne({ type: 'feature', name: slug });
      if (existing) {
        return res.status(409).json({ error: `Feature "${slug}" already exists` });
      }

      await col.insertOne({
        type: 'feature',
        name: slug,
        description: (description || '').trim(),
        enabled: true,
        createdAt: new Date()
      });

      return res.status(201).json({ msg: 'Feature created', name: slug });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * DELETE /feature-flags/:name - Delete a feature and all its assignments
   */
  router.delete('/feature-flags/:name', async (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }
    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: 'Database not connected' });

      const col = db.collection(COLLECTIONS.FEATURE_FLAGS);
      const featureName = req.params.name;

      const result = await col.deleteOne({ type: 'feature', name: featureName });
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Feature not found' });
      }

      // Remove all assignments for this feature
      await col.deleteMany({ type: 'assignment', feature: featureName });

      return res.json({ msg: 'Feature deleted' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * PATCH /feature-flags/:name - Update a feature (toggle enabled, update description)
   * Body: { enabled: true/false, description: "..." }
   */
  router.patch('/feature-flags/:name', async (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }
    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: 'Database not connected' });

      const col = db.collection(COLLECTIONS.FEATURE_FLAGS);
      const featureName = req.params.name;
      const update = {};

      if (typeof req.body.enabled === 'boolean') {
        update.enabled = req.body.enabled;
      }
      if (typeof req.body.description === 'string') {
        update.description = req.body.description.trim();
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: 'Nothing to update' });
      }

      const result = await col.updateOne(
        { type: 'feature', name: featureName },
        { $set: update }
      );
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Feature not found' });
      }

      return res.json({ msg: 'Feature updated' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /feature-flags/:name/users - List users assigned to a feature
   */
  router.get('/feature-flags/:name/users', async (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }
    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: 'Database not connected' });

      const col = db.collection(COLLECTIONS.FEATURE_FLAGS);
      const featureName = req.params.name;

      const feature = await col.findOne({ type: 'feature', name: featureName });
      if (!feature) {
        return res.status(404).json({ error: 'Feature not found' });
      }

      const assignments = await col
        .find({ type: 'assignment', feature: featureName })
        .project({ username: 1, assignedAt: 1, _id: 0 })
        .sort({ assignedAt: -1 })
        .toArray();

      return res.json({ feature: featureName, users: assignments });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /feature-flags/:name/users - Assign users to a feature
   * Body: { usernames: ["jsmith", "jdoe"] }
   */
  router.post('/feature-flags/:name/users', async (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }
    const { usernames } = req.body;
    if (!Array.isArray(usernames) || usernames.length === 0) {
      return res.status(400).json({ error: 'usernames must be a non-empty array' });
    }
    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: 'Database not connected' });

      const col = db.collection(COLLECTIONS.FEATURE_FLAGS);
      const featureName = req.params.name;

      const feature = await col.findOne({ type: 'feature', name: featureName });
      if (!feature) {
        return res.status(404).json({ error: 'Feature not found' });
      }

      const docs = usernames.map(u => ({
        type: 'assignment',
        feature: featureName,
        username: u.trim().toLowerCase(),
        assignedAt: new Date()
      }));

      // Use ordered: false to skip duplicates
      try {
        await col.insertMany(docs, { ordered: false });
      } catch (bulkErr) {
        // Duplicate key errors (code 11000) are expected for already-assigned users
        if (!bulkErr.code || bulkErr.code !== 11000) {
          if (!bulkErr.writeErrors || !bulkErr.writeErrors.every(e => e.code === 11000)) {
            throw bulkErr;
          }
        }
      }

      return res.json({ msg: 'Users assigned' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * DELETE /feature-flags/:name/users/:username - Remove user from a feature
   */
  router.delete('/feature-flags/:name/users/:username', async (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }
    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: 'Database not connected' });

      const col = db.collection(COLLECTIONS.FEATURE_FLAGS);
      const result = await col.deleteOne({
        type: 'assignment',
        feature: req.params.name,
        username: req.params.username
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Assignment not found' });
      }

      return res.json({ msg: 'User removed from feature' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createFeatureFlagRoutes };
