/**
 * Centralized Configuration
 *
 * All environment variables and configuration settings in one place
 */

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 5200,

  // MongoDB
  mongodb: {
    uri: process.env.MONGO_URI || 'mongodb://mongo:27017/',
    db: process.env.MONGO_DB || 'bfe2'
  },

  // MarkLogic - Production
  marklogic: {
    production: {
      user: process.env.MLUSER,
      pass: process.env.MLPASS,
      postUrl: process.env.PRODUCTIONPOSTURL,
      ccUrl: process.env.PRODUCTIONccURL,
      nacoStub: process.env.PRODUCTIONNACOSTUB
    },
    staging: {
      user: process.env.MLUSERSTAGE,
      pass: process.env.MLPASSSTAGE,
      postUrl: process.env.STAGINGPOSTURL,
      ccUrl: process.env.STAGGINGccURL,
      nacoStub: process.env.STAGINGNACOSTUB
    },
    validationUrl: process.env.VALIDATIONURL
  },

  // WorldCat
  worldcat: {
    clientId: process.env.WC_CLIENTID,
    secret: process.env.WC_SECRET,
    // Runtime token storage
    token: null,
    expires: null
  },

  // External services
  external: {
    lcapSync: process.env.LCAP_SYNC,
    recordHistory: process.env.RECORD_HISTORY
  },

  // Authentication passwords
  auth: {
    deployPw: process.env.DEPLOYPW?.replace(/"/g, ''),
    statsPw: process.env.STATSPW?.replace(/"/g, '')
  },

  // Feature flags
  features: {
    bfOrgMode: process.env.BFORGMODE === 'true' || process.env.BFORGMODE === '1'
  },

  // ID generation defaults
  ids: {
    nacoStart: 2025700001,
    marva001Start: 1260000000
  },

  // Cache settings
  cache: {
    worldcatTtl: 43200, // 12 hours in seconds
    ageLimitForAllRecords: 15 // days
  }
};

/**
 * Get MarkLogic config for environment
 * @param {string} env - 'production' or 'staging'
 * @returns {object} MarkLogic configuration
 */
function getMarkLogicConfig(env) {
  return env === 'production'
    ? config.marklogic.production
    : config.marklogic.staging;
}

/**
 * Create basic auth header value
 * @param {string} password - The password (used as both user and pass)
 * @returns {string} Base64 encoded auth string
 */
function createBasicAuthValue(password) {
  return Buffer.from(`${password}:${password}`).toString('base64');
}

/**
 * Check if request has valid deploy auth
 * @param {object} req - Express request
 * @returns {boolean} True if authorized
 */
function hasDeployAuth(req) {
  if (!req.headers.authorization || !config.auth.deployPw) {
    return false;
  }
  const correctLogin = createBasicAuthValue(config.auth.deployPw);
  return req.headers.authorization === `Basic ${correctLogin}`;
}

/**
 * Check if request has valid stats auth
 * @param {object} req - Express request
 * @returns {boolean} True if authorized
 */
function hasStatsAuth(req) {
  if (!req.headers.authorization || !config.auth.statsPw) {
    return false;
  }
  const correctLogin = createBasicAuthValue(config.auth.statsPw);
  return req.headers.authorization === `Basic ${correctLogin}`;
}

module.exports = {
  config,
  getMarkLogicConfig,
  createBasicAuthValue,
  hasDeployAuth,
  hasStatsAuth
};
