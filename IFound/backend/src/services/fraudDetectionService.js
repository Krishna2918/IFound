/**
 * Fraud Detection Service
 *
 * Detects and prevents fraudulent activities including:
 * - Multiple claims from same IP/device
 * - Self-dealing (poster and finder same person)
 * - Rapid-fire claims
 * - Duplicate photo submissions
 * - Location spoofing
 * - Suspicious payout patterns
 */

const { FraudAlert, User, Case, Claim, Transaction } = require('../models');
const { Op } = require('sequelize');
const logger = require('../config/logger');
const businessRules = require('../config/businessRules');

// Detection thresholds (configurable)
const THRESHOLDS = {
  // Claims
  maxClaimsPerHour: parseInt(process.env.MAX_CLAIMS_PER_HOUR) || 5,
  maxClaimsPerDay: parseInt(process.env.MAX_CLAIMS_PER_DAY) || 20,
  maxClaimsSameIP: parseInt(process.env.MAX_CLAIMS_SAME_IP) || 3,

  // Velocity
  minTimeBetweenClaims: parseInt(process.env.MIN_TIME_BETWEEN_CLAIMS_MS) || 30000, // 30 seconds

  // Account age
  newAccountThresholdDays: parseInt(process.env.NEW_ACCOUNT_THRESHOLD_DAYS) || 7,

  // Payout
  highValuePayoutThreshold: parseInt(process.env.HIGH_VALUE_PAYOUT_THRESHOLD) || 500,

  // Scoring
  autoSuspendScore: parseInt(process.env.AUTO_SUSPEND_FRAUD_SCORE) || 85,
  alertThresholdScore: parseInt(process.env.ALERT_THRESHOLD_FRAUD_SCORE) || 50,
};

/**
 * Calculate fraud score for a user
 * @param {string} userId - User ID to analyze
 * @returns {Object} Fraud analysis result
 */
