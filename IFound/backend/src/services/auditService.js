/**
 * Audit Service
 *
 * Provides comprehensive audit logging for sensitive actions.
 * Logs are immutable and stored in the database for compliance and security monitoring.
 */

const { AuditLog, User } = require('../models');
const logger = require('../config/logger');

/**
 * Extract request context for audit logging
 */
function extractRequestContext(req) {
  if (!req) return {};

  return {
    ip_address: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
    user_agent: req.headers['user-agent'],
    request_method: req.method,
    request_path: req.originalUrl || req.path,
    session_id: req.sessionID || req.headers['x-session-id'],
    device_fingerprint: req.headers['x-device-fingerprint'],
  };
}

/**
 * Create an audit log entry
 */
async function log({
  userId = null,
  actionCategory,
  action,
  entityType = null,
  entityId = null,
  description = null,
  oldValues = null,
  newValues = null,
  success = true,
  errorMessage = null,
  riskLevel = 'none',
  metadata = {},
  req = null,
}) {
  try {
    const requestContext = extractRequestContext(req);

    const auditEntry = await AuditLog.create({
      user_id: userId,
      action_category: actionCategory,
      action,
      entity_type: entityType,
      entity_id: entityId,
      description,
      old_values: oldValues,
      new_values: newValues,
      success,
      error_message: errorMessage,
      risk_level: riskLevel,
      metadata,
      ...requestContext,
    });

    // Also log to file for immediate visibility
    const logLevel = success ? 'info' : 'warn';
    logger[logLevel](`[AUDIT] ${actionCategory}:${action}`, {
      userId,
      entityType,
      entityId,
      success,
      riskLevel,
      ip: requestContext.ip_address,
    });

    return auditEntry;
  } catch (error) {
    // Audit logging should never break the main flow
    logger.error('[AUDIT] Failed to create audit log:', error);
    return null;
  }
}

// ============================================
// Auth Events
// ============================================

async function logLoginSuccess(userId, req) {
  return log({
    userId,
    actionCategory: 'auth',
    action: 'login_success',
    entityType: 'User',
    entityId: userId,
    description: 'User logged in successfully',
    req,
  });
}

async function logLoginFailure(email, reason, req) {
  return log({
    actionCategory: 'auth',
    action: 'login_failure',
    description: `Login failed for ${email}: ${reason}`,
    riskLevel: 'low',
    metadata: { email, reason },
    req,
  });
}

async function logLogout(userId, req) {
  return log({
    userId,
    actionCategory: 'auth',
    action: 'logout',
    entityType: 'User',
    entityId: userId,
    description: 'User logged out',
    req,
  });
}

async function logPasswordChange(userId, req) {
  return log({
    userId,
    actionCategory: 'auth',
    action: 'password_change',
    entityType: 'User',
    entityId: userId,
    description: 'User changed password',
    riskLevel: 'low',
    req,
  });
}

async function logPasswordReset(email, req) {
  return log({
    actionCategory: 'auth',
    action: 'password_reset_request',
    description: `Password reset requested for ${email}`,
    metadata: { email },
    req,
  });
}

// ============================================
// User Events
// ============================================

async function logUserCreated(userId, newUser, req) {
  return log({
    userId,
    actionCategory: 'user',
    action: 'user_created',
    entityType: 'User',
    entityId: newUser.id,
    description: `User account created: ${newUser.email}`,
    newValues: {
      email: newUser.email,
      role: newUser.role,
    },
    req,
  });
}

async function logUserUpdated(userId, targetUserId, oldValues, newValues, req) {
  return log({
    userId,
    actionCategory: 'user',
    action: 'user_updated',
    entityType: 'User',
    entityId: targetUserId,
    description: 'User profile updated',
    oldValues,
    newValues,
    req,
  });
}

