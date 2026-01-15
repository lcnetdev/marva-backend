/**
 * LDP (Linked Data Platform) Routes
 *
 * Handles RDF/XML record storage for staging and production environments.
 * Replaces the ldpjs service endpoints.
 *
 * Routes:
 * - PUT  /api-staging/ldp/:eid     - Store staging record
 * - GET  /api-staging/ldp/:eid     - Retrieve staging record
 * - PUT  /api-production/ldp/:eid  - Store production record
 * - GET  /api-production/ldp/:eid  - Retrieve production record
 */

const express = require('express');
const router = express.Router();
const ldpService = require('../services/ldpService');

/**
 * Create LDP routes with database and cache injection
 * @param {object} options - Configuration options
 * @param {function} options.getDb - Function to get MongoDB database instance
 * @param {object} options.cacheStaging - Staging cache { byEid, byUser }
 * @param {object} options.cacheProduction - Production cache { byEid, byUser }
 * @returns {Router} Express router
 */
function createLdpRoutes(options) {
  const { getDb, cacheStaging, cacheProduction } = options;

  const ldpRouter = express.Router();

  // Middleware to parse raw RDF/XML body
  ldpRouter.use(express.text({
    type: ['application/rdf+xml', 'application/xml', 'text/xml'],
    limit: '15mb'
  }));

  // ============================================
  // STAGING ENDPOINTS (/api-staging/ldp/:eid)
  // ============================================

  /**
   * PUT /api-staging/ldp/:eid - Store RDF record in staging
   */
  ldpRouter.put('/api-staging/ldp/:eid', async (req, res) => {
    const { eid } = req.params;
    const rdfContent = req.body;

    if (!rdfContent || (typeof rdfContent === 'string' && rdfContent.trim() === '')) {
      return res.status(400).json({ error: 'Empty RDF content' });
    }

    try {
      const result = await ldpService.storeRecord(
        getDb(),
        'staging',
        eid,
        rdfContent,
        cacheStaging
      );
      return res.json(result);
    } catch (err) {
      console.error('Error storing staging record:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api-staging/ldp/:eid - Retrieve RDF record from staging
   */
  ldpRouter.get('/api-staging/ldp/:eid', async (req, res) => {
    const { eid } = req.params;

    try {
      const rdfContent = await ldpService.getRecord(getDb(), 'staging', eid);

      if (!rdfContent) {
        return res.status(404).json({ error: 'Record not found' });
      }

      return res.type('application/rdf+xml').send(rdfContent);
    } catch (err) {
      console.error('Error retrieving staging record:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // PRODUCTION ENDPOINTS (/api-production/ldp/:eid)
  // ============================================

  /**
   * PUT /api-production/ldp/:eid - Store RDF record in production
   */
  ldpRouter.put('/api-production/ldp/:eid', async (req, res) => {
    const { eid } = req.params;
    const rdfContent = req.body;

    if (!rdfContent || (typeof rdfContent === 'string' && rdfContent.trim() === '')) {
      return res.status(400).json({ error: 'Empty RDF content' });
    }

    try {
      const result = await ldpService.storeRecord(
        getDb(),
        'production',
        eid,
        rdfContent,
        cacheProduction
      );
      return res.json(result);
    } catch (err) {
      console.error('Error storing production record:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api-production/ldp/:eid - Retrieve RDF record from production
   */
  ldpRouter.get('/api-production/ldp/:eid', async (req, res) => {
    const { eid } = req.params;

    try {
      const rdfContent = await ldpService.getRecord(getDb(), 'production', eid);

      if (!rdfContent) {
        return res.status(404).json({ error: 'Record not found' });
      }

      return res.type('application/rdf+xml').send(rdfContent);
    } catch (err) {
      console.error('Error retrieving production record:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  return ldpRouter;
}

module.exports = { createLdpRoutes };
