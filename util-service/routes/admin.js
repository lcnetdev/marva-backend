/**
 * Admin Routes
 *
 * Handles administrative endpoints:
 * - /version/* - Editor version management
 * - /status - System status
 * - /cleanup/* - Database cleanup jobs
 * - /logs/posts - Publishing logs
 * - /deploy-* - Deployment endpoints
 */

const express = require('express');
const fs = require('fs');
const shell = require('shelljs');
const { hasDeployAuth, hasStatsAuth } = require('../config');

/**
 * Create admin routes
 * @param {object} options - Configuration options
 * @param {object} options.getEditorVersion - Function to get production version
 * @param {object} options.getEditorVersionStage - Function to get staging version
 * @param {function} options.setEditorVersion - Function to set production version
 * @param {function} options.setEditorVersionStage - Function to set staging version
 * @param {function} options.getPostLog - Function to get post log
 * @param {function} options.getStatus - Function to get system status
 * @returns {Router} Express router
 */
function createAdminRoutes(options) {
  const router = express.Router();

  const {
    getEditorVersion,
    getEditorVersionStage,
    setEditorVersion,
    setEditorVersionStage,
    getPostLog,
    getStatus,
    getCleanupStatus,
    startCleanup
  } = options;

  // ============================================
  // ROOT / DEPLOY DASHBOARD
  // ============================================

  /**
   * GET / - Deploy dashboard (index.ejs)
   * Requires deploy authentication
   */
  router.get('/', (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }

    const config = JSON.parse(fs.readFileSync('util_config.json', 'utf8'));
    res.render('index', {
      editorVersionStage: getEditorVersionStage(),
      editorVersion: getEditorVersion(),
      config: config
    });
  });

  // ============================================
  // VERSION ENDPOINTS
  // ============================================

  /**
   * GET /version/editor - Get production editor version
   */
  router.get('/version/editor', (req, res) => {
    res.json(getEditorVersion());
  });

  /**
   * GET /version/editor/stage - Get staging editor version
   */
  router.get('/version/editor/stage', (req, res) => {
    res.json(getEditorVersionStage());
  });

  /**
   * GET /version/set/:env/:major/:minor/:patch - Set editor version
   * Requires deploy authentication
   */
  router.get('/version/set/:env/:major/:minor/:patch', (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }

    const ver = {
      major: parseInt(req.params.major, 10),
      minor: parseInt(req.params.minor, 10),
      patch: parseInt(req.params.patch, 10)
    };

    if (req.params.env === 'staging') {
      fs.writeFileSync('ver_stage.json', JSON.stringify(ver));
      setEditorVersionStage(ver);
    } else {
      fs.writeFileSync('ver_prod.json', JSON.stringify(ver));
      setEditorVersion(ver);
    }

    res.json({});
  });

  // ============================================
  // STATUS ENDPOINTS
  // ============================================

  /**
   * GET /status - Get system status
   */
  router.get('/status', (req, res) => {
    res.json({ status: getStatus() });
  });

  // ============================================
  // LOGS ENDPOINTS
  // ============================================

  /**
   * GET /logs/posts - Get publishing logs
   */
  router.get('/logs/posts', (req, res) => {
    res.json(getPostLog());
  });

  // ============================================
  // CLEANUP ENDPOINTS
  // ============================================

  /**
   * GET /cleanup/old-records - Start cleanup job
   * Requires confirmation parameter
   */
  router.get('/cleanup/old-records', (req, res) => {
    if (req.query.confirm !== 'yes-delete-old-records') {
      return res.status(400).json({
        error: req.query.confirm
          ? 'invalid confirmation value'
          : 'Missing confirmation parameter',
        usage: 'GET /cleanup/old-records?confirm=yes-delete-old-records'
      });
    }

    startCleanup();
    res.json({ status: 'started', message: 'Cleanup job started' });
  });

  /**
   * GET /cleanup/old-records/status - Get cleanup job status
   */
  router.get('/cleanup/old-records/status', (req, res) => {
    res.json(getCleanupStatus());
  });

  // ============================================
  // DEPLOY ENDPOINTS
  // ============================================

  /**
   * Execute deploy script and return HTML result
   * @param {string} scriptPath - Path to the script
   * @returns {string} HTML formatted output
   */
  function executeDeployScript(scriptPath) {
    const r = shell.exec(scriptPath);
    return `<h1>stdout</h1><pre><code>${r.stdout.toString()}</pre></code><hr><h1>stderr</h1><pre><code>${r.stderr.toString()}</pre></code>`;
  }

  /**
   * GET /deploy-production - Deploy production MARVA
   * Requires deploy authentication
   */
  router.get('/deploy-production', (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }
    const result = executeDeployScript('./scripts/deploy-production.sh');
    res.status(200).send(result);
  });

  /**
   * GET /deploy-production-quartz - Deploy production Quartz
   * Requires deploy authentication
   */
  router.get('/deploy-production-quartz', (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }
    const result = executeDeployScript('./scripts/deploy-production-quartz.sh');
    res.status(200).send(result);
  });

  /**
   * GET /deploy-staging - Deploy staging MARVA
   * Requires deploy authentication
   */
  router.get('/deploy-staging', (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }
    const result = executeDeployScript('./scripts/deploy-staging.sh');
    res.status(200).send(result);
  });

  /**
   * GET /deploy-staging-quartz - Deploy staging Quartz
   * Requires deploy authentication
   */
  router.get('/deploy-staging-quartz', (req, res) => {
    if (!hasDeployAuth(req)) {
      return res.set('WWW-Authenticate', 'Basic').status(401).send('Authentication required.');
    }
    const result = executeDeployScript('./scripts/deploy-staging-quartz.sh');
    res.status(200).send(result);
  });

  /**
   * GET /deploy-profile-editor - Deploy profile editor
   * No authentication required (matches original behavior)
   */
  router.get('/deploy-profile-editor', (req, res) => {
    const result = executeDeployScript('./scripts/deploy-profile-editor.sh');
    res.status(200).send(result);
  });

  return router;
}

module.exports = { createAdminRoutes };
