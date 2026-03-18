/**
 * FOLIO Test Routes
 *
 * Quick smoke-test endpoints to verify FOLIO connectivity.
 *   GET /folio/test/staging    - test staging connection
 *   GET /folio/test/production - test production connection
 */

const express = require('express');
const { requireAuth } = require('../middleware/jwtAuth');
const { getFolioClient, MLC_NUMBER_GENERATOR } = require('../services/folioService');

function createFolioRoutes() {
  const router = express.Router();

  router.get('/folio/test/:env', async (req, res) => {
    const env = req.params.env;
    if (env !== 'staging' && env !== 'production') {
      return res.status(400).json({ error: 'env must be "staging" or "production"' });
    }

    try {
      const folio = getFolioClient(env);
      const result = await folio.get('instance-storage/instances', 'instances', { limit: 1 });
      res.json({
        status: 'ok',
        env,
        tenant: folio.tenant,
        url: folio.url,
        recordCount: result.length,
        sample: result[0] ? { id: result[0].id, title: result[0].title } : null,
      });
    } catch (err) {
      console.error(`[FOLIO test] ${env} error:`, err.message);
      res.status(500).json({
        status: 'error',
        env,
        error: err.message,
      });
    }
  });

  router.get('/folio/number-generators/:env', requireAuth, async (req, res) => {
    const env = req.params.env;
    if (env !== 'staging' && env !== 'production') {
      return res.status(400).json({ error: 'env must be "staging" or "production"' });
    }

    try {
      const folio = getFolioClient(env);
      const params = new URLSearchParams();
      params.append('sort', 'enabled;asc');
      params.append('sort', 'name;asc');
      params.append('stats', 'true');
      params.append('perPage', '100');
      const result = await folio.get('servint/numberGenerators', null, params);
      res.json(result);
    } catch (err) {
      console.error(`[FOLIO number-generators] ${env} error:`, err.message);
      res.status(500).json({ status: 'error', env, error: err.message });
    }
  });

  router.get('/folio/next-mlc/:env', requireAuth, async (req, res) => {
    const env = req.params.env;
    if (env !== 'staging' && env !== 'production') {
      return res.status(400).json({ error: 'env must be "staging" or "production"' });
    }

    try {
      const folio = getFolioClient(env);
      const { sequence } = req.query;
      if (!sequence) {
        return res.status(400).json({ error: 'sequence query parameter is required' });
      }
      const result = await folio.get('servint/numberGenerators/getNextNumber', null, {
        sequence,
        generator: MLC_NUMBER_GENERATOR,
      });
      res.json(result);
    } catch (err) {
      console.error(`[FOLIO next-mlc] ${env} error:`, err.message);
      res.status(500).json({ status: 'error', env, error: err.message });
    }
  });

  return router;
}

module.exports = { createFolioRoutes };