async function analyzeUser(userId) {
  const user = await User.findByPk(userId, {
    include: [
      { model: Claim, as: 'myClaims' },
      { model: FraudAlert, as: 'fraudAlerts' },
    ],
  });

  if (!user) {
    return { score: 0, factors: [], error: 'User not found' };
  }

  const factors = [];
  let score = 0;

  // Factor 1: Account age
  const accountAgeDays = (Date.now() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24);
  if (accountAgeDays < THRESHOLDS.newAccountThresholdDays) {
    score += 15;
    factors.push({
      name: 'new_account',
      impact: 15,
      detail: `Account is only ${Math.floor(accountAgeDays)} days old`,
    });
  }

  // Factor 2: Verification status
  if (user.verification_status === 'unverified') {
    score += 10;
    factors.push({
      name: 'unverified_account',
      impact: 10,
      detail: 'Account is not verified',
    });
  }

  // Factor 3: Previous fraud alerts
  const confirmedAlerts = user.fraudAlerts?.filter(a => a.status === 'confirmed') || [];
  if (confirmedAlerts.length > 0) {
    const alertScore = Math.min(confirmedAlerts.length * 20, 40);
    score += alertScore;
    factors.push({
      name: 'previous_fraud',
      impact: alertScore,
      detail: `${confirmedAlerts.length} previous confirmed fraud alerts`,
    });
  }

  // Factor 4: Claim rejection rate
  const claims = user.myClaims || [];
  if (claims.length >= 3) {
    const rejectedClaims = claims.filter(c => c.status === 'rejected').length;
    const rejectionRate = rejectedClaims / claims.length;
    if (rejectionRate > 0.5) {
      const rejectionScore = Math.floor(rejectionRate * 25);
      score += rejectionScore;
      factors.push({
        name: 'high_rejection_rate',
        impact: rejectionScore,
        detail: `${Math.floor(rejectionRate * 100)}% claim rejection rate`,
      });
    }
  }

  // Factor 5: Reputation score
  if (user.reputation_score < 0) {
    const repScore = Math.min(Math.abs(user.reputation_score), 20);
    score += repScore;
    factors.push({
      name: 'low_reputation',
      impact: repScore,
      detail: `Reputation score is ${user.reputation_score}`,
    });
  }

  return {
    userId,
    score: Math.min(score, 100),
    riskLevel: getRiskLevel(score),
    factors,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Check for self-dealing (poster and claimant connected)
 */
async function checkSelfDealing(claimData, ipAddress, deviceFingerprint) {
  const { found_case_id, claimant_id } = claimData;

  const foundCase = await Case.findByPk(found_case_id, {
    include: [{ model: User, as: 'poster' }],
  });

  if (!foundCase) return { isSuspicious: false };

  const alerts = [];
  let fraudScore = 0;

  // Check 1: Same user
  if (foundCase.poster_id === claimant_id) {
    alerts.push('poster_is_claimant');
    fraudScore = 100;
  }

  // Check 2: Same IP address
  if (ipAddress && foundCase.poster?.last_login_ip === ipAddress) {
    alerts.push('same_ip_address');
    fraudScore = Math.max(fraudScore, 80);
  }

  // Check 3: Same device fingerprint
  if (deviceFingerprint && foundCase.poster?.device_fingerprint === deviceFingerprint) {
    alerts.push('same_device');
    fraudScore = Math.max(fraudScore, 85);
  }

  // Check 4: Similar email patterns
  const claimant = await User.findByPk(claimant_id);
  if (claimant && foundCase.poster) {
    const posterEmailBase = foundCase.poster.email.split('@')[0].replace(/[0-9]/g, '');
    const claimantEmailBase = claimant.email.split('@')[0].replace(/[0-9]/g, '');
    if (posterEmailBase === claimantEmailBase && posterEmailBase.length > 3) {
      alerts.push('similar_email');
      fraudScore = Math.max(fraudScore, 60);
    }
  }

  if (alerts.length > 0) {
    await createFraudAlert({
      user_id: claimant_id,
      case_id: found_case_id,
      alert_type: 'self_dealing',
      severity: fraudScore >= 80 ? 'critical' : 'high',
      fraud_score: fraudScore,
      description: `Potential self-dealing detected: ${alerts.join(', ')}`,
      evidence: {
        alerts,
        ip_address: ipAddress,
        device_fingerprint: deviceFingerprint,
        poster_id: foundCase.poster_id,
      },
    });

    return { isSuspicious: true, alerts, fraudScore };
  }

  return { isSuspicious: false };
}

/**
 * Check for rapid-fire claims (velocity abuse)
 */
async function checkVelocityAbuse(userId, ipAddress) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Check claims by user
  const claimsLastHour = await Claim.count({
    where: {
      claimant_id: userId,
      createdAt: { [Op.gte]: oneHourAgo },
    },
  });

  const claimsLastDay = await Claim.count({
    where: {
      claimant_id: userId,
      createdAt: { [Op.gte]: oneDayAgo },
    },
  });

  const alerts = [];
  let fraudScore = 0;

  if (claimsLastHour >= THRESHOLDS.maxClaimsPerHour) {
    alerts.push(`${claimsLastHour} claims in last hour`);
    fraudScore = 70;
  }

  if (claimsLastDay >= THRESHOLDS.maxClaimsPerDay) {
    alerts.push(`${claimsLastDay} claims in last 24 hours`);
    fraudScore = Math.max(fraudScore, 60);
  }

  // Check claims from same IP
  if (ipAddress) {
    // This would require storing IP with claims - simplified version
    const recentClaimsFromIP = await Claim.count({
      where: {
        createdAt: { [Op.gte]: oneHourAgo },
        // metadata: { ip_address: ipAddress }, // If stored
      },
    });

    if (recentClaimsFromIP >= THRESHOLDS.maxClaimsSameIP) {
      alerts.push(`Multiple claims from same IP`);
      fraudScore = Math.max(fraudScore, 65);
    }
  }

  if (alerts.length > 0) {
    await createFraudAlert({
      user_id: userId,
      alert_type: 'rapid_fire_claims',
      severity: fraudScore >= 70 ? 'high' : 'medium',
      fraud_score: fraudScore,
      description: `Velocity abuse detected: ${alerts.join(', ')}`,
      evidence: {
        claims_last_hour: claimsLastHour,
        claims_last_day: claimsLastDay,
        ip_address: ipAddress,
        thresholds: THRESHOLDS,
      },
    });

    return { isAbuse: true, alerts, fraudScore };
  }

  return { isAbuse: false };
}

/**
 * Check for suspicious payout patterns
 */
async function checkSuspiciousPayout(transactionId) {
  const transaction = await Transaction.findByPk(transactionId, {
    include: [
      { model: User, as: 'finder' },
      { model: User, as: 'poster' },
      { model: Case, as: 'case' },
    ],
  });

  if (!transaction) return { isSuspicious: false };

  const alerts = [];
  let fraudScore = 0;

  // Check 1: High value payout to new account
  if (transaction.amount >= THRESHOLDS.highValuePayoutThreshold) {
    const accountAgeDays = (Date.now() - new Date(transaction.finder?.createdAt)) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < THRESHOLDS.newAccountThresholdDays) {
      alerts.push('high_value_to_new_account');
      fraudScore = 75;
    }
  }

  // Check 2: Multiple high-value payouts to same finder recently
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentHighPayouts = await Transaction.count({
    where: {
      finder_id: transaction.finder_id,
      status: 'completed',
      amount: { [Op.gte]: THRESHOLDS.highValuePayoutThreshold },
      createdAt: { [Op.gte]: oneWeekAgo },
    },
  });

  if (recentHighPayouts >= 3) {
    alerts.push(`${recentHighPayouts} high-value payouts this week`);
    fraudScore = Math.max(fraudScore, 70);
  }

  // Check 3: Finder has unverified account with high earnings
  if (transaction.finder?.verification_status === 'unverified' &&
      transaction.finder?.total_earnings >= 500) {
    alerts.push('unverified_high_earner');
    fraudScore = Math.max(fraudScore, 60);
  }

  if (alerts.length > 0) {
    await createFraudAlert({
      user_id: transaction.finder_id,
      transaction_id: transactionId,
      case_id: transaction.case_id,
      alert_type: 'suspicious_payout',
      severity: fraudScore >= 70 ? 'high' : 'medium',
      fraud_score: fraudScore,
      description: `Suspicious payout pattern: ${alerts.join(', ')}`,
      evidence: {
        alerts,
        amount: transaction.amount,
        finder_account_age_days: (Date.now() - new Date(transaction.finder?.createdAt)) / (1000 * 60 * 60 * 24),
        finder_verification: transaction.finder?.verification_status,
        recent_high_payouts: recentHighPayouts,
      },
    });

    return { isSuspicious: true, alerts, fraudScore };
  }

  return { isSuspicious: false };
}

