/**
 * Verification Controller
 *
 * Handles user verification and reputation endpoints.
 */

const verificationService = require('../services/verificationService');
const reputationService = require('../services/reputationService');
const auditService = require('../services/auditService');
const { User } = require('../models');
const logger = require('../config/logger');

/**
 * Get current user's verification status
 */
async function getVerificationStatus(req, res) {
  try {
    const status = await verificationService.getVerificationStatus(req.user.id);

    res.json({
      success: true,
      verification: status,
    });
  } catch (error) {
    logger.error('Error getting verification status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get verification status',
    });
  }
}

/**
 * Send email verification code
 */
async function sendEmailVerification(req, res) {
  try {
    const result = await verificationService.sendEmailVerification(req.user.id);

    if (result.success) {
      res.json({
        success: true,
        message: 'Verification code sent to your email',
        expiresIn: '10 minutes',
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Failed to send verification code',
      });
    }
  } catch (error) {
    logger.error('Error sending email verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification code',
    });
  }
}

/**
 * Verify email with code
 */
async function verifyEmail(req, res) {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Verification code is required',
      });
    }

    const result = await verificationService.verifyEmail(req.user.id, code);

    if (result.success) {
      // Apply reputation event
      await reputationService.applyReputationEvent(req.user.id, 'email_verified');

      // Log the verification
      await auditService.logVerificationChange(req, req.user, 'email_verified', 'unverified', 'email_verified');

      res.json({
        success: true,
        message: 'Email verified successfully',
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Invalid verification code',
      });
    }
  } catch (error) {
    logger.error('Error verifying email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify email',
    });
  }
}

/**
 * Send phone verification code
 */
async function sendPhoneVerification(req, res) {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required',
      });
    }

    const result = await verificationService.sendPhoneVerification(req.user.id, phoneNumber);

    if (result.success) {
      res.json({
        success: true,
        message: 'Verification code sent via SMS',
        phoneNumber: result.phoneNumber,
        expiresIn: '10 minutes',
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Failed to send verification code',
      });
    }
  } catch (error) {
    logger.error('Error sending phone verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification code',
    });
  }
}

/**
 * Verify phone with code
 */
async function verifyPhone(req, res) {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Verification code is required',
      });
    }

    const result = await verificationService.verifyPhone(req.user.id, code);

    if (result.success) {
      // Apply reputation event
      await reputationService.applyReputationEvent(req.user.id, 'phone_verified');

      // Log the verification
      await auditService.logVerificationChange(req, req.user, 'phone_verified', 'email_verified', 'phone_verified');

      res.json({
        success: true,
        message: 'Phone verified successfully',
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Invalid verification code',
      });
    }
  } catch (error) {
    logger.error('Error verifying phone:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify phone',
    });
  }
}

/**
 * Create ID verification session (Stripe Identity)
 */
async function createIdVerificationSession(req, res) {
  try {
    const result = await verificationService.createIdVerificationSession(req.user.id);

    if (result.success) {
      res.json({
        success: true,
        sessionUrl: result.url,
        sessionId: result.sessionId,
        message: 'Please complete ID verification in the opened window',
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Failed to create verification session',
      });
    }
  } catch (error) {
    logger.error('Error creating ID verification session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create verification session',
    });
  }
}

/**
 * Handle Stripe Identity webhook
 */
async function handleIdVerificationWebhook(req, res) {
  try {
    const event = req.body;

    if (event.type === 'identity.verification_session.verified') {
      const session = event.data.object;
      const result = await verificationService.handleIdVerificationWebhook(session);

      if (result.success) {
        // Apply reputation event
        await reputationService.applyReputationEvent(result.userId, 'id_verified');

        logger.info(`ID verification completed for user ${result.userId}`);
      }
    } else if (event.type === 'identity.verification_session.requires_input') {
      logger.warn('ID verification requires additional input:', event.data.object);
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Error handling ID verification webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
    });
  }
}

/**
 * Submit law enforcement verification request
 */