async function logUserSuspended(adminId, targetUserId, reason, req) {
  return log({
    userId: adminId,
    actionCategory: 'admin',
    action: 'user_suspended',
    entityType: 'User',
    entityId: targetUserId,
    description: `User suspended: ${reason}`,
    riskLevel: 'medium',
    metadata: { reason },
    req,
  });
}

async function logUserBanned(adminId, targetUserId, reason, req) {
  return log({
    userId: adminId,
    actionCategory: 'admin',
    action: 'user_banned',
    entityType: 'User',
    entityId: targetUserId,
    description: `User banned: ${reason}`,
    riskLevel: 'high',
    metadata: { reason },
    req,
  });
}

// ============================================
// Case Events
// ============================================

async function logCaseCreated(userId, caseData, req) {
  return log({
    userId,
    actionCategory: 'case',
    action: 'case_created',
    entityType: 'Case',
    entityId: caseData.id,
    description: `Case created: ${caseData.title}`,
    newValues: {
      title: caseData.title,
      case_type: caseData.case_type,
      bounty_amount: caseData.bounty_amount,
      category: caseData.category,
    },
    req,
  });
}

async function logCaseUpdated(userId, caseId, oldValues, newValues, req) {
  return log({
    userId,
    actionCategory: 'case',
    action: 'case_updated',
    entityType: 'Case',
    entityId: caseId,
    description: 'Case updated',
    oldValues,
    newValues,
    req,
  });
}

async function logCaseDeleted(userId, caseId, caseTitle, req) {
  return log({
    userId,
    actionCategory: 'case',
    action: 'case_deleted',
    entityType: 'Case',
    entityId: caseId,
    description: `Case deleted: ${caseTitle}`,
    riskLevel: 'low',
    req,
  });
}

async function logCaseResolved(userId, caseId, resolution, req) {
  return log({
    userId,
    actionCategory: 'case',
    action: 'case_resolved',
    entityType: 'Case',
    entityId: caseId,
    description: `Case resolved: ${resolution}`,
    metadata: { resolution },
    req,
  });
}

// ============================================
// Claim Events
// ============================================

async function logClaimCreated(userId, claimData, req) {
  return log({
    userId,
    actionCategory: 'claim',
    action: 'claim_created',
    entityType: 'Claim',
    entityId: claimData.id,
    description: 'Claim submitted',
    newValues: {
      found_case_id: claimData.found_case_id,
      lost_case_id: claimData.lost_case_id,
    },
    req,
  });
}

async function logClaimApproved(userId, claimId, req) {
  return log({
    userId,
    actionCategory: 'claim',
    action: 'claim_approved',
    entityType: 'Claim',
    entityId: claimId,
    description: 'Claim approved by owner',
    req,
  });
}

async function logClaimRejected(userId, claimId, reason, req) {
  return log({
    userId,
    actionCategory: 'claim',
    action: 'claim_rejected',
    entityType: 'Claim',
    entityId: claimId,
    description: `Claim rejected: ${reason}`,
    metadata: { reason },
    req,
  });
}

async function logClaimDisputed(userId, claimId, reason, req) {
  return log({
    userId,
    actionCategory: 'claim',
    action: 'claim_disputed',
    entityType: 'Claim',
    entityId: claimId,
    description: `Claim disputed: ${reason}`,
    riskLevel: 'medium',
    metadata: { reason },
    req,
  });
}

// ============================================
// Payment Events
// ============================================

async function logPaymentInitiated(userId, transactionData, req) {
  return log({
    userId,
    actionCategory: 'payment',
    action: 'payment_initiated',
    entityType: 'Transaction',
    entityId: transactionData.id,
    description: `Payment initiated: $${transactionData.amount}`,
    newValues: {
      amount: transactionData.amount,
      type: transactionData.type,
      case_id: transactionData.case_id,
    },
    req,
  });
}

async function logPaymentCompleted(userId, transactionId, amount, req) {
  return log({
    userId,
    actionCategory: 'payment',
    action: 'payment_completed',
    entityType: 'Transaction',
    entityId: transactionId,
    description: `Payment completed: $${amount}`,
    metadata: { amount },
    req,
  });
}

