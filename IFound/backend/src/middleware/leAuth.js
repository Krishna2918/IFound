/**
 * Law Enforcement Authentication Middleware
 *
 * Provides authentication and authorization for law enforcement portal.
 */

const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const { LawEnforcementOfficer, LawEnforcementAgency } = require('../models');
const logger = require('../config/logger');

/**
 * Protect law enforcement routes - requires valid LE token
 */
const protectLE = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized - no token',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify this is a law enforcement token
    if (decoded.type !== 'law_enforcement') {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - invalid token type',
      });
    }

    // Fetch officer and verify still active
    const officer = await LawEnforcementOfficer.findByPk(decoded.id, {
      include: [{
        model: LawEnforcementAgency,
        as: 'agency',
      }],
    });

    if (!officer || !officer.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - officer not found or inactive',
      });
    }

    if (officer.verification_status !== 'verified') {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - officer not verified',
      });
    }

    if (!officer.agency.is_active || officer.agency.verification_status !== 'verified') {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - agency not active',
      });
    }

    req.leOfficer = officer;
    req.leAgency = officer.agency;
    next();
  } catch (error) {
    logger.error('LE Auth error:', error);
    return res.status(401).json({
      success: false,
      message: 'Not authorized - token invalid',
    });
  }
});

/**
 * API Key authentication for programmatic access
 */
const apiKeyAuth = asyncHandler(async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: 'API key required',
    });
  }

  const agency = await LawEnforcementAgency.findOne({
    where: {
      api_key: apiKey,
      is_active: true,
      verification_status: 'verified',
    },
  });

  if (!agency) {
    return res.status(401).json({
      success: false,
      message: 'Invalid API key',
    });
  }

  // Check if API key is expired
  if (agency.api_key_expires_at && new Date() > new Date(agency.api_key_expires_at)) {
    return res.status(401).json({
      success: false,
      message: 'API key expired',
    });
  }

  req.leAgency = agency;
  next();
});

/**
 * Check specific permission
 */
const requirePermission = (permission) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.leOfficer) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!req.leOfficer.hasPermission(permission)) {
      logger.warn('Permission denied', {
        officerId: req.leOfficer.id,
        permission,
      });

      return res.status(403).json({
        success: false,
        message: `Permission required: ${permission}`,
      });
    }

    next();
  });
};

/**
 * Require officer role
 */
const requireRole = (...roles) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.leOfficer) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!roles.includes(req.leOfficer.role)) {
      return res.status(403).json({
        success: false,
        message: `Role required: ${roles.join(' or ')}`,
      });
    }

    next();
  });
};

/**
 * Either LE auth or platform admin auth
 */
const protectLEOrAdmin = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized - no token',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type === 'law_enforcement') {
      // Handle as LE officer
      const officer = await LawEnforcementOfficer.findByPk(decoded.id, {
        include: [{ model: LawEnforcementAgency, as: 'agency' }],
      });

      if (officer && officer.is_active && officer.verification_status === 'verified') {
        req.leOfficer = officer;
        req.leAgency = officer.agency;
        return next();
      }
    } else {
      // Handle as regular user (check if admin)
      const { User } = require('../models');
      const user = await User.findByPk(decoded.id);

      if (user && user.role === 'admin') {
        req.user = user;
        return next();
      }
    }

    return res.status(401).json({
      success: false,
      message: 'Not authorized',
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized - token invalid',
    });
  }
});

module.exports = {
  protectLE,
  apiKeyAuth,
  requirePermission,
  requireRole,
  protectLEOrAdmin,
};
