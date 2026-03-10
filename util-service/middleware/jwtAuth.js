/**
 * JWT Authentication Middleware
 *
 * Provides two middleware functions:
 * - requireAuth: Rejects requests without a valid JWT (401)
 * - optionalAuth: Populates req.user from JWT if present, never blocks
 */

const jwt = require('jsonwebtoken');
const { config } = require('../config');

/**
 * Require a valid JWT Bearer token. Returns 401 if missing or invalid.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, config.jwt.secret);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Populate req.user from JWT if present. Never rejects — allows unauthenticated requests through.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(authHeader.split(' ')[1], config.jwt.secret);
    } catch {
      // Invalid or expired token — ignore, req.user stays undefined
    }
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
