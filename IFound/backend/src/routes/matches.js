const express = require('express');
const router = express.Router();
const {
  getMatchesForCase,
  getMyMatches,
  getMatchById,
  submitFeedback,
  getMatchStats,
} = require('../controllers/matchController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// Get match statistics for the current user
router.get('/stats', getMatchStats);

// Get all matches for the current user
router.get('/my-matches', getMyMatches);

// Get matches for a specific case
router.get('/case/:caseId', getMatchesForCase);

// Get a single match by ID
router.get('/:id', getMatchById);

// Submit feedback on a match
router.post('/:id/feedback', submitFeedback);

module.exports = router;
