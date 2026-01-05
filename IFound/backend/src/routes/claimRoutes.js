/**
 * Claim Routes
 *
 * Routes for claiming found items.
 */

const express = require('express');
const router = express.Router();
const {
  createClaim,
  getClaimsForCase,
  getMyClaims,
  getClaimById,
  acceptClaim,
  rejectClaim,
  confirmHandover,
  cancelClaim,
  addVerificationQuestion,
  answerVerificationQuestion,
  getClaimsStats,
} = require('../controllers/claimController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// Stats
router.get('/stats', getClaimsStats);

// My claims (as claimant)
router.get('/my-claims', getMyClaims);

// Claims for a specific case (for finder)
router.get('/case/:caseId', getClaimsForCase);

// Create a claim
router.post('/', createClaim);

// Get single claim
router.get('/:claimId', getClaimById);

// Accept/reject claims (for finder)
router.put('/:claimId/accept', acceptClaim);
router.put('/:claimId/reject', rejectClaim);

// Cancel claim (for claimant)
router.put('/:claimId/cancel', cancelClaim);

// Confirm handover (for both parties)
router.put('/:claimId/confirm-handover', confirmHandover);

// Verification questions
router.post('/:claimId/questions', addVerificationQuestion);
router.put('/:claimId/questions/:questionIndex', answerVerificationQuestion);

module.exports = router;