async function submitLawEnforcementVerification(req, res) {
  try {
    const { badgeNumber, department, rank, supervisorEmail, documentUrls } = req.body;

    if (!badgeNumber || !department || !rank || !supervisorEmail) {
      return res.status(400).json({
        success: false,
        message: 'Badge number, department, rank, and supervisor email are required',
      });
    }

    const result = await verificationService.submitLawEnforcementVerification(req.user.id, {
      badgeNumber,
      department,
      rank,
      supervisorEmail,
      documentUrls: documentUrls || [],
    });

    if (result.success) {
      // Log the submission
      await auditService.logAdminAction(
        req,
        null, // No admin user for self-submission
        'le_verification_submitted',
        'verification',
        req.user.id,
        { department, rank }
      );

      res.json({
        success: true,
        message: 'Law enforcement verification request submitted',
        requestId: result.requestId,
        status: 'pending_review',
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Failed to submit verification request',
      });
    }
  } catch (error) {
    logger.error('Error submitting LE verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit verification request',
    });
  }
}

/**
 * Admin: Approve law enforcement verification
 */
async function approveLawEnforcementVerification(req, res) {
  try {
    const { userId } = req.params;
    const { notes } = req.body;

    const result = await verificationService.approveLawEnforcementVerification(
      userId,
      req.user.id,
      notes
    );

    if (result.success) {
      // Log the approval
      await auditService.logAdminAction(
        req,
        req.user,
        'le_verification_approved',
        'verification',
        userId,
        { notes }
      );

      res.json({
        success: true,
        message: 'Law enforcement verification approved',
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Failed to approve verification',
      });
    }
  } catch (error) {
    logger.error('Error approving LE verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve verification',
    });
  }
}

/**
 * Admin: Reject law enforcement verification
 */
async function rejectLawEnforcementVerification(req, res) {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required',
      });
    }

    const result = await verificationService.rejectLawEnforcementVerification(
      userId,
      req.user.id,
      reason
    );

    if (result.success) {
      // Log the rejection
      await auditService.logAdminAction(
        req,
        req.user,
        'le_verification_rejected',
        'verification',
        userId,
        { reason }
      );

      res.json({
        success: true,
        message: 'Law enforcement verification rejected',
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Failed to reject verification',
      });
    }
  } catch (error) {
    logger.error('Error rejecting LE verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject verification',
    });
  }
}

/**
 * Admin: Get pending law enforcement verifications
 */
async function getPendingLEVerifications(req, res) {
  try {
    const { page = 1, limit = 20 } = req.query;

    const users = await User.findAndCountAll({
      where: {
        le_verification_status: 'pending',
      },
      attributes: [
        'id', 'full_name', 'email', 'le_badge_number', 'le_department',
        'le_rank', 'le_supervisor_email', 'createdAt',
      ],
      order: [['createdAt', 'ASC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    res.json({
      success: true,
      requests: users.rows,
      pagination: {
        total: users.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(users.count / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Error getting pending LE verifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pending verifications',
    });
  }
}

// ==================== REPUTATION ENDPOINTS ====================

/**
 * Get current user's reputation
 */
async function getMyReputation(req, res) {
  try {
    const profile = await reputationService.getReputationProfile(req.user.id);

    res.json({
      success: true,
      reputation: profile,
    });
  } catch (error) {
    logger.error('Error getting reputation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get reputation',
    });
  }
}

/**
 * Get another user's public reputation profile
 */
async function getUserReputation(req, res) {
  try {
    const { userId } = req.params;

    const profile = await reputationService.getReputationProfile(userId);

    // Only return public information
    res.json({
      success: true,
      reputation: {
        userId: profile.userId,
        displayName: profile.displayName,
        score: profile.score,
        tier: profile.tier,
        badges: profile.badges,
        verification: profile.verification,
        stats: {
          memberSince: profile.stats.memberSince,
          claimsSuccessful: profile.stats.claimsSuccessful,
          casesResolved: profile.stats.casesResolved,
          successRate: profile.stats.successRate,
        },
      },
    });
  } catch (error) {
    logger.error('Error getting user reputation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user reputation',
    });
  }
}

/**
 * Recalculate current user's reputation
 */
async function recalculateMyReputation(req, res) {
  try {
    const result = await reputationService.updateReputationScore(req.user.id);

    res.json({
      success: true,
      message: 'Reputation recalculated',
      reputation: result,
    });
  } catch (error) {
    logger.error('Error recalculating reputation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to recalculate reputation',
    });
  }
}

/**
 * Get reputation leaderboard
 */
async function getLeaderboard(req, res) {
  try {
    const { limit = 10, verifiedOnly = false } = req.query;

    const leaderboard = await reputationService.getLeaderboard({
      limit: Math.min(parseInt(limit), 100),
      verifiedOnly: verifiedOnly === 'true',
    });

    res.json({
      success: true,
      leaderboard,
    });
  } catch (error) {
    logger.error('Error getting leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get leaderboard',
    });
  }
}

