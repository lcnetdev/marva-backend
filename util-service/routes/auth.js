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
 *
 * Multi-domain: resolves the correct SAML config per request based on
 * the Host header (see config/domains.js).
 */

const express = require('express');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { config, domainConfigs } = require('../config');
const { requireAuth } = require('../middleware/jwtAuth');

const debug = (...args) => {
  if (config.features.samlDebug) console.log('[SAML DEBUG]', ...args);
};

// In-memory store for pending SAML request IDs (InResponseTo validation).
// Entries auto-expire after 5 minutes via periodic cleanup.
// Shared across all domains — request IDs are globally unique.
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
 * @param {string} [certPath] - Path to the cert file. Falls back to config.saml.idpCertPath.
 */
function readIdpCert(certPath) {
  if (!certPath) certPath = config.saml.idpCertPath;
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
 * Resolve which domain's SAML config to use based on the request's Host header.
 *
 * Matching order:
 *   1. Exact hostname match in domainConfigs
 *   2. Prefix match (e.g., "localhost" matches "localhost:9401")
 *   3. config.saml (the original single-domain config from env vars)
 *
 * @param {object} req - Express request
 * @returns {object} Domain-specific SAML config
 */
function resolveDomainConfig(req) {
  const rawHost = req.headers['x-forwarded-host'] || req.headers.host || '';
  const hostname = rawHost.split(':')[0].toLowerCase();

  debug('Resolving domain config for hostname:', hostname, '(raw Host:', rawHost, ')');

  // Exact match
  if (domainConfigs.has(hostname)) {
    debug('Matched domain config:', hostname);
    return domainConfigs.get(hostname);
  }

  // Prefix match (e.g., "localhost" for "localhost:9401")
  for (const [key, domainCfg] of domainConfigs) {
    if (hostname.startsWith(key)) {
      debug('Prefix-matched domain config:', key);
      return domainCfg;
    }
  }

  // Fallback to the original single-domain config
  debug('No domain match, falling back to config.saml');
  return config.saml;
}

// Per-domain SAML instance cache (keyed by callbackUrl)
const samlInstances = new Map();

/**
 * Get or create a SAML instance for the domain identified by the request.
 * Instances are lazily created and cached.
 *
 * @param {object} req - Express request
 * @returns {{ saml: SAML, domainCfg: object }}
 */
function getSamlForDomain(req) {
  const domainCfg = resolveDomainConfig(req);
  const cacheKey = domainCfg.callbackUrl;

  if (samlInstances.has(cacheKey)) {
    return { saml: samlInstances.get(cacheKey), domainCfg };
  }

  const { SAML } = require('@node-saml/node-saml');
  const idpCert = readIdpCert(domainCfg.idpCertPath);

  const samlOpts = {
    callbackUrl:   domainCfg.callbackUrl,
    entryPoint:    domainCfg.entryPoint,
    issuer:        domainCfg.issuer,
    idpCert:       idpCert,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
    disableRequestedAuthnContext: true,
    audience:      domainCfg.issuer,
  };

  debug('Initializing SAML for domain:', cacheKey, 'with options:', {
    ...samlOpts,
    idpCert: idpCert ? `${idpCert.substring(0, 40)}... (${idpCert.length} chars)` : '(empty)',
  });

  const instance = new SAML(samlOpts);
  samlInstances.set(cacheKey, instance);
  return { saml: instance, domainCfg };
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
    objectidentifier: profile['http://schemas.microsoft.com/identity/claims/objectidentifier'] || '',
    tenantid: profile['http://schemas.microsoft.com/identity/claims/tenantid'] || '',
    upn: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] || profile.nameID || '',
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
    sub: 'jdoe@lib.loc.gov',
    email: 'jdoe@loc.gov',
    name: 'Doe, Jane A',
    given_name: 'Jane',
    family_name: 'Doe',
    objectidentifier: 'a1b2c3d4-5678-9012-abcd-ef3456789012',
    tenantid: 'f0e1d2c3-b4a5-6789-0123-456789abcdef',
    upn: 'jdoe@lib.loc.gov',
  };
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiry });
}

/**
 * Create auth routes
 * @returns {Router} Express router
 */