async function logPaymentFailed(userId, transactionId, error, req) {
  return log({
    userId,
    actionCategory: 'payment',
    action: 'payment_failed',
    entityType: 'Transaction',
    entityId: transactionId,
    description: `Payment failed: ${error}`,
    success: false,
    errorMessage: error,
    riskLevel: 'low',
    req,
  });
}

async function logBountyReleased(userId, transactionId, amount, finderId, req) {
  return log({
    userId,
    actionCategory: 'payment',
    action: 'bounty_released',
    entityType: 'Transaction',
    entityId: transactionId,
    description: `Bounty released: $${amount} to finder`,
    metadata: { amount, finderId },
    req,
  });
}

async function logRefundProcessed(userId, transactionId, amount, reason, req) {
  return log({
    userId,
    actionCategory: 'payment',
    action: 'refund_processed',
    entityType: 'Transaction',
    entityId: transactionId,
    description: `Refund processed: $${amount} - ${reason}`,
    metadata: { amount, reason },
    req,
  });
}

// ============================================
// Verification Events
// ============================================

async function logVerificationStarted(userId, verificationType, req) {
  return log({
    userId,
    actionCategory: 'verification',
    action: 'verification_started',
    entityType: 'User',
    entityId: userId,
    description: `${verificationType} verification started`,
    metadata: { verificationType },
    req,
  });
}

async function logVerificationCompleted(userId, verificationType, status, req) {
  return log({
    userId,
    actionCategory: 'verification',
    action: 'verification_completed',
    entityType: 'User',
    entityId: userId,
    description: `${verificationType} verification ${status}`,
    metadata: { verificationType, status },
    req,
  });
}

async function logVerificationFailed(userId, verificationType, reason, req) {
  return log({
    userId,
    actionCategory: 'verification',
    action: 'verification_failed',
    entityType: 'User',
    entityId: userId,
    description: `${verificationType} verification failed: ${reason}`,
    success: false,
    errorMessage: reason,
    riskLevel: 'medium',
    metadata: { verificationType, reason },
    req,
  });
}

// ============================================
// Security Events
// ============================================

async function logSuspiciousActivity(userId, activityType, details, req) {
  return log({
    userId,
    actionCategory: 'security',
    action: 'suspicious_activity',
    description: `Suspicious activity detected: ${activityType}`,
    riskLevel: 'high',
    metadata: { activityType, details },
    req,
  });
}

async function logFraudDetected(userId, fraudType, fraudScore, alertId, req) {
  return log({
    userId,
    actionCategory: 'security',
    action: 'fraud_detected',
    entityType: 'FraudAlert',
    entityId: alertId,
    description: `Fraud detected: ${fraudType} (score: ${fraudScore})`,
    riskLevel: fraudScore >= 80 ? 'critical' : fraudScore >= 60 ? 'high' : 'medium',
    metadata: { fraudType, fraudScore },
    req,
  });
}

async function logAccountLocked(userId, reason, req) {
  return log({
    userId,
    actionCategory: 'security',
    action: 'account_locked',
    entityType: 'User',
    entityId: userId,
    description: `Account locked: ${reason}`,
    riskLevel: 'high',
    metadata: { reason },
    req,
  });
}

async function logRateLimitExceeded(userId, endpoint, limit, req) {
  return log({
    userId,
    actionCategory: 'security',
    action: 'rate_limit_exceeded',
    description: `Rate limit exceeded on ${endpoint}`,
    riskLevel: 'low',
    metadata: { endpoint, limit },
    req,
  });
}

// ============================================
// Admin Events
// ============================================

async function logAdminAction(adminId, action, entityType, entityId, details, req) {
  return log({
    userId: adminId,
    actionCategory: 'admin',
    action,
    entityType,
    entityId,
    description: `Admin action: ${action}`,
    riskLevel: 'medium',
    metadata: details,
    req,
  });
}

