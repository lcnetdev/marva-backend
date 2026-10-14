/**
 * CIP Lookup Routes
 *
 * Proxies to the cip-lookup container, which has no auth of its own
 * and is only reachable inside the docker network.
 *
 * - GET  /cip-lookup?barcode=|isbn=|lccn=|oclcNumber=[&bibframe=false][&full=true]
 * - POST /cip-lookup/enrich  { rdfxml, isbn?, lccn?, oclcNumber?, printOnly?, bibframe?, full? }
 */

const express = require('express');
const { cipLookup, cipEnrich } = require('../services/cipLookupService');
const { requireAuth } = require('../middleware/jwtAuth');

/**
 * Create CIP Lookup routes
 * @returns {Router} Express router
 */
function createCipLookupRoutes() {
  const router = express.Router();

  const unavailable = (res, err) => {
    console.error('[CIP Lookup] Error:', err.message);
    res.status(502).json({ status: 'upstream_error', messages: ['cip-lookup service unavailable'] });
  };

  router.get('/cip-lookup', requireAuth, async (req, res) => {
    try {
      const result = await cipLookup(req.query);
      res.status(result.status).json(result.body);
    } catch (err) {
      unavailable(res, err);
    }
  });

  router.post('/cip-lookup/enrich', requireAuth, async (req, res) => {
    if (!req.body || typeof req.body.rdfxml !== 'string' || req.body.rdfxml === '') {
      return res.status(400).json({ status: 'bad_request', messages: ['give the record as JSON "rdfxml"'] });
    }
    try {
      const result = await cipEnrich(req.body);
      res.status(result.status).json(result.body);
    } catch (err) {
      unavailable(res, err);
    }
  });

  return router;
}

module.exports = { createCipLookupRoutes };