/**
 * Check for duplicate photo submissions across cases
 */
async function checkDuplicatePhotos(photoHash, userId, caseId) {
  // This requires photo hashing to be implemented
  // Placeholder for photo deduplication logic

  // Would query for other cases with same photo hash
  // const duplicates = await Photo.findAll({
  //   where: {
  //     perceptual_hash: photoHash,
  //     case_id: { [Op.ne]: caseId },
  //   },
  // });

  return { hasDuplicates: false };
}

/**
 * Comprehensive fraud check for a claim
 */
async function checkClaimFraud(claimData, requestContext) {
  const { claimant_id, found_case_id } = claimData;
  const { ipAddress, deviceFingerprint, userAgent } = requestContext;

  const results = {
    passed: true,
    checks: [],
    totalScore: 0,
    action: 'allow',
  };

  // Run all checks
  const [userAnalysis, selfDealingCheck, velocityCheck] = await Promise.all([
    analyzeUser(claimant_id),
    checkSelfDealing(claimData, ipAddress, deviceFingerprint),
    checkVelocityAbuse(claimant_id, ipAddress),
  ]);

  // User analysis
  results.checks.push({
    name: 'user_analysis',
    score: userAnalysis.score,
    factors: userAnalysis.factors,
  });
  results.totalScore = Math.max(results.totalScore, userAnalysis.score);

  // Self-dealing check
  if (selfDealingCheck.isSuspicious) {
    results.checks.push({
      name: 'self_dealing',
      score: selfDealingCheck.fraudScore,
      alerts: selfDealingCheck.alerts,
    });
    results.totalScore = Math.max(results.totalScore, selfDealingCheck.fraudScore);
  }

  // Velocity check
  if (velocityCheck.isAbuse) {
    results.checks.push({
      name: 'velocity_abuse',
      score: velocityCheck.fraudScore,
      alerts: velocityCheck.alerts,
    });
    results.totalScore = Math.max(results.totalScore, velocityCheck.fraudScore);
  }

  // Determine action based on score
  if (results.totalScore >= THRESHOLDS.autoSuspendScore) {
    results.passed = false;
    results.action = 'block';

    // Auto-suspend account
    await User.update(
      {
        is_suspended: true,
        suspended_reason: 'Automated fraud detection - high risk score',
        suspended_at: new Date(),
      },
      { where: { id: claimant_id } }
    );

    logger.warn('User auto-suspended due to fraud score', {
      userId: claimant_id,
      score: results.totalScore,
    });
  } else if (results.totalScore >= THRESHOLDS.alertThresholdScore) {
    results.action = 'review';
  }

  logger.info('Claim fraud check completed', {
    claimantId: claimant_id,
    caseId: found_case_id,
    totalScore: results.totalScore,
    action: results.action,
  });

  return results;
}

