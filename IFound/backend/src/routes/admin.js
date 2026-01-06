const express = require('express');
const router = express.Router();
const {
  getDashboardAnalytics,
  getAllUsers,
  updateUserVerification,
  suspendUser,
  getAllCasesForModeration,
  suspendCase,
  getAllSubmissions,
  getAllTransactions,
  getAllMatches,
  getMatchStats,
  getUserMatches,
} = require('../controllers/adminController');
const {
  getFraudAlerts,
  getFraudAlert,
  reviewFraudAlert,
  bulkReviewAlerts,
  getFraudStats,
  getAuditLogs,
  getSecuritySummary,
  checkUserFraud,
} = require('../controllers/fraudController');
const {
  getSystemHealth,
  healthPing,
  getDatabaseHealth,
} = require('../controllers/healthController');
const { authenticateToken, requireUserType } = require('../middleware/auth');
const { auditMiddlewares } = require('../middleware/auditMiddleware');

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireUserType('admin'));

// Analytics
router.get('/analytics', getDashboardAnalytics);

// Users
router.get('/users', getAllUsers);
router.get('/users/:id/matches', getUserMatches);
router.put('/users/:id/verify', updateUserVerification);
router.put('/users/:id/suspend', auditMiddlewares.adminUserSuspend, suspendUser);

// Cases
router.get('/cases', getAllCasesForModeration);
router.put('/cases/:id/suspend', suspendCase);

// Submissions
router.get('/submissions', getAllSubmissions);

// Transactions
router.get('/transactions', getAllTransactions);

// Matches
router.get('/matches', getAllMatches);
router.get('/matches/stats', getMatchStats);

// Fraud Detection & Review
router.get('/fraud/alerts', getFraudAlerts);
router.get('/fraud/alerts/:id', getFraudAlert);
router.put('/fraud/alerts/:id/review', auditMiddlewares.adminFraudReview, reviewFraudAlert);
router.post('/fraud/alerts/bulk-review', bulkReviewAlerts);
router.get('/fraud/stats', getFraudStats);
router.post('/fraud/check-user/:user_id', checkUserFraud);

// Audit Logs
router.get('/audit-logs', getAuditLogs);

// Security Dashboard
router.get('/security/summary', getSecuritySummary);

// System Health Monitoring
router.get('/health', getSystemHealth);
router.get('/health/ping', healthPing);
router.get('/health/database', getDatabaseHealth);

module.exports = router;
