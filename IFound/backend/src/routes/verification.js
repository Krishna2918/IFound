/**
 * Verification Routes
 *
 * Handles user verification and reputation endpoints.
 */

const express = require('express');
const router = express.Router();
const verificationController = require('../controllers/verificationController');
const { authenticateToken, requireUserType } = require('../middleware/auth');
const { tieredRateLimiter, authLimiter, strictRateLimit } = require('../middleware/rateLimit');

// ==================== VERIFICATION ROUTES ====================

/**
 * @route GET /api/v1/verification/status
 * @desc Get current user's verification status
 * @access Private
 */
router.get(
  '/status',
  authenticateToken,
  verificationController.getVerificationStatus
);

/**
 * @route POST /api/v1/verification/email/send
 * @desc Send email verification code
 * @access Private
 */
router.post(
  '/email/send',
  authenticateToken,
  authLimiter,
  verificationController.sendEmailVerification
);

/**
 * @route POST /api/v1/verification/email/verify
 * @desc Verify email with code
 * @access Private
 */
router.post(
  '/email/verify',
  authenticateToken,
  authLimiter,
  verificationController.verifyEmail
);

/**
 * @route POST /api/v1/verification/phone/send
 * @desc Send phone verification code via SMS
 * @access Private
 */
router.post(
  '/phone/send',
  authenticateToken,
  authLimiter,
  verificationController.sendPhoneVerification
);

/**
 * @route POST /api/v1/verification/phone/verify
 * @desc Verify phone with code
 * @access Private
 */
router.post(
  '/phone/verify',
  authenticateToken,
  authLimiter,
  verificationController.verifyPhone
);

/**
 * @route POST /api/v1/verification/id/create-session
 * @desc Create Stripe Identity verification session
 * @access Private
 */
router.post(
  '/id/create-session',
  authenticateToken,
  tieredRateLimiter,
  verificationController.createIdVerificationSession
);

/**
 * @route POST /api/v1/verification/id/webhook
 * @desc Handle Stripe Identity webhook
 * @access Public (verified by Stripe signature)
 */
router.post(
  '/id/webhook',
  express.raw({ type: 'application/json' }),
  verificationController.handleIdVerificationWebhook
);

/**
 * @route POST /api/v1/verification/law-enforcement/submit
 * @desc Submit law enforcement verification request
 * @access Private
 */
router.post(
  '/law-enforcement/submit',
  authenticateToken,
  tieredRateLimiter,
  verificationController.submitLawEnforcementVerification
);

/**
 * @route GET /api/v1/verification/can-perform
 * @desc Check if user can perform an action based on verification level
 * @access Private
 * @query {string} action - Action to check (e.g., 'post_bounty_over_100')
 * @query {number} amount - Optional amount for bounty-related actions
 */
router.get(
  '/can-perform',
  authenticateToken,
  verificationController.checkActionPermission
);

// ==================== REPUTATION ROUTES ====================

/**
 * @route GET /api/v1/verification/reputation
 * @desc Get current user's reputation profile
 * @access Private
 */
router.get(
  '/reputation',
  authenticateToken,
  verificationController.getMyReputation
);

/**
 * @route GET /api/v1/verification/reputation/:userId
 * @desc Get another user's public reputation profile
 * @access Public
 */
router.get(
  '/reputation/:userId',
  verificationController.getUserReputation
);

/**
 * @route POST /api/v1/verification/reputation/recalculate
 * @desc Recalculate current user's reputation score
 * @access Private
 */
router.post(
  '/reputation/recalculate',
  authenticateToken,
  tieredRateLimiter,
  verificationController.recalculateMyReputation
);

/**
 * @route GET /api/v1/verification/leaderboard
 * @desc Get reputation leaderboard
 * @access Public
 * @query {number} limit - Number of users to return (default: 10, max: 100)
 * @query {boolean} verifiedOnly - Only include ID-verified users
 */
router.get(
  '/leaderboard',
  verificationController.getLeaderboard
);

// ==================== ADMIN ROUTES ====================

/**
 * @route GET /api/v1/verification/admin/pending-le
 * @desc Get pending law enforcement verification requests
 * @access Admin only
 */
router.get(
  '/admin/pending-le',
  authenticateToken,
  requireUserType('admin'),
  verificationController.getPendingLEVerifications
);

/**
 * @route POST /api/v1/verification/admin/approve-le/:userId
 * @desc Approve law enforcement verification
 * @access Admin only
 */
router.post(
  '/admin/approve-le/:userId',
  authenticateToken,
  requireUserType('admin'),
  verificationController.approveLawEnforcementVerification
);

/**
 * @route POST /api/v1/verification/admin/reject-le/:userId
 * @desc Reject law enforcement verification
 * @access Admin only
 */
router.post(
  '/admin/reject-le/:userId',
  authenticateToken,
  requireUserType('admin'),
  verificationController.rejectLawEnforcementVerification
);

/**
 * @route POST /api/v1/verification/admin/recalculate-all
 * @desc Trigger batch recalculation of all user reputations
 * @access Admin only
 */
router.post(
  '/admin/recalculate-all',
  authenticateToken,
  requireUserType('admin'),
  verificationController.adminRecalculateAllReputations
);

/**
 * @route POST /api/v1/verification/admin/adjust-reputation/:userId
 * @desc Manually adjust a user's reputation score
 * @access Admin only
 * @body {number} adjustment - Points to add (negative to subtract)
 * @body {string} reason - Reason for adjustment
 */
router.post(
  '/admin/adjust-reputation/:userId',
  authenticateToken,
  requireUserType('admin'),
  verificationController.adminAdjustReputation
);

module.exports = router;