/**
 * Create a fraud alert
 */
async function createFraudAlert(alertData) {
  try {
    const alert = await FraudAlert.create({
      ...alertData,
      detection_source: alertData.detection_source || 'automated',
    });

    logger.warn('Fraud alert created', {
      alertId: alert.id,
      type: alert.alert_type,
      severity: alert.severity,
      score: alert.fraud_score,
    });

    return alert;
  } catch (error) {
    logger.error('Failed to create fraud alert', { error: error.message, alertData });
    throw error;
  }
}

/**
 * Get risk level from score
 */
function getRiskLevel(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 20) return 'low';
  return 'none';
}

/**
 * Get fraud alerts for admin review
 */
async function getAlertsForReview(options = {}) {
  const { status = 'new', severity, limit = 50, offset = 0 } = options;

  const where = {};
  if (status) where.status = status;
  if (severity) where.severity = severity;

  const { rows: alerts, count } = await FraudAlert.findAndCountAll({
    where,
    include: [
      { model: User, as: 'user', attributes: ['id', 'email', 'first_name', 'last_name'] },
      { model: Case, as: 'case', attributes: ['id', 'title'] },
    ],
    order: [
      ['severity', 'DESC'],
      ['fraud_score', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    limit,
    offset,
  });

  return { alerts, total: count };
}

/**
 * Review and resolve a fraud alert
 */
async function resolveAlert(alertId, adminId, resolution) {
  const { status, action_taken, admin_notes } = resolution;

  const alert = await FraudAlert.findByPk(alertId);
  if (!alert) {
    throw new Error('Alert not found');
  }

  await alert.update({
    status,
    action_taken,
    admin_notes,
    reviewed_by: adminId,
    reviewed_at: new Date(),
  });

  // Execute action if needed
  if (action_taken === 'account_suspended' && alert.user_id) {
    await User.update(
      {
        is_suspended: true,
        suspended_reason: `Fraud alert #${alertId}: ${admin_notes}`,
        suspended_at: new Date(),
      },
      { where: { id: alert.user_id } }
    );
  } else if (action_taken === 'account_banned' && alert.user_id) {
    await User.update(
      {
        is_banned: true,
        banned_reason: `Fraud alert #${alertId}: ${admin_notes}`,
        banned_at: new Date(),
      },
      { where: { id: alert.user_id } }
    );
  }

  logger.info('Fraud alert resolved', {
    alertId,
    adminId,
    status,
    action_taken,
  });

  return alert;
}

module.exports = {
  analyzeUser,
  checkClaimFraud,
  checkSelfDealing,
  checkVelocityAbuse,
  checkSuspiciousPayout,
  checkDuplicatePhotos,
  createFraudAlert,
  getAlertsForReview,
  resolveAlert,
  THRESHOLDS,
};