async function logFraudAlertReviewed(adminId, alertId, decision, notes, req) {
  return log({
    userId: adminId,
    actionCategory: 'admin',
    action: 'fraud_alert_reviewed',
    entityType: 'FraudAlert',
    entityId: alertId,
    description: `Fraud alert reviewed: ${decision}`,
    metadata: { decision, notes },
    req,
  });
}

// ============================================
// System Events
// ============================================

async function logSystemEvent(eventType, description, metadata = {}) {
  return log({
    actionCategory: 'system',
    action: eventType,
    description,
    metadata,
  });
}

// ============================================
// Query Functions
// ============================================

/**
 * Get audit logs for a specific user
 */
async function getUserAuditLogs(userId, options = {}) {
  const { limit = 100, offset = 0, actionCategory, startDate, endDate } = options;

  const where = { user_id: userId };

  if (actionCategory) {
    where.action_category = actionCategory;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.$gte = startDate;
    if (endDate) where.createdAt.$lte = endDate;
  }

  return AuditLog.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
}

/**
 * Get audit logs for a specific entity
 */
async function getEntityAuditLogs(entityType, entityId, options = {}) {
  const { limit = 100, offset = 0 } = options;

  return AuditLog.findAndCountAll({
    where: { entity_type: entityType, entity_id: entityId },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    include: [
      { model: User, as: 'user', attributes: ['id', 'email', 'first_name', 'last_name'] },
    ],
  });
}

/**
 * Get high-risk audit events
 */
async function getHighRiskEvents(options = {}) {
  const { limit = 100, offset = 0, startDate } = options;

  const where = {
    risk_level: ['high', 'critical'],
  };

  if (startDate) {
    where.createdAt = { $gte: startDate };
  }

  return AuditLog.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    include: [
      { model: User, as: 'user', attributes: ['id', 'email', 'first_name', 'last_name'] },
    ],
  });
}

/**
 * Get security events for dashboard
 */
async function getSecuritySummary(hoursBack = 24) {
  const startDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const [totalEvents, failedLogins, fraudAlerts, highRiskEvents] = await Promise.all([
    AuditLog.count({ where: { createdAt: { $gte: startDate } } }),
    AuditLog.count({
      where: {
        action: 'login_failure',
        createdAt: { $gte: startDate },
      },
    }),
    AuditLog.count({
      where: {
        action: 'fraud_detected',
        createdAt: { $gte: startDate },
      },
    }),
    AuditLog.count({
      where: {
        risk_level: ['high', 'critical'],
        createdAt: { $gte: startDate },
      },
    }),
  ]);

  return {
    totalEvents,
    failedLogins,
    fraudAlerts,
    highRiskEvents,
    period: `${hoursBack} hours`,
  };
}

module.exports = {
  // Core logging
  log,
  extractRequestContext,

  // Auth events
  logLoginSuccess,
  logLoginFailure,
  logLogout,
  logPasswordChange,
  logPasswordReset,

  // User events
  logUserCreated,
  logUserUpdated,
  logUserSuspended,
  logUserBanned,

  // Case events
  logCaseCreated,
  logCaseUpdated,
  logCaseDeleted,
  logCaseResolved,

  // Claim events
  logClaimCreated,
  logClaimApproved,
  logClaimRejected,
  logClaimDisputed,

  // Payment events
  logPaymentInitiated,
  logPaymentCompleted,
  logPaymentFailed,
  logBountyReleased,
  logRefundProcessed,

  // Verification events
  logVerificationStarted,
  logVerificationCompleted,
  logVerificationFailed,

  // Security events
  logSuspiciousActivity,
  logFraudDetected,
  logAccountLocked,
  logRateLimitExceeded,

  // Admin events
  logAdminAction,
  logFraudAlertReviewed,

  // System events
  logSystemEvent,

  // Query functions
  getUserAuditLogs,
  getEntityAuditLogs,
  getHighRiskEvents,
  getSecuritySummary,
};
