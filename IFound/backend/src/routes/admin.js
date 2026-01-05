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
const { authenticateToken, requireUserType } = require('../middleware/auth');

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireUserType('admin'));

// Analytics
router.get('/analytics', getDashboardAnalytics);

// Users
router.get('/users', getAllUsers);
router.get('/users/:id/matches', getUserMatches);
router.put('/users/:id/verify', updateUserVerification);
router.put('/users/:id/suspend', suspendUser);

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

module.exports = router;
