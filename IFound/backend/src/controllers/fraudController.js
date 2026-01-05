/**
 * Fraud Controller
 *
 * Handles admin fraud review endpoints.
 */

const { FraudAlert, User, Case, Claim, Transaction } = require('../models');
const fraudDetectionService = require('../services/fraudDetectionService');
const auditService = require('../services/auditService');
const logger = require('../config/logger');
const { Op } = require('sequelize');

/**
 * Get all fraud alerts with filtering
 */
async function getFraudAlerts(req, res) {
  try {
    const {
      status,
      severity,
      alert_type,
      user_id,
      page = 1,
      limit = 20,
      sort_by = 'createdAt',
      sort_order = 'DESC',
    } = req.query;

    const where = {};

    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (alert_type) where.alert_type = alert_type;
    if (user_id) where.user_id = user_id;

    const offset = (page - 1) * limit;

    const { rows: alerts, count: total } = await FraudAlert.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['id', 'email', 'full_name', 'account_status'] },
        { model: Case, as: 'case', attributes: ['id', 'title', 'case_type', 'status'] },
        { model: Claim, as: 'claim', attributes: ['id', 'status'] },
        { model: User, as: 'reviewer', attributes: ['id', 'email', 'full_name'] },
      ],
      order: [[sort_by, sort_order]],
      limit: parseInt(limit),
      offset,
    });

    res.json({
      success: true,
      data: {
        alerts,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logger.error('[FRAUD] Failed to get alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fraud alerts',
    });
  }
}

/**
 * Get single fraud alert with full details
 */
async function getFraudAlert(req, res) {
  try {
    const { id } = req.params;

    const alert = await FraudAlert.findByPk(id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'email', 'full_name', 'phone', 'account_status', 'reputation_score', 'createdAt'] },
        { model: Case, as: 'case', attributes: ['id', 'title', 'case_type', 'status', 'bounty_amount'] },
        { model: Claim, as: 'claim' },
        { model: Transaction, as: 'transaction' },
        { model: User, as: 'reviewer', attributes: ['id', 'email', 'full_name'] },
      ],
    });

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: 'Fraud alert not found',
      });
    }

    // Get user's fraud history
    let userHistory = null;
    if (alert.user_id) {
      userHistory = await FraudAlert.findAll({
        where: {
          user_id: alert.user_id,
          id: { [Op.ne]: id },
        },
        attributes: ['id', 'alert_type', 'severity', 'status', 'fraud_score', 'createdAt'],
        order: [['createdAt', 'DESC']],
        limit: 10,
      });
    }

    res.json({
      success: true,
      data: {
        alert,
        userHistory,
      },
    });
  } catch (error) {
    logger.error('[FRAUD] Failed to get alert:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fraud alert',
    });
  }
}

/**
 * Review a fraud alert
 */
async function reviewFraudAlert(req, res) {
  try {
    const { id } = req.params;
    const { decision, notes, action_to_take } = req.body;
    const adminId = req.user.id;

    const alert = await FraudAlert.findByPk(id);
    if (!alert) {
      return res.status(404).json({
        success: false,
        error: 'Fraud alert not found',
      });
    }

    // Validate decision
    const validDecisions = ['confirmed', 'false_positive', 'escalated'];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid decision. Must be one of: confirmed, false_positive, escalated',
      });
    }

    // Update alert
    await alert.update({
      status: decision,
      reviewed_by: adminId,
      reviewed_at: new Date(),
      admin_notes: notes,
      action_taken: action_to_take || 'none',
    });

    // If confirmed, take action on the user
    if (decision === 'confirmed' && action_to_take && alert.user_id) {
      await handleFraudAction(alert.user_id, action_to_take, adminId, req);
    }

    // Audit log
    await auditService.logFraudAlertReviewed(adminId, id, decision, notes, req);

    logger.info(`[FRAUD] Alert ${id} reviewed by admin ${adminId}: ${decision}`);

    res.json({
      success: true,
      message: `Fraud alert marked as ${decision}`,
      data: { alert },
    });
  } catch (error) {
    logger.error('[FRAUD] Failed to review alert:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to review fraud alert',
    });
  }
}

/**
 * Handle fraud action on user
 */
async function handleFraudAction(userId, action, adminId, req) {
  const user = await User.findByPk(userId);
  if (!user) return;

  switch (action) {
    case 'warning_issued':
      // Could send email warning here
      logger.info(`[FRAUD] Warning issued to user ${userId}`);
      break;

    case 'account_suspended':
      await user.update({ account_status: 'suspended' });
      await auditService.logUserSuspended(adminId, userId, 'Fraud detected', req);
      logger.info(`[FRAUD] User ${userId} suspended for fraud`);
      break;

    case 'account_banned':
      await user.update({ account_status: 'banned' });
      await auditService.logUserBanned(adminId, userId, 'Fraud detected', req);
      logger.info(`[FRAUD] User ${userId} banned for fraud`);
      break;

    case 'transaction_reversed':
      // Would integrate with payment service
      logger.info(`[FRAUD] Transaction reversal requested for user ${userId}`);
      break;

    default:
      break;
  }
}

/**
 * Bulk review fraud alerts
 */