function createAuthRoutes() {
  const router = express.Router();

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

    // Resolve domain config early — needed for dev bypass redirect too
    const domainCfg = resolveDomainConfig(req);

    // Dev auth bypass — skip SAML, issue test JWT immediately
    if (config.features.devAuthBypass) {
      const token = buildDevJwt();
      debug('Dev bypass — redirecting to:', domainCfg.postLoginRedirect);
      return res.redirect(`${domainCfg.postLoginRedirect}?token=${encodeURIComponent(token)}`);
    }

    try {
      const { saml } = getSamlForDomain(req);
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
        debug('SAMLResponse (first 1500 chars):', decoded.substring(0, 1500));
      } catch { debug('Could not decode SAMLResponse'); }
    }

    if (!config.features.samlEnabled) {
      return res.status(503).json({ error: 'SSO is not configured' });
    }

    try {
      const { saml, domainCfg } = getSamlForDomain(req);

      // Diagnostic: inspect SAML instance cert and response
      if (req.body?.SAMLResponse) {
        try {
          const xml = Buffer.from(req.body.SAMLResponse, 'base64').toString('utf8');
          // Try broad pattern for X509Certificate (any namespace prefix)
          const certMatch = xml.match(/<[^>]*X509Certificate[^>]*>([^<]+)<\/[^>]*X509Certificate>/);
          const loadedCert = readIdpCert(domainCfg.idpCertPath);
          if (certMatch) {
            const responseCert = certMatch[1].replace(/\s/g, '');
            debug('Cert in SAML response (first 60):', responseCert.substring(0, 60));
            debug('Cert we loaded (first 60):', loadedCert.substring(0, 60));
            debug('Certs match:', responseCert === loadedCert);
            debug('Response cert length:', responseCert.length, '| Loaded cert length:', loadedCert.length);
          } else {
            debug('No X509Certificate found in SAML response');
            debug('X509 search in full XML:', xml.includes('X509') ? 'X509 IS in the XML' : 'X509 NOT in the XML');
          }
          debug('Loaded cert empty?', !loadedCert || loadedCert.length === 0);
          // Log the Signature section of the response
          const sigMatch = xml.match(/<[^>]*Signature[^/][^>]*>[\s\S]{0,2000}/);
          debug('Signature section (first 2000 chars):', sigMatch ? sigMatch[0] : '(no Signature element found)');
        } catch (e) { debug('Cert comparison failed:', e.message); }
        // Log the cert that the SAML instance is actually using
        debug('SAML instance idpCert (first 60):', saml.options?.idpCert
          ? (typeof saml.options.idpCert === 'string'
            ? saml.options.idpCert.substring(0, 60) + '...'
            : `[array of ${saml.options.idpCert.length}]`)
          : '(not set)');
        debug('SAML instance idpCert length:', typeof saml.options?.idpCert === 'string'
          ? saml.options.idpCert.length : 'N/A');
      }

      const { profile } = await saml.validatePostResponseAsync(req.body);

      if (!profile) {
        debug('Validation returned no profile');
        return res.status(401).json({ error: 'SAML validation failed — no profile returned' });
      }

      debug('SAML profile received:', JSON.stringify(profile, null, 2));
      const token = buildJwt(profile);
      debug('JWT issued, redirecting to:', domainCfg.postLoginRedirect);
      return res.redirect(`${domainCfg.postLoginRedirect}?token=${encodeURIComponent(token)}`);
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
    const domainCfg = resolveDomainConfig(req);
    const fallbackRedirect = domainCfg.postLoginRedirect || '/marva/';

    if (!config.features.samlEnabled || config.features.devAuthBypass) {
      debug('SAML disabled or dev bypass — redirecting to:', fallbackRedirect);
      return res.redirect(fallbackRedirect);
    }

    try {
      const { saml } = getSamlForDomain(req);
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
      return res.redirect(fallbackRedirect);
    }
  });

  // ============================================
  // GET /auth/logout/callback
  // ============================================
  router.get('/auth/logout/callback', (req, res) => {
    const domainCfg = resolveDomainConfig(req);
    return res.redirect(domainCfg.postLoginRedirect || '/marva/');
  });

  return router;
}

module.exports = { createAuthRoutes };
