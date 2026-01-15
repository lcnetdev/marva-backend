/**
 * Route Aggregator
 *
 * Imports and configures all route modules.
 */

const { createAdminRoutes } = require('./admin');
const { createRecordsRoutes } = require('./records');
const { createTemplatesRoutes } = require('./templates');
const { createPrefsRoutes } = require('./prefs');
const { createErrorsRoutes } = require('./errors');
const { createIdsRoutes } = require('./ids');
const { createPublishingRoutes } = require('./publishing');
const { createProfilesRoutes } = require('./profiles');
const { createExternalRoutes } = require('./external');
const { createMarcRoutes } = require('./marc');
const { createLdpRoutes } = require('./ldp');

module.exports = {
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
};
