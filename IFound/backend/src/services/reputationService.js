/**
 * Reputation Scoring Service
 *
 * Calculates and manages user trust/reputation scores based on their
 * activity and behavior on the platform.
 */

const { User, Case, Claim, AuditLog, FraudAlert } = require('../models');
const logger = require('../config/logger');
const { Op } = require('sequelize');

// Score factors configuration
const SCORE_FACTORS = {
  // Positive actions
  SUCCESSFUL_CLAIM_COMPLETION: 10,
  VERIFIED_EMAIL: 5,
  VERIFIED_PHONE: 10,
  VERIFIED_ID: 20,
  LAW_ENFORCEMENT_VERIFIED: 50,
  ACCOUNT_AGE_PER_MONTH: 1,
  QUICK_RESPONSE_UNDER_1HR: 2,
  QUICK_RESPONSE_UNDER_24HR: 1,
  CASE_POSTED: 2,
  CASE_RESOLVED: 5,
  POSITIVE_FEEDBACK: 5,
  HELPED_FIND_ITEM: 15,

  // Negative actions
  CLAIM_REJECTION: -5,
  CLAIM_ABANDONED: -3,
  CASE_EXPIRED_NO_ACTIVITY: -2,
  FRAUD_ALERT_LOW: -10,
  FRAUD_ALERT_MEDIUM: -25,
  FRAUD_ALERT_HIGH: -50,
  FRAUD_CONFIRMED: -100,
  REPORTED_BY_USER: -5,
  SLOW_RESPONSE_OVER_48HR: -1,

  // Caps
  MAX_ACCOUNT_AGE_BONUS: 24, // Max 24 months of bonus
  MAX_SCORE: 1000,
  MIN_SCORE: 0,
  STARTING_SCORE: 50,
};

// Reputation tiers
const REPUTATION_TIERS = {
  TRUSTED: { min: 200, label: 'Trusted', color: 'green', badge: '🏆' },
  VERIFIED: { min: 100, label: 'Verified', color: 'blue', badge: '✓' },
  ESTABLISHED: { min: 50, label: 'Established', color: 'gray', badge: '' },
  NEW: { min: 20, label: 'New User', color: 'gray', badge: '' },
  LOW: { min: 0, label: 'Low Trust', color: 'yellow', badge: '⚠️' },
  SUSPENDED: { min: -1, label: 'Suspended', color: 'red', badge: '🚫' },
};

/**
 * Calculate a user's reputation score from scratch
 */
