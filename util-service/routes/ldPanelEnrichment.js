/**
 * LD Panel Enrichment Routes
 *
 * Proxies POST requests to the Tsundoku enrichment API,
 * injecting the server-side API key into the request body.
 *
 * - POST /ld-panel-enrichment/*path - Proxy to enrichment API
 */

const express = require('express');
const { postEnrichment } = require('../services/ldPanelEnrichmentService');

/**
 * Create LD Panel Enrichment routes
 * @returns {Router} Express router
 */
function createLdPanelEnrichmentRoutes() {
  const router = express.Router();

  router.post('/ld-panel-enrichment/*path', async (req, res) => {
    try {
      const path = '/' + (req.params.path || '');
      const result = await postEnrichment(path, req.body);
      res.json(result);
    } catch (err) {
      const status = err.response?.statusCode || 500;
      const message = err.response?.body || err.message;
      console.error('[LD Panel Enrichment] Error:', message);
      res.status(status).json({ error: message });
    }
  });

  return router;
}

module.exports = { createLdPanelEnrichmentRoutes };
