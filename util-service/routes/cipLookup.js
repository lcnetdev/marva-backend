/**
 * CIP Lookup Routes
 *
 * Proxies lookups to the cip-lookup container, which has no auth of its own
 * and is only reachable inside the docker network.
 *
 * - GET /cip-lookup?barcode=|isbn=[&lccn=][&bibframe=false][&full=true]
 */

const express = require('express');
const { cipLookup } = require('../services/cipLookupService');
const { requireAuth } = require('../middleware/jwtAuth');

/**
 * Create CIP Lookup routes
 * @returns {Router} Express router
 */
function createCipLookupRoutes() {
  const router = express.Router();

  router.get('/cip-lookup', requireAuth, async (req, res) => {
    try {
      const result = await cipLookup(req.query);
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('[CIP Lookup] Error:', err.message);
      res.status(502).json({ status: 'upstream_error', messages: ['cip-lookup service unavailable'] });
    }
  });

  return router;
}

module.exports = { createCipLookupRoutes };