/**
 * Admin: Recalculate all user reputations
 */
async function adminRecalculateAllReputations(req, res) {
  try {
    // This is an async operation, return immediately
    res.json({
      success: true,
      message: 'Batch reputation recalculation started',
      note: 'This may take several minutes to complete',
    });

    // Run in background
    reputationService.recalculateAllReputations({
      onProgress: (progress) => {
        logger.info(`Reputation recalculation progress: ${progress.processed}/${progress.total}`);
      },
    }).then((result) => {
      logger.info('Batch reputation recalculation complete:', result);
    }).catch((error) => {
      logger.error('Batch reputation recalculation failed:', error);
    });
  } catch (error) {
    logger.error('Error starting batch recalculation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start recalculation',
    });
  }
}

/**
 * Admin: Manually adjust user reputation
 */
async function adminAdjustReputation(req, res) {
  try {
    const { userId } = req.params;
    const { adjustment, reason } = req.body;

    if (typeof adjustment !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'Adjustment amount is required',
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Reason is required for manual adjustments',
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const currentScore = user.reputation_score || 50;
    const newScore = Math.max(0, Math.min(1000, currentScore + adjustment));

    await User.update(
      {
        reputation_score: newScore,
        reputation_updated_at: new Date(),
      },
      { where: { id: userId } }
    );

    // Log the admin action
    await auditService.logAdminAction(
      req,
      req.user,
      'reputation_adjusted',
      'user',
      userId,
      { previousScore: currentScore, newScore, adjustment, reason }
    );

    res.json({
      success: true,
      message: 'Reputation adjusted',
      previousScore: currentScore,
      adjustment,
      newScore,
      reason,
    });
  } catch (error) {
    logger.error('Error adjusting reputation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to adjust reputation',
    });
  }
}

/**
 * Check if action is allowed based on verification and reputation
 */
async function checkActionPermission(req, res) {
  try {
    const { action, amount } = req.query;

    if (!action) {
      return res.status(400).json({
        success: false,
        message: 'Action is required',
      });
    }

    // Check verification requirements
    const canPerform = await verificationService.canPerformAction(
      req.user.id,
      action,
      { amount: amount ? parseFloat(amount) : undefined }
    );

    // Check reputation requirements
    const user = await User.findByPk(req.user.id);
    const meetsReputation = reputationService.meetsMinimumReputation(
      user.reputation_score || 50,
      action
    );

    const allowed = canPerform.allowed && meetsReputation;

    res.json({
      success: true,
      action,
      allowed,
      verification: canPerform,
      reputation: {
        currentScore: user.reputation_score || 50,
        meetsMinimum: meetsReputation,
      },
      requirements: allowed ? null : {
        verification: canPerform.allowed ? null : canPerform.reason,
        reputation: meetsReputation ? null : 'Insufficient reputation score',
      },
    });
  } catch (error) {
    logger.error('Error checking action permission:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check permission',
    });
  }
}

module.exports = {
  // Verification endpoints
  getVerificationStatus,
  sendEmailVerification,
  verifyEmail,
  sendPhoneVerification,
  verifyPhone,
  createIdVerificationSession,
  handleIdVerificationWebhook,
  submitLawEnforcementVerification,
  approveLawEnforcementVerification,
  rejectLawEnforcementVerification,
  getPendingLEVerifications,

  // Reputation endpoints
  getMyReputation,
  getUserReputation,
  recalculateMyReputation,
  getLeaderboard,
  adminRecalculateAllReputations,
  adminAdjustReputation,

  // Combined check
  checkActionPermission,
};