async function calculateReputationScore(userId) {
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    let score = SCORE_FACTORS.STARTING_SCORE;
    const breakdown = {
      base: SCORE_FACTORS.STARTING_SCORE,
      verification: 0,
      accountAge: 0,
      claims: 0,
      cases: 0,
      responsiveness: 0,
      penalties: 0,
    };

    // 1. Verification bonuses
    if (user.email_verified) {
      score += SCORE_FACTORS.VERIFIED_EMAIL;
      breakdown.verification += SCORE_FACTORS.VERIFIED_EMAIL;
    }
    if (user.phone_verified) {
      score += SCORE_FACTORS.VERIFIED_PHONE;
      breakdown.verification += SCORE_FACTORS.VERIFIED_PHONE;
    }
    if (user.verification_status === 'id_verified') {
      score += SCORE_FACTORS.VERIFIED_ID;
      breakdown.verification += SCORE_FACTORS.VERIFIED_ID;
    }
    if (user.verification_status === 'law_enforcement') {
      score += SCORE_FACTORS.LAW_ENFORCEMENT_VERIFIED;
      breakdown.verification += SCORE_FACTORS.LAW_ENFORCEMENT_VERIFIED;
    }

    // 2. Account age bonus (capped)
    const accountAgeMonths = Math.floor(
      (Date.now() - new Date(user.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000)
    );
    const ageBonus = Math.min(accountAgeMonths, SCORE_FACTORS.MAX_ACCOUNT_AGE_BONUS)
      * SCORE_FACTORS.ACCOUNT_AGE_PER_MONTH;
    score += ageBonus;
    breakdown.accountAge = ageBonus;

    // 3. Claim history
    const claimStats = await getClaimStats(userId);

    // Successful claims
    score += claimStats.successful * SCORE_FACTORS.SUCCESSFUL_CLAIM_COMPLETION;
    score += claimStats.helpedFind * SCORE_FACTORS.HELPED_FIND_ITEM;
    breakdown.claims += claimStats.successful * SCORE_FACTORS.SUCCESSFUL_CLAIM_COMPLETION;
    breakdown.claims += claimStats.helpedFind * SCORE_FACTORS.HELPED_FIND_ITEM;

    // Rejected/abandoned claims
    score += claimStats.rejected * SCORE_FACTORS.CLAIM_REJECTION;
    score += claimStats.abandoned * SCORE_FACTORS.CLAIM_ABANDONED;
    breakdown.penalties += claimStats.rejected * SCORE_FACTORS.CLAIM_REJECTION;
    breakdown.penalties += claimStats.abandoned * SCORE_FACTORS.CLAIM_ABANDONED;

    // 4. Case history
    const caseStats = await getCaseStats(userId);

    score += caseStats.posted * SCORE_FACTORS.CASE_POSTED;
    score += caseStats.resolved * SCORE_FACTORS.CASE_RESOLVED;
    score += caseStats.expiredNoActivity * SCORE_FACTORS.CASE_EXPIRED_NO_ACTIVITY;
    breakdown.cases += caseStats.posted * SCORE_FACTORS.CASE_POSTED;
    breakdown.cases += caseStats.resolved * SCORE_FACTORS.CASE_RESOLVED;
    breakdown.penalties += caseStats.expiredNoActivity * SCORE_FACTORS.CASE_EXPIRED_NO_ACTIVITY;

    // 5. Responsiveness
    const responseStats = await getResponseStats(userId);

    score += responseStats.quickUnder1hr * SCORE_FACTORS.QUICK_RESPONSE_UNDER_1HR;
    score += responseStats.quickUnder24hr * SCORE_FACTORS.QUICK_RESPONSE_UNDER_24HR;
    score += responseStats.slowOver48hr * SCORE_FACTORS.SLOW_RESPONSE_OVER_48HR;
    breakdown.responsiveness += responseStats.quickUnder1hr * SCORE_FACTORS.QUICK_RESPONSE_UNDER_1HR;
    breakdown.responsiveness += responseStats.quickUnder24hr * SCORE_FACTORS.QUICK_RESPONSE_UNDER_24HR;
    breakdown.penalties += responseStats.slowOver48hr * SCORE_FACTORS.SLOW_RESPONSE_OVER_48HR;

    // 6. Fraud alerts
    const fraudStats = await getFraudStats(userId);

    score += fraudStats.low * SCORE_FACTORS.FRAUD_ALERT_LOW;
    score += fraudStats.medium * SCORE_FACTORS.FRAUD_ALERT_MEDIUM;
    score += fraudStats.high * SCORE_FACTORS.FRAUD_ALERT_HIGH;
    score += fraudStats.confirmed * SCORE_FACTORS.FRAUD_CONFIRMED;
    breakdown.penalties += fraudStats.low * SCORE_FACTORS.FRAUD_ALERT_LOW;
    breakdown.penalties += fraudStats.medium * SCORE_FACTORS.FRAUD_ALERT_MEDIUM;
    breakdown.penalties += fraudStats.high * SCORE_FACTORS.FRAUD_ALERT_HIGH;
    breakdown.penalties += fraudStats.confirmed * SCORE_FACTORS.FRAUD_CONFIRMED;

    // 7. Feedback/reports
    const feedbackStats = await getFeedbackStats(userId);

    score += feedbackStats.positive * SCORE_FACTORS.POSITIVE_FEEDBACK;
    score += feedbackStats.reports * SCORE_FACTORS.REPORTED_BY_USER;
    breakdown.cases += feedbackStats.positive * SCORE_FACTORS.POSITIVE_FEEDBACK;
    breakdown.penalties += feedbackStats.reports * SCORE_FACTORS.REPORTED_BY_USER;

    // Apply caps
    score = Math.max(SCORE_FACTORS.MIN_SCORE, Math.min(SCORE_FACTORS.MAX_SCORE, score));

    return {
      score,
      breakdown,
      tier: getReputationTier(score),
      lastCalculated: new Date(),
    };
  } catch (error) {
    logger.error(`Error calculating reputation for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Get claim statistics for a user
 */
async function getClaimStats(userId) {
  const claims = await Claim.findAll({
    where: { claimant_id: userId },
    attributes: ['status', 'createdAt', 'updatedAt'],
  });

  return {
    total: claims.length,
    successful: claims.filter(c => c.status === 'approved').length,
    rejected: claims.filter(c => c.status === 'rejected').length,
    abandoned: claims.filter(c => c.status === 'abandoned' || c.status === 'withdrawn').length,
    helpedFind: claims.filter(c => c.status === 'approved').length, // Same as successful for now
  };
}

/**
 * Get case statistics for a user
 */
async function getCaseStats(userId) {
  const cases = await Case.findAll({
    where: { poster_id: userId },
    attributes: ['status', 'createdAt', 'updatedAt', 'expires_at'],
  });

  const now = new Date();

  return {
    total: cases.length,
    posted: cases.length,
    resolved: cases.filter(c => c.status === 'resolved' || c.status === 'claimed').length,
    active: cases.filter(c => c.status === 'active').length,
    expiredNoActivity: cases.filter(c => {
      // Expired without any claims or resolution
      return c.status === 'expired' && c.expires_at && new Date(c.expires_at) < now;
    }).length,
  };
}

/**
 * Get response time statistics
 */
async function getResponseStats(userId) {
  // This would analyze message response times
  // For now, return placeholder stats
  // In production, this would query the Message model

  try {
    const { Message } = require('../models');

    // Get messages where user was the responder
    const messages = await Message.findAll({
      where: { sender_id: userId },
      attributes: ['createdAt', 'claim_id'],
      order: [['createdAt', 'ASC']],
      limit: 100, // Sample recent messages
    });

    // Simplified calculation - would need more complex logic in production
    return {
      quickUnder1hr: Math.floor(messages.length * 0.3), // Placeholder
      quickUnder24hr: Math.floor(messages.length * 0.4),
      slowOver48hr: Math.floor(messages.length * 0.1),
    };
  } catch (error) {
    // Message model might not exist yet
    return {
      quickUnder1hr: 0,
      quickUnder24hr: 0,
      slowOver48hr: 0,
    };
  }
}

/**
 * Get fraud alert statistics
 */
async function getFraudStats(userId) {
  const alerts = await FraudAlert.findAll({
    where: { user_id: userId },
    attributes: ['severity', 'status'],
  });

  return {
    total: alerts.length,
    low: alerts.filter(a => a.severity === 'low').length,
    medium: alerts.filter(a => a.severity === 'medium').length,
    high: alerts.filter(a => a.severity === 'high' || a.severity === 'critical').length,
    confirmed: alerts.filter(a => a.status === 'confirmed').length,
  };
}

/**
 * Get feedback/report statistics
 */
async function getFeedbackStats(userId) {
  // This would come from a Feedback or Report model
  // For now, use audit logs as a proxy

  try {
    const positiveActions = await AuditLog.count({
      where: {
        target_user_id: userId,
        event_type: {
          [Op.in]: ['claim_accepted', 'case_resolved', 'positive_feedback'],
        },
      },
    });

    const reports = await AuditLog.count({
      where: {
        target_user_id: userId,
        event_type: 'user_reported',
      },
    });

    return {
      positive: positiveActions,
      reports: reports,
    };
  } catch (error) {
    return { positive: 0, reports: 0 };
  }
}

/**
 * Get reputation tier based on score
 */
function getReputationTier(score) {
  if (score < 0) return REPUTATION_TIERS.SUSPENDED;
  if (score < 20) return REPUTATION_TIERS.LOW;
  if (score < 50) return REPUTATION_TIERS.NEW;
  if (score < 100) return REPUTATION_TIERS.ESTABLISHED;
  if (score < 200) return REPUTATION_TIERS.VERIFIED;
  return REPUTATION_TIERS.TRUSTED;
}

/**
 * Update user's reputation score in database
 */
async function updateReputationScore(userId) {
  try {
    const result = await calculateReputationScore(userId);

    await User.update(
      {
        reputation_score: result.score,
        reputation_updated_at: new Date(),
      },
      { where: { id: userId } }
    );

    logger.info(`Updated reputation for user ${userId}: ${result.score} (${result.tier.label})`);

    return result;
  } catch (error) {
    logger.error(`Error updating reputation for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Apply a reputation adjustment for a specific event
 */
async function applyReputationEvent(userId, eventType, metadata = {}) {
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    let adjustment = 0;
    let reason = '';

    switch (eventType) {
      case 'claim_approved':
        adjustment = SCORE_FACTORS.SUCCESSFUL_CLAIM_COMPLETION;
        reason = 'Claim approved';
        break;
      case 'claim_rejected':
        adjustment = SCORE_FACTORS.CLAIM_REJECTION;
        reason = 'Claim rejected';
        break;
      case 'claim_abandoned':
        adjustment = SCORE_FACTORS.CLAIM_ABANDONED;
        reason = 'Claim abandoned';
        break;
      case 'case_resolved':
        adjustment = SCORE_FACTORS.CASE_RESOLVED;
        reason = 'Case resolved';
        break;
      case 'helped_find_item':
        adjustment = SCORE_FACTORS.HELPED_FIND_ITEM;
        reason = 'Helped find lost item';
        break;
      case 'email_verified':
        adjustment = SCORE_FACTORS.VERIFIED_EMAIL;
        reason = 'Email verified';
        break;
      case 'phone_verified':
        adjustment = SCORE_FACTORS.VERIFIED_PHONE;
        reason = 'Phone verified';
        break;
      case 'id_verified':
        adjustment = SCORE_FACTORS.VERIFIED_ID;
        reason = 'ID verified';
        break;
      case 'fraud_alert':
        const severity = metadata.severity || 'low';
        adjustment = SCORE_FACTORS[`FRAUD_ALERT_${severity.toUpperCase()}`] || SCORE_FACTORS.FRAUD_ALERT_LOW;
        reason = `Fraud alert (${severity})`;
        break;
      case 'fraud_confirmed':
        adjustment = SCORE_FACTORS.FRAUD_CONFIRMED;
        reason = 'Fraud confirmed';
        break;
      case 'positive_feedback':
        adjustment = SCORE_FACTORS.POSITIVE_FEEDBACK;
        reason = 'Positive feedback received';
        break;
      case 'user_reported':
        adjustment = SCORE_FACTORS.REPORTED_BY_USER;
        reason = 'Reported by another user';
        break;
      default:
        logger.warn(`Unknown reputation event type: ${eventType}`);
        return { success: false, error: 'Unknown event type' };
    }

    const currentScore = user.reputation_score || SCORE_FACTORS.STARTING_SCORE;
    const newScore = Math.max(
      SCORE_FACTORS.MIN_SCORE,
      Math.min(SCORE_FACTORS.MAX_SCORE, currentScore + adjustment)
    );

    await User.update(
      {
        reputation_score: newScore,
        reputation_updated_at: new Date(),
      },
      { where: { id: userId } }
    );

    logger.info(`Reputation event for user ${userId}: ${eventType} (${adjustment > 0 ? '+' : ''}${adjustment}), new score: ${newScore}`);

    return {
      success: true,
      previousScore: currentScore,
      adjustment,
      newScore,
      reason,
      tier: getReputationTier(newScore),
    };
  } catch (error) {
    logger.error(`Error applying reputation event for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Get user's public reputation profile
 */
async function getReputationProfile(userId) {
  try {
    const user = await User.findByPk(userId, {
      attributes: [
        'id', 'full_name', 'reputation_score', 'verification_status',
        'email_verified', 'phone_verified', 'createdAt',
      ],
    });

    if (!user) {
      throw new Error('User not found');
    }

    const score = user.reputation_score || SCORE_FACTORS.STARTING_SCORE;
    const tier = getReputationTier(score);

    // Get activity summary
    const claimStats = await getClaimStats(userId);
    const caseStats = await getCaseStats(userId);

    // Calculate account age
    const accountAgeDays = Math.floor(
      (Date.now() - new Date(user.createdAt).getTime()) / (24 * 60 * 60 * 1000)
    );

    return {
      userId: user.id,
      displayName: user.full_name,
      score,
      tier,
      badges: generateBadges(user, score, claimStats, caseStats),
      verification: {
        email: user.email_verified,
        phone: user.phone_verified,
        id: user.verification_status === 'id_verified',
        lawEnforcement: user.verification_status === 'law_enforcement',
      },
      stats: {
        memberSince: user.createdAt,
        accountAgeDays,
        claimsSuccessful: claimStats.successful,
        claimsTotal: claimStats.total,
        casesPosted: caseStats.posted,
        casesResolved: caseStats.resolved,
        successRate: claimStats.total > 0
          ? Math.round((claimStats.successful / claimStats.total) * 100)
          : null,
      },
    };
  } catch (error) {
    logger.error(`Error getting reputation profile for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Generate badges based on user achievements
 */
function generateBadges(user, score, claimStats, caseStats) {
  const badges = [];

  // Verification badges
  if (user.verification_status === 'law_enforcement') {
    badges.push({ id: 'law_enforcement', name: 'Law Enforcement', icon: '🛡️', color: 'blue' });
  } else if (user.verification_status === 'id_verified') {
    badges.push({ id: 'id_verified', name: 'ID Verified', icon: '✓', color: 'green' });
  }
  if (user.phone_verified) {
    badges.push({ id: 'phone_verified', name: 'Phone Verified', icon: '📱', color: 'gray' });
  }

  // Activity badges
  if (claimStats.successful >= 10) {
    badges.push({ id: 'super_finder', name: 'Super Finder', icon: '🔍', color: 'gold' });
  } else if (claimStats.successful >= 5) {
    badges.push({ id: 'helpful_finder', name: 'Helpful Finder', icon: '🤝', color: 'purple' });
  }

  if (caseStats.resolved >= 5) {
    badges.push({ id: 'grateful_poster', name: 'Grateful Poster', icon: '🙏', color: 'pink' });
  }

  // Score badges
  if (score >= 200) {
    badges.push({ id: 'trusted_member', name: 'Trusted Member', icon: '🏆', color: 'gold' });
  } else if (score >= 100) {
    badges.push({ id: 'rising_star', name: 'Rising Star', icon: '⭐', color: 'yellow' });
  }

  // Account age badge
  const accountAgeDays = Math.floor(
    (Date.now() - new Date(user.createdAt).getTime()) / (24 * 60 * 60 * 1000)
  );
  if (accountAgeDays >= 365) {
    badges.push({ id: 'veteran', name: 'Veteran', icon: '🎖️', color: 'bronze' });
  }

  return badges;
}

/**
 * Check if user meets minimum reputation for an action
 */
function meetsMinimumReputation(score, action) {
  const minimums = {
    post_case: 0,
    submit_claim: 0,
    send_message: 0,
    post_bounty_over_100: 50,
    post_bounty_over_500: 100,
    post_bounty_over_1000: 150,
    access_premium_features: 100,
    bypass_verification_qa: 200,
  };

  const minimum = minimums[action];
  if (minimum === undefined) {
    return true; // Unknown action, allow by default
  }

  return score >= minimum;
}

/**
 * Batch recalculate all user reputations (admin function)
 */
async function recalculateAllReputations(options = {}) {
  const { batchSize = 100, onProgress } = options;

  try {
    const totalUsers = await User.count();
    let processed = 0;
    let errors = 0;

    logger.info(`Starting batch reputation recalculation for ${totalUsers} users`);

    // Process in batches
    let offset = 0;
    while (offset < totalUsers) {
      const users = await User.findAll({
        attributes: ['id'],
        limit: batchSize,
        offset,
      });

      for (const user of users) {
        try {
          await updateReputationScore(user.id);
          processed++;
        } catch (error) {
          errors++;
          logger.error(`Error recalculating reputation for user ${user.id}:`, error);
        }
      }

      offset += batchSize;

      if (onProgress) {
        onProgress({ processed, total: totalUsers, errors });
      }
    }

    logger.info(`Batch reputation recalculation complete: ${processed} processed, ${errors} errors`);

    return { processed, total: totalUsers, errors };
  } catch (error) {
    logger.error('Error in batch reputation recalculation:', error);
    throw error;
  }
}

/**
 * Get leaderboard of top users by reputation
 */
async function getLeaderboard(options = {}) {
  const { limit = 10, minScore = 0, verifiedOnly = false } = options;

  try {
    const whereClause = {
      reputation_score: { [Op.gte]: minScore },
    };

    if (verifiedOnly) {
      whereClause.verification_status = {
        [Op.in]: ['id_verified', 'law_enforcement'],
      };
    }

    const users = await User.findAll({
      where: whereClause,
      attributes: [
        'id', 'full_name', 'reputation_score', 'verification_status',
        'email_verified', 'phone_verified', 'createdAt',
      ],
      order: [['reputation_score', 'DESC']],
      limit,
    });

    return users.map((user, index) => ({
      rank: index + 1,
      userId: user.id,
      displayName: user.full_name,
      score: user.reputation_score,
      tier: getReputationTier(user.reputation_score),
      verified: user.verification_status === 'id_verified' || user.verification_status === 'law_enforcement',
    }));
  } catch (error) {
    logger.error('Error getting leaderboard:', error);
    throw error;
  }
}

module.exports = {
  // Core functions
  calculateReputationScore,
  updateReputationScore,
  applyReputationEvent,
  getReputationProfile,

  // Utility functions
  getReputationTier,
  meetsMinimumReputation,
  generateBadges,

  // Stats functions
  getClaimStats,
  getCaseStats,
  getResponseStats,
  getFraudStats,
  getFeedbackStats,

  // Admin functions
  recalculateAllReputations,
  getLeaderboard,

  // Constants
  SCORE_FACTORS,
  REPUTATION_TIERS,
};
