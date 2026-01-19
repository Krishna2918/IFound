/**
 * Law Enforcement Routes
 *
 * Dedicated routes for law enforcement portal operations.
 * Separate authentication from regular users.
 */

const express = require('express');
const router = express.Router();
const {
  protectLE,
  apiKeyAuth,
  requirePermission,
  requireRole,
  protectLEOrAdmin,
} = require('../middleware/leAuth');
const { protect } = require('../middleware/auth');
const {
  // Agency management
  registerAgency,
  getAgency,
  verifyAgency,
  // Officer authentication
  registerOfficer,
  officerLogin,
  verifyOfficer,
  // Case operations
  bulkImportCases,
  flagPriority,
  removePriorityFlag,
  getLECases,
  getLECaseDetail,
  // Reporting
  getComplianceReport,
  getActivityReport,
} = require('../controllers/lawEnforcementController');

// ==========================================
// PUBLIC ROUTES
// ==========================================

// Agency registration (public - requires verification)
router.post('/agency/register', registerAgency);

// Officer registration (public - requires verification)
router.post('/officer/register', registerOfficer);

// Officer login
router.post('/officer/login', officerLogin);

// ==========================================
// PLATFORM ADMIN ROUTES
// ==========================================

// Verify agency (platform admin only)
router.post('/agency/:id/verify', protect, verifyAgency);

// Get agency details (platform admin or LE officer from same agency)
router.get('/agency/:id', protectLEOrAdmin, getAgency);

// ==========================================
// LAW ENFORCEMENT AUTHENTICATED ROUTES
// ==========================================

// Verify officer (agency admin or platform admin)
router.post('/officer/:id/verify', protectLEOrAdmin, verifyOfficer);

// Case listing and viewing
router.get('/cases', protectLE, getLECases);
router.get('/cases/:id', protectLE, getLECaseDetail);

// Bulk import cases (requires permission)
router.post(
  '/cases/bulk-import',
  protectLE,
  requirePermission('bulk_import'),
  bulkImportCases
);

// Priority flagging (requires permission)
router.post(
  '/cases/:id/flag-priority',
  protectLE,
  requirePermission('flag_priority'),
  flagPriority
);

router.delete(
  '/cases/:id/flag-priority',
  protectLE,
  requirePermission('flag_priority'),
  removePriorityFlag
);

// ==========================================
// REPORTING ROUTES
// ==========================================

// Compliance report
router.get(
  '/reports/compliance',
  protectLE,
  requirePermission('generate_reports'),
  getComplianceReport
);

// Activity report
router.get(
  '/reports/activity',
  protectLE,
  requirePermission('view_reports'),
  getActivityReport
);

// ==========================================
// API KEY ROUTES (Programmatic Access)
// ==========================================

// Bulk import via API key
router.post('/api/bulk-import', apiKeyAuth, async (req, res, next) => {
  // Convert API key auth to officer-like context for controller
  req.leOfficer = {
    agency_id: req.leAgency.id,
    hasPermission: (perm) => {
      if (perm === 'bulk_import') return req.leAgency.can_bulk_import;
      return false;
    },
    id: 'api-key-access',
  };
  next();
}, bulkImportCases);

// ==========================================
// INFO ROUTES
// ==========================================

// Portal info
router.get('/', (req, res) => {
  res.json({
    success: true,
    portal: 'IFound Law Enforcement Portal',
    version: '1.0',
    endpoints: {
      agency: {
        register: 'POST /api/v1/law-enforcement/agency/register',
        get: 'GET /api/v1/law-enforcement/agency/:id',
        verify: 'POST /api/v1/law-enforcement/agency/:id/verify (admin)',
      },
      officer: {
        register: 'POST /api/v1/law-enforcement/officer/register',
        login: 'POST /api/v1/law-enforcement/officer/login',
        verify: 'POST /api/v1/law-enforcement/officer/:id/verify',
      },
      cases: {
        list: 'GET /api/v1/law-enforcement/cases',
        detail: 'GET /api/v1/law-enforcement/cases/:id',
        bulkImport: 'POST /api/v1/law-enforcement/cases/bulk-import',
        flagPriority: 'POST /api/v1/law-enforcement/cases/:id/flag-priority',
        unflagPriority: 'DELETE /api/v1/law-enforcement/cases/:id/flag-priority',
      },
      reports: {
        compliance: 'GET /api/v1/law-enforcement/reports/compliance',
        activity: 'GET /api/v1/law-enforcement/reports/activity',
      },
      api: {
        bulkImport: 'POST /api/v1/law-enforcement/api/bulk-import (API key)',
      },
    },
    documentation: 'Contact support for API documentation',
  });
});

module.exports = router;
