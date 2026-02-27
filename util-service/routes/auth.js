/**
 * Auth Routes
 *
 * Handles SAML SSO authentication via Microsoft Entra:
 * - /auth/login - Initiate SAML login (redirect to IdP)
 * - /auth/callback - SAML assertion consumer service (ACS)
 * - /auth/refresh - Refresh a near-expiry JWT
 * - /auth/logout - Initiate SAML logout
 * - /auth/logout/callback - SLO callback from IdP
 * - /auth/me - Return current user info from JWT
 */

const express = require('express');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { config } = require('../config');
const { requireAuth } = require('../middleware/jwtAuth');

const debug = (...args) => {
  if (config.features.samlDebug) console.log('[SAML DEBUG]', ...args);
};

// In-memory store for pending SAML request IDs (InResponseTo validation).
// Entries auto-expire after 5 minutes via periodic cleanup.
const pendingRequests = new Map();
const PENDING_TTL_MS = 5 * 60 * 1000;

// Cleanup expired pending requests every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [id, timestamp] of pendingRequests) {
    if (now - timestamp > PENDING_TTL_MS) {
      pendingRequests.delete(id);
    }
  }
}, 60_000);

/**
 * Read the IdP certificate from disk. Returns empty string if not configured.
 */
function readIdpCert() {
  const certPath = config.saml.idpCertPath;
  debug('Reading IdP cert from:', certPath || '(not configured)');
  if (!certPath) return '';
  try {
    const raw = fs.readFileSync(certPath, 'utf8');
    const cert = raw
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\r?\n/g, '');
    debug('IdP cert loaded, length:', cert.length, 'chars');
    return cert;
  } catch (err) {
    console.error('Failed to read IdP certificate:', err.message);
    return '';
  }
}

/**
 * Build a JWT from SAML assertion claims
 */
function buildJwt(profile) {
  debug('--- Raw SAML profile (all keys) ---');
  for (const [key, value] of Object.entries(profile)) {
    debug(`  ${key}:`, value);
  }

  const payload = {
    sub: profile.nameID || profile['http://schemas.microsoft.com/identity/claims/objectidentifier'] || '',
    email: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] || profile.nameID || '',
    name: profile['http://schemas.microsoft.com/identity/claims/displayname']
      || profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] || '',
    given_name: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'] || '',
    family_name: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'] || '',
  };

  debug('--- JWT payload (what we extracted) ---');
  for (const [key, value] of Object.entries(payload)) {
    debug(`  ${key}:`, value);
  }

  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiry });
}

/**
 * Build a dev bypass JWT with test user claims
 */
function buildDevJwt() {
  const payload = {
    sub: 'dev-user-001',
    email: 'dev@localhost',
    name: 'Dev User',
    given_name: 'Dev',
    family_name: 'User',
  };
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiry });
}

/**
 * Create auth routes
 * @returns {Router} Express router
 */
