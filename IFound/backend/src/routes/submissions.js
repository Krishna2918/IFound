const express = require('express');
const router = express.Router();
const {
  createSubmission,
  getSubmissionsByCase,
  getMySubmissions,
  verifySubmission,
  deleteSubmission,
  getSubmissionById,
} = require('../controllers/submissionController');
const { authenticateToken, optionalAuth, requireUserType } = require('../middleware/auth');

// Public/optional auth routes
router.post('/', optionalAuth, createSubmission);
router.get('/case/:caseId', optionalAuth, getSubmissionsByCase);

// Protected routes
router.get('/my-submissions', authenticateToken, getMySubmissions);
router.get('/:id', authenticateToken, getSubmissionById);
router.put('/:id/verify', authenticateToken, verifySubmission);
router.delete('/:id', authenticateToken, deleteSubmission);

module.exports = router;
