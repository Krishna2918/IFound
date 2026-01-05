const express = require('express');
const router = express.Router();
const {
  createCase,
  getCases,
  getCaseById,
  updateCase,
  deleteCase,
  getMyCases,
  browseCases,
} = require('../controllers/caseController');
const {
  authenticateToken,
  optionalAuth,
  requireVerification,
} = require('../middleware/auth');

// Public routes
router.get('/', optionalAuth, getCases);

// Protected routes (specific paths must come before :id)
router.get('/my/cases', authenticateToken, getMyCases);
router.get('/browse', authenticateToken, browseCases);
router.post(
  '/',
  authenticateToken,
  requireVerification('email_verified'),
  createCase
);
router.put('/:id', authenticateToken, updateCase);
router.delete('/:id', authenticateToken, deleteCase);

// This must be last (catches :id parameter)
router.get('/:id', optionalAuth, getCaseById);

module.exports = router;
