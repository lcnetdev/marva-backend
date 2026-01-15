/**
 * Records Routes
 *
 * Handles record management endpoints:
 * - /myrecords/* - User's records
 * - /allrecords/* - All records
 * - /delete/* - Record deletion
 */

const express = require('express');
const { COLLECTIONS } = require('../db/collections');

/**
 * Create records routes
 * @param {object} options - Configuration options
 * @param {function} options.getDb - Function to get database instance
 * @param {function} options.getStagingCache - Function to get staging cache { byEid, byUser }
 * @param {function} options.getProductionCache - Function to get production cache { byEid, byUser }
 * @returns {Router} Express router
 */
function createRecordsRoutes(options) {
  const router = express.Router();

  const { getDb, getStagingCache, getProductionCache } = options;

  // ============================================
  // MY RECORDS ENDPOINTS
  // ============================================

  /**
   * GET /myrecords/production/:user - Get user's production records
   */
  router.get('/myrecords/production/:user', (req, res) => {
    const user = req.params.user;
    const cache = getProductionCache();
    if (user && cache.byUser[user]) {
      res.json(cache.byUser[user]);
    } else {
      res.json({});
    }
  });

  /**
   * GET /myrecords/staging/:user - Get user's staging records
   */
  router.get('/myrecords/staging/:user', (req, res) => {
    const user = req.params.user;
    const cache = getStagingCache();
    if (user && cache.byUser[user]) {
      res.json(cache.byUser[user]);
    } else {
      res.json({});
    }
  });

  // ============================================
  // ALL RECORDS ENDPOINTS
  // ============================================

  /**
   * GET /allrecords/production - Get all production records
   */
  router.get('/allrecords/production', (req, res) => {
    res.json(getProductionCache().byEid);
  });

  /**
   * GET /allrecords/staging - Get all staging records
   */
  router.get('/allrecords/staging', (req, res) => {
    res.json(getStagingCache().byEid);
  });

  /**
   * GET /allrecords/production/stats - Get production record statistics
   */
  router.get('/allrecords/production/stats', async (req, res) => {
    try {
      const db = getDb();
      if (!db) {
        return res.status(500).json({ error: 'Database not connected' });
      }

      const results = await db.collection(COLLECTIONS.RESOURCES_PRODUCTION).aggregate([
        {
          $facet: {
            totalCount: [{ $count: 'count' }],
            withIndex: [
              { $match: { index: { $exists: true } } },
              { $count: 'count' }
            ],
            byUser: [
              { $match: { 'index.user': { $exists: true } } },
              { $group: { _id: '$index.user', count: { $sum: 1 } } },
              { $sort: { count: -1 } }
            ],
            byStatus: [
              { $match: { 'index.status': { $exists: true } } },
              { $group: { _id: '$index.status', count: { $sum: 1 } } }
            ]
          }
        }
      ]).toArray();

      const data = results[0] || {};
      const stats = {
        totalRecords: data.totalCount?.[0]?.count || 0,
        recordsWithIndex: data.withIndex?.[0]?.count || 0,
        users: {},
        statuses: {}
      };

      (data.byUser || []).forEach(u => {
        stats.users[u._id] = u.count;
      });

      (data.byStatus || []).forEach(s => {
        stats.statuses[s._id] = s.count;
      });

      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // DELETE ENDPOINTS
  // ============================================

  /**
   * POST /delete/:stage/:user/:eid - Soft delete a record
   */
  router.post('/delete/:stage/:user/:eid', (req, res) => {
    const { stage, user, eid } = req.params;
    let result = false;

    const cache = stage === 'staging' ? getStagingCache() : getProductionCache();

    if (cache.byUser[user]?.[eid]) {
      cache.byUser[user][eid].status = 'deleted';
      result = true;
    }

    if (cache.byEid[eid]) {
      cache.byEid[eid].status = 'deleted';
      result = true;
    }

    res.json({ result });
  });

  return router;
}

module.exports = { createRecordsRoutes };
