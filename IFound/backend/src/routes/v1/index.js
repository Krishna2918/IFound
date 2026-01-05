/**
 * API Version 1 Routes
 *
 * Consolidates all v1 routes and applies version-specific middleware.
 */

const express = require('express');
const router = express.Router();

// Import all route modules
const authRoutes = require('../auth');
const caseRoutes = require('../cases');
const submissionRoutes = require('../submissions');
const photoRoutes = require('../photos');
const paymentRoutes = require('../payments');
const adminRoutes = require('../admin');
const aiRoutes = require('../ai');
const visualDNARoutes = require('../visualdna');
const matchRoutes = require('../matches');
const claimRoutes = require('../claimRoutes');
const messageRoutes = require('../messages');

const businessRules = require('../../config/businessRules');
const logger = require('../../config/logger');

/**
 * Category Filtering Middleware
 * Filters out hidden categories from responses
 */
const categoryFilter = (req, res, next) => {
  // Store original json method
  const originalJson = res.json.bind(res);

  // Override json method to filter categories
  res.json = (data) => {
    if (data && typeof data === 'object') {
      // Filter cases array if present
      if (Array.isArray(data.data)) {
        data.data = filterHiddenCategories(data.data, req.user);
      } else if (data.case && data.case.type) {
        // Single case response
        if (isHiddenCategory(data.case.type, req.user)) {
          return res.status(404).json({
            success: false,
            message: 'Case not found',
          });
        }
      } else if (Array.isArray(data.cases)) {
        data.cases = filterHiddenCategories(data.cases, req.user);
      }
    }
    return originalJson(data);
  };

  next();
};

/**
 * Check if a category is hidden for the user
 */
function isHiddenCategory(caseType, user) {
  const { categories } = businessRules;

  // Check if category is in hidden list
  if (!categories.hidden.includes(caseType)) {
    return false;
  }

  // Check if user has permission to view this category
  if (user && categories.requiresVerification[caseType]) {
    const requiredLevel = categories.requiresVerification[caseType];
    return user.verification_status !== requiredLevel;
  }

  return true;
}

/**
 * Filter hidden categories from an array of cases
 */
function filterHiddenCategories(items, user) {
  return items.filter(item => {
    const caseType = item.type || item.case_type;
    return !isHiddenCategory(caseType, user);
  });
}

/**
 * API Version Header Middleware
 */
const versionHeader = (req, res, next) => {
  res.set('X-API-Version', 'v1');
  res.set('X-API-Deprecated', 'false');
  next();
};

// Apply version header to all v1 routes
router.use(versionHeader);

// Apply category filter to case-related routes
router.use('/cases', categoryFilter, caseRoutes);
router.use('/submissions', categoryFilter, submissionRoutes);

// Mount all routes
router.use('/auth', authRoutes);
router.use('/photos', photoRoutes);
router.use('/payments', paymentRoutes);
router.use('/admin', adminRoutes);
router.use('/ai', aiRoutes);
router.use('/matches', matchRoutes);
router.use('/claims', claimRoutes);
router.use('/messages', messageRoutes);
router.use('/', visualDNARoutes); // Visual DNA routes at root level

// Version info endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    version: 'v1',
    status: 'stable',
    documentation: '/api/v1/docs',
    endpoints: {
      auth: '/api/v1/auth',
      cases: '/api/v1/cases',
      submissions: '/api/v1/submissions',
      photos: '/api/v1/photos',
      payments: '/api/v1/payments',
      matches: '/api/v1/matches',
      claims: '/api/v1/claims',
      messages: '/api/v1/messages',
      admin: '/api/v1/admin',
      ai: '/api/v1/ai',
    },
    categories: {
      enabled: businessRules.categories.enabled,
      note: 'Additional categories available with verification',
    },
  });
});

// Health check for v1
router.get('/health', (req, res) => {
  res.json({
    success: true,
    version: 'v1',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
