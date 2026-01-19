/**
 * Escrow Processing Job
 *
 * Background job for processing escrow-related tasks:
 * - Auto-refund expired case escrows
 * - Send warnings before escrow expiry
 * - Clean up stale pending transactions
 */

const escrowService = require('../services/escrowService');
const notificationService = require('../services/notificationService');
const { Transaction, Case, User } = require('../models');
const logger = require('../config/logger');
const businessRules = require('../config/businessRules');
const { Op } = require('sequelize');

// Job configuration
const CONFIG = {
  // How often to check for expired escrows (in ms)
  expiryCheckInterval: 60 * 60 * 1000, // 1 hour

  // Days before escrow expiry to send warning
  expiryWarningDays: [3, 1],

  // How often to clean up stale pending transactions (in ms)
  cleanupInterval: 24 * 60 * 60 * 1000, // 24 hours

  // Consider pending transactions stale after this many hours
  stalePendingHours: 48,
};

let expiryCheckIntervalId = null;
let warningIntervalId = null;
let cleanupIntervalId = null;

/**
 * Process expired escrows and refund them
 */
async function processExpiredEscrows() {
  try {
    logger.info('[ESCROW JOB] Starting expired escrow processing');

    const result = await escrowService.processExpiredEscrows();

    if (result.processed > 0) {
      logger.info(`[ESCROW JOB] Processed ${result.processed} expired escrows`);
    }

    if (result.errors?.length > 0) {
      logger.error(`[ESCROW JOB] ${result.errors.length} escrow processing errors`, {
        errors: result.errors,
      });
    }

    return result;
  } catch (error) {
    logger.error('[ESCROW JOB] Expired escrow processing failed:', error);
    throw error;
  }
}

/**
 * Check for upcoming escrow expiries and notify users
 */
async function checkUpcomingExpiries() {
  try {
    logger.info('[ESCROW JOB] Checking for upcoming escrow expiries');

    let notificationsSent = 0;

    for (const daysUntilExpiry of CONFIG.expiryWarningDays) {
      // Calculate the target date range
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + daysUntilExpiry);
      targetDate.setHours(0, 0, 0, 0);

      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);

      // Find cases expiring on this date that have active escrows
      const expiringCases = await Case.findAll({
        where: {
          status: 'active',
          bounty_status: 'held',
          expires_at: {
            [Op.gte]: targetDate,
            [Op.lt]: nextDay,
          },
        },
        include: [
          {
            model: User,
            as: 'poster',
            attributes: ['id', 'email', 'first_name'],
          },
        ],
      });

      for (const caseData of expiringCases) {
        try {
          // Get escrow transaction for this case
          const transaction = await Transaction.findOne({
            where: {
              case_id: caseData.id,
              transaction_type: 'bounty_payment',
              status: 'escrow',
            },
          });

          if (transaction) {
            await notificationService.sendNotification({
              userId: caseData.poster_id,
              type: 'escrow_expiry_warning',
              title: 'Bounty Escrow Expiring Soon',
              message: `Your bounty of $${transaction.amount} for "${caseData.title}" will expire in ${daysUntilExpiry} day(s). If no valid claim is accepted, it will be automatically refunded.`,
              data: {
                caseId: caseData.id,
                transactionId: transaction.id,
                expiresAt: caseData.expires_at,
                amount: transaction.amount,
              },
            });
            notificationsSent++;
          }
        } catch (error) {
          logger.error(`[ESCROW JOB] Failed to notify for case ${caseData.id}:`, error);
        }
      }
    }

    logger.info(`[ESCROW JOB] Sent ${notificationsSent} escrow expiry warnings`);

    return { notificationsSent };
  } catch (error) {
    logger.error('[ESCROW JOB] Upcoming expiry check failed:', error);
    throw error;
  }
}

/**
 * Clean up stale pending transactions
 * (Transactions that have been pending for too long without completion)
 */
async function cleanupStalePending() {
  try {
    logger.info('[ESCROW JOB] Cleaning up stale pending transactions');

    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - CONFIG.stalePendingHours);

    // Find stale pending transactions
    const staleTransactions = await Transaction.findAll({
      where: {
        status: 'pending',
        transaction_type: 'bounty_payment',
        createdAt: {
          [Op.lt]: cutoffDate,
        },
      },
    });

    let cancelled = 0;

    for (const transaction of staleTransactions) {
      try {
        await transaction.update({
          status: 'cancelled',
          metadata: {
            ...transaction.metadata,
            cancelled_at: new Date().toISOString(),
            cancelled_reason: 'Stale pending transaction - auto-cancelled',
          },
        });
        cancelled++;

        logger.info(`[ESCROW JOB] Cancelled stale transaction ${transaction.id}`);
      } catch (error) {
        logger.error(`[ESCROW JOB] Failed to cancel transaction ${transaction.id}:`, error);
      }
    }

    logger.info(`[ESCROW JOB] Cancelled ${cancelled} stale pending transactions`);

    return { found: staleTransactions.length, cancelled };
  } catch (error) {
    logger.error('[ESCROW JOB] Stale pending cleanup failed:', error);
    throw error;
  }
}

/**
 * Start all escrow background jobs
 */
function startJobs() {
  logger.info('[ESCROW JOB] Starting escrow background jobs');

  // Check for expired escrows
  expiryCheckIntervalId = setInterval(processExpiredEscrows, CONFIG.expiryCheckInterval);

  // Check for upcoming expiries (send warnings)
  warningIntervalId = setInterval(checkUpcomingExpiries, CONFIG.expiryCheckInterval);

  // Cleanup stale pending transactions
  cleanupIntervalId = setInterval(cleanupStalePending, CONFIG.cleanupInterval);

  // Run initial check after startup
  setTimeout(processExpiredEscrows, 60000); // 1 minute after startup

  logger.info('[ESCROW JOB] Escrow background jobs started');
}

/**
 * Stop all escrow background jobs
 */
function stopJobs() {
  logger.info('[ESCROW JOB] Stopping escrow background jobs');

  if (expiryCheckIntervalId) {
    clearInterval(expiryCheckIntervalId);
    expiryCheckIntervalId = null;
  }

  if (warningIntervalId) {
    clearInterval(warningIntervalId);
    warningIntervalId = null;
  }

  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }

  logger.info('[ESCROW JOB] Escrow background jobs stopped');
}

/**
 * Get job status
 */
function getJobStatus() {
  return {
    expiryChecker: expiryCheckIntervalId !== null,
    warningChecker: warningIntervalId !== null,
    stalePendingCleanup: cleanupIntervalId !== null,
    config: CONFIG,
    businessRules: {
      autoRefundOnExpiry: businessRules.escrow.autoRefundOnExpiry,
      holdDuration: businessRules.escrow.holdDuration,
      disputeWindow: businessRules.escrow.disputeWindow,
    },
  };
}

/**
 * Run a specific job manually
 */
async function runJob(jobName) {
  switch (jobName) {
    case 'expired':
      return processExpiredEscrows();
    case 'warnings':
      return checkUpcomingExpiries();
    case 'cleanup':
      return cleanupStalePending();
    default:
      throw new Error(`Unknown job: ${jobName}`);
  }
}

module.exports = {
  startJobs,
  stopJobs,
  getJobStatus,
  runJob,
  processExpiredEscrows,
  checkUpcomingExpiries,
  cleanupStalePending,
  CONFIG,
};