async function bulkReviewAlerts(req, res) {
  try {
    const { alert_ids, decision, notes } = req.body;
    const adminId = req.user.id;

    if (!Array.isArray(alert_ids) || alert_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'alert_ids must be a non-empty array',
      });
    }

    const validDecisions = ['confirmed', 'false_positive', 'escalated', 'resolved'];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid decision',
      });
    }

    const [updatedCount] = await FraudAlert.update(
      {
        status: decision,
        reviewed_by: adminId,
        reviewed_at: new Date(),
        admin_notes: notes,
      },
      {
        where: { id: alert_ids },
      }
    );

    // Audit log for each
    for (const alertId of alert_ids) {
      await auditService.logFraudAlertReviewed(adminId, alertId, decision, notes, req);
    }

    res.json({
      success: true,
      message: `${updatedCount} alerts updated`,
      data: { updatedCount },
    });
  } catch (error) {
    logger.error('[FRAUD] Failed to bulk review alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk review alerts',
    });
  }
}

/**
 * Get fraud statistics
 */
async function getFraudStats(req, res) {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      totalAlerts,
      newAlerts,
      confirmedAlerts,
      falsePositives,
      bySeverity,
      byType,
    ] = await Promise.all([
      FraudAlert.count({ where: { createdAt: { [Op.gte]: startDate } } }),
      FraudAlert.count({ where: { status: 'new', createdAt: { [Op.gte]: startDate } } }),
      FraudAlert.count({ where: { status: 'confirmed', createdAt: { [Op.gte]: startDate } } }),
      FraudAlert.count({ where: { status: 'false_positive', createdAt: { [Op.gte]: startDate } } }),
      FraudAlert.findAll({
        attributes: [
          'severity',
          [require('sequelize').fn('COUNT', '*'), 'count'],
        ],
        where: { createdAt: { [Op.gte]: startDate } },
        group: ['severity'],
        raw: true,
      }),
      FraudAlert.findAll({
        attributes: [
          'alert_type',
          [require('sequelize').fn('COUNT', '*'), 'count'],
        ],
        where: { createdAt: { [Op.gte]: startDate } },
        group: ['alert_type'],
        raw: true,
      }),
    ]);

    // Calculate detection rate (true positives / total reviewed)
    const totalReviewed = confirmedAlerts + falsePositives;
    const detectionAccuracy = totalReviewed > 0
      ? ((confirmedAlerts / totalReviewed) * 100).toFixed(1)
      : 'N/A';

    res.json({
      success: true,
      data: {
        period: `${days} days`,
        totalAlerts,
        newAlerts,
        confirmedAlerts,
        falsePositives,
        detectionAccuracy: `${detectionAccuracy}%`,
        bySeverity: bySeverity.reduce((acc, s) => {
          acc[s.severity] = parseInt(s.count);
          return acc;
        }, {}),
        byType: byType.reduce((acc, t) => {
          acc[t.alert_type] = parseInt(t.count);
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    logger.error('[FRAUD] Failed to get stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fraud statistics',
    });
  }
}

/**
 * Get audit logs for admin
 */
async function getAuditLogs(req, res) {
  try {
    const {
      user_id,
      action_category,
      action,
      risk_level,
      page = 1,
      limit = 50,
    } = req.query;

    const result = await auditService.getUserAuditLogs(
      user_id || null,
      {
        actionCategory: action_category,
        limit: parseInt(limit),
        offset: (page - 1) * parseInt(limit),
      }
    );

    res.json({
      success: true,
      data: {
        logs: result.rows,
        pagination: {
          total: result.count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(result.count / limit),
        },
      },
    });
  } catch (error) {
    logger.error('[AUDIT] Failed to get logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit logs',
    });
  }
}

/**
 * Get security summary for dashboard
 */
async function getSecuritySummary(req, res) {
  try {
    const { hours = 24 } = req.query;
    const summary = await auditService.getSecuritySummary(parseInt(hours));

    // Get pending fraud alerts
    const pendingAlerts = await FraudAlert.count({
      where: { status: 'new' },
    });

    // Get critical alerts
    const criticalAlerts = await FraudAlert.count({
      where: {
        status: 'new',
        severity: 'critical',
      },
    });

    res.json({
      success: true,
      data: {
        ...summary,
        pendingAlerts,
        criticalAlerts,
      },
    });
  } catch (error) {
    logger.error('[SECURITY] Failed to get summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch security summary',
    });
  }
}

/**
 * Manually trigger fraud check on a user
 */
async function checkUserFraud(req, res) {
  try {
    const { user_id } = req.params;
    const adminId = req.user.id;

    const user = await User.findByPk(user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Run fraud analysis
    const analysis = await fraudDetectionService.analyzeUser(user_id);

    // Log admin action
    await auditService.logAdminAction(
      adminId,
      'manual_fraud_check',
      'User',
      user_id,
      { score: analysis.score },
      req
    );

    res.json({
      success: true,
      data: {
        user_id,
        analysis,
      },
    });
  } catch (error) {
    logger.error('[FRAUD] Manual check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run fraud check',
    });
  }
}

module.exports = {
  getFraudAlerts,
  getFraudAlert,
  reviewFraudAlert,
  bulkReviewAlerts,
  getFraudStats,
  getAuditLogs,
  getSecuritySummary,
  checkUserFraud,
};
