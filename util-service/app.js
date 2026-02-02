/**
 * Express Application Configuration
 *
 * Sets up Express app with middleware and routes.
 * This is separated from server.js to enable testing.
 */

const express = require('express');
const cors = require('cors');
const { config } = require('./config');
const {
  createAdminRoutes,
  createRecordsRoutes,
  createTemplatesRoutes,
  createPrefsRoutes,
  createErrorsRoutes,
  createIdsRoutes,
  createPublishingRoutes,
  createProfilesRoutes,
  createExternalRoutes,
  createMarcRoutes,
  createLdpRoutes
} = require('./routes');
const { getStagingCache, getProductionCache } = require('./services/cacheService');

/**
 * Create and configure Express application
 * @param {object} options - Configuration options
 * @param {function} options.getDb - Function to get database instance
 * @param {object} options.mongo - MongoDB module (for ObjectID)
 * @param {function} options.getNacoIdObj - Function to get current NACO ID object
 * @param {function} options.setNacoIdObj - Function to set NACO ID object
 * @param {function} options.getMarva001Obj - Function to get current MARVA001 ID object
 * @param {function} options.setMarva001Obj - Function to set MARVA001 ID object
 * @param {object} options.editorVersion - Production editor version
 * @param {object} options.editorVersionStage - Staging editor version
 * @param {Array} options.postLog - Shared post log array
 * @returns {Express.Application} Configured Express app
 */
function createApp(options) {
  const app = express();

  const {
    getDb,
    mongo,
    getNacoIdObj,
    setNacoIdObj,
    getMarva001Obj,
    setMarva001Obj,
    editorVersion,
    editorVersionStage,
    postLog
  } = options;

  // ============================================
  // MIDDLEWARE
  // ============================================

  app.set('view engine', 'ejs');
  app.use(cors());
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // ============================================
  // MOUNT ROUTES
  // ============================================

  // Admin routes (version, status, cleanup, deploy, logs)
  // Store mutable version state
  let currentEditorVersion = editorVersion;
  let currentEditorVersionStage = editorVersionStage;
  let cleanupStatus = { running: false, lastRun: null, deleted: 0 };

  const adminRouter = createAdminRoutes({
    getEditorVersion: () => currentEditorVersion,
    getEditorVersionStage: () => currentEditorVersionStage,
    setEditorVersion: (ver) => { currentEditorVersion = ver; },
    setEditorVersionStage: (ver) => { currentEditorVersionStage = ver; },
    getPostLog: () => postLog,
    getStatus: () => 'ok',
    getCleanupStatus: () => cleanupStatus,
    startCleanup: () => {
      // TODO: Implement actual cleanup logic from cleanupService
      cleanupStatus = { running: true, lastRun: new Date().toISOString(), deleted: 0 };
    }
  });
  app.use('/', adminRouter);

  // Records routes (myrecords, allrecords, delete)
  const recordsRouter = createRecordsRoutes({
    getDb,
    mongo,
    getStagingCache,
    getProductionCache
  });
  app.use('/', recordsRouter);

  // Templates routes
  const templatesRouter = createTemplatesRoutes({
    getDb,
    mongo
  });
  app.use('/', templatesRouter);

  // User preferences routes
  const prefsRouter = createPrefsRoutes({
    getDb,
    mongo
  });
  app.use('/', prefsRouter);

  // Error reporting routes
  const errorsRouter = createErrorsRoutes({
    getDb,
    mongo
  });
  app.use('/', errorsRouter);

  // ID generation routes
  const idsRouter = createIdsRoutes({
    getDb,
    mongo,
    getNacoIdObj,
    setNacoIdObj,
    getMarva001Obj,
    setMarva001Obj
  });
  app.use('/', idsRouter);

  // Publishing routes (publish, nacostub, validate, copycat)
  const publishingRouter = createPublishingRoutes({
    postLog
  });
  app.use('/', publishingRouter);

  // Profiles routes
  const profilesRouter = createProfilesRoutes({
    getDb,
    mongo
  });
  app.use('/', profilesRouter);

  // External API routes (worldcat, lcap, related, history, status)
  const externalRouter = createExternalRoutes();
  app.use('/', externalRouter);

  // MARC preview routes
  const marcRouter = createMarcRoutes();
  app.use('/', marcRouter);

  // LDP routes (api-staging, api-production)
  // Pass getDb as a function for lazy evaluation
  const ldpRouter = createLdpRoutes({
    getDb,
    cacheStaging: getStagingCache(),
    cacheProduction: getProductionCache()
  });
  app.use('/', ldpRouter);

  return app;
}

module.exports = { createApp };
