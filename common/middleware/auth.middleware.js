const jwt = require('jsonwebtoken');
const config = require('../config');
const { getDoc } = require('../utils');

/**
 * Extracts and verifies bearer token, populating req.user if valid
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload?.userId) {
      req.user = await getDoc('users', payload.userId);
    }
  } catch (err) {
    req.user = null;
  }

  next();
}

/**
 * Enforces authenticated user
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Please log in to continue' });
  }
  next();
}

module.exports = {
  authenticate,
  requireAuth
};