function createAuthRoutes() {
  const router = express.Router();

  // Lazily initialize SAML instance (only when first needed)
  let samlInstance = null;

  function getSaml() {
    if (samlInstance) return samlInstance;
    // Dynamic import to avoid loading @node-saml/node-saml when SAML is disabled
    const { SAML } = require('@node-saml/node-saml');
    const idpCert = readIdpCert();

    const samlOpts = {
      callbackUrl: config.saml.callbackUrl,
      entryPoint: config.saml.entryPoint,
      issuer: config.saml.issuer,
      idpCert: idpCert,
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: false,
      audience: config.saml.issuer,
    };
    debug('Initializing SAML with options:', {
      ...samlOpts,
      idpCert: idpCert ? `${idpCert.substring(0, 40)}... (${idpCert.length} chars)` : '(empty)',
    });

    samlInstance = new SAML(samlOpts);
    return samlInstance;
  }

  // ============================================
  // GET /auth/login
  // ============================================
  router.get('/auth/login', async (req, res) => {
    debug('--- /auth/login ---');
    debug('Host header:', req.headers.host);
    debug('X-Forwarded-Proto:', req.headers['x-forwarded-proto']);
    debug('X-Forwarded-Host:', req.headers['x-forwarded-host']);
    debug('SAML enabled:', config.features.samlEnabled, '| Dev bypass:', config.features.devAuthBypass);

    if (!config.features.samlEnabled) {
      return res.status(503).json({ error: 'SSO is not configured' });
    }

    // Dev auth bypass — skip SAML, issue test JWT immediately
    if (config.features.devAuthBypass) {
      const token = buildDevJwt();
      debug('Dev bypass — redirecting to:', config.saml.postLoginRedirect);
      return res.redirect(`${config.saml.postLoginRedirect}?token=${encodeURIComponent(token)}`);
    }

    try {
      const saml = getSaml();
      const url = await saml.getAuthorizeUrlAsync('', req.headers.host, {});
      debug('SAML redirect URL:', url);
      // Extract the request ID from the generated URL for InResponseTo validation
      const idMatch = url.match(/ID=([^&]+)/i) || url.match(/InResponseTo=([^&]+)/i);
      if (idMatch) {
        pendingRequests.set(decodeURIComponent(idMatch[1]), Date.now());
        debug('Stored pending request ID:', decodeURIComponent(idMatch[1]));
      }
      return res.redirect(url);
    } catch (err) {
      console.error('SAML login error:', err);
      return res.status(500).json({ error: 'Failed to initiate SSO login' });
    }
  });

  // ============================================
  // POST /auth/callback
  // ============================================
  router.post('/auth/callback', async (req, res) => {
    debug('--- /auth/callback ---');
    debug('Content-Type:', req.headers['content-type']);
    debug('SAMLResponse present:', !!req.body?.SAMLResponse);
    debug('RelayState:', req.body?.RelayState || '(none)');
    if (req.body?.SAMLResponse) {
      try {
        const decoded = Buffer.from(req.body.SAMLResponse, 'base64').toString('utf8');
        debug('SAMLResponse (first 500 chars):', decoded.substring(0, 500));
      } catch { debug('Could not decode SAMLResponse'); }
    }

    if (!config.features.samlEnabled) {
      return res.status(503).json({ error: 'SSO is not configured' });
    }

    try {
      const saml = getSaml();
      const { profile } = await saml.validatePostResponseAsync(req.body);

      if (!profile) {
        debug('Validation returned no profile');
        return res.status(401).json({ error: 'SAML validation failed — no profile returned' });
      }

      debug('SAML profile received:', JSON.stringify(profile, null, 2));
      const token = buildJwt(profile);
      debug('JWT issued, redirecting to:', config.saml.postLoginRedirect);
      return res.redirect(`${config.saml.postLoginRedirect}?token=${encodeURIComponent(token)}`);
    } catch (err) {
      console.error('SAML callback error:', err);
      debug('SAML validation error details:', err.message);
      if (err.stack) debug('Stack:', err.stack);
      return res.status(401).json({ error: 'SAML validation failed', details: err.message });
    }
  });

  // ============================================
  // GET /auth/refresh
  // ============================================
  router.get('/auth/refresh', requireAuth, (req, res) => {
    // req.user is set by requireAuth middleware
    const { iat, exp, ...claims } = req.user;
    const token = jwt.sign(claims, config.jwt.secret, { expiresIn: config.jwt.expiry });
    return res.json({ token });
  });

  // ============================================
  // GET /auth/me
  // ============================================
  router.get('/auth/me', requireAuth, (req, res) => {
    const { iat, exp, ...userInfo } = req.user;
    return res.json(userInfo);
  });

  // ============================================
  // GET /auth/logout
  // ============================================
  router.get('/auth/logout', async (req, res) => {
    debug('--- /auth/logout ---');
    if (!config.features.samlEnabled || config.features.devAuthBypass) {
      debug('SAML disabled or dev bypass — redirecting to /marva/');
      return res.redirect('/marva/');
    }

    try {
      const saml = getSaml();
      // Try to get user info from JWT for the logout request
      let nameID = '';
      let sessionIndex = '';
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const decoded = jwt.verify(authHeader.split(' ')[1], config.jwt.secret);
          nameID = decoded.sub || '';
        } catch {
          // Token might be expired — that's fine for logout
        }
      }

      const logoutUrl = await saml.getLogoutUrlAsync(
        { nameID, sessionIndex, nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified' },
        '',
        {}
      );
      return res.redirect(logoutUrl);
    } catch (err) {
      console.error('SAML logout error:', err);
      // Even if SLO fails, redirect to the app (user is effectively logged out client-side)
      return res.redirect('/marva/');
    }
  });

  // ============================================
  // GET /auth/logout/callback
  // ============================================
  router.get('/auth/logout/callback', (req, res) => {
    return res.redirect('/marva/');
  });

  return router;
}

module.exports = { createAuthRoutes };
