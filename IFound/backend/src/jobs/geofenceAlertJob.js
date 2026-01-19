/**
 * Geofence Alert Job
 *
 * Background job for processing location-based alerts.
 * Runs periodically to check device locations against active cases.
 */

const geofenceService = require('../services/geofenceService');
const notificationService = require('../services/notificationService');
const { Case, User, DeviceToken, NotificationPreference } = require('../models');
const logger = require('../config/logger');
const { Op } = require('sequelize');

// Job configuration
const CONFIG = {
  // How often to run the batch processor (in ms)
  batchInterval: 5 * 60 * 1000, // 5 minutes

  // How often to check for expiring cases (in ms)
  expiringCasesInterval: 60 * 60 * 1000, // 1 hour

  // Days before expiry to send warning
  expiryWarningDays: [7, 3, 1],

  // How often to clean up old notifications (in ms)
  cleanupInterval: 24 * 60 * 60 * 1000, // 24 hours

  // Keep notifications for this many days
  notificationRetentionDays: 30,
};

let batchIntervalId = null;
let expiringCasesIntervalId = null;
let cleanupIntervalId = null;

/**
 * Process batch location updates
 */
async function processBatchLocations() {
  try {
    logger.info('[GEOFENCE JOB] Starting batch location processing');

    const result = await geofenceService.processBatchLocationUpdates();

    logger.info('[GEOFENCE JOB] Batch processing complete', result);

    return result;
  } catch (error) {
    logger.error('[GEOFENCE JOB] Batch processing failed:', error);
    throw error;
  }
}

/**
 * Check for expiring cases and notify owners
 */
async function checkExpiringCases() {
  try {
    logger.info('[GEOFENCE JOB] Checking for expiring cases');

    let notificationsSent = 0;

    for (const daysUntilExpiry of CONFIG.expiryWarningDays) {
      // Calculate the target date
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + daysUntilExpiry);
      targetDate.setHours(0, 0, 0, 0);

      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);

      // Find cases expiring on this date
      const expiringCases = await Case.findAll({
        where: {
          status: 'active',
          expires_at: {
            [Op.gte]: targetDate,
            [Op.lt]: nextDay,
          },
        },
        include: [
          {
            model: User,
            as: 'poster',
            attributes: ['id', 'email', 'first_name', 'last_name'],
          },
        ],
      });

      for (const caseData of expiringCases) {
        try {
          await notificationService.notifyCaseExpiring(
            caseData.poster_id,
            caseData,
            daysUntilExpiry
          );
          notificationsSent++;
        } catch (error) {
          logger.error(`[GEOFENCE JOB] Failed to notify for case ${caseData.id}:`, error);
        }
      }
    }

    logger.info(`[GEOFENCE JOB] Sent ${notificationsSent} expiry notifications`);

    return { notificationsSent };
  } catch (error) {
    logger.error('[GEOFENCE JOB] Expiring cases check failed:', error);
    throw error;
  }
}

/**
 * Cleanup old notifications
 */
async function cleanupOldNotifications() {
  try {
    logger.info('[GEOFENCE JOB] Cleaning up old notifications');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CONFIG.notificationRetentionDays);

    const { Notification } = require('../models');

    const result = await Notification.destroy({
      where: {
        createdAt: {
          [Op.lt]: cutoffDate,
        },
        is_read: true, // Only delete read notifications
      },
    });

    logger.info(`[GEOFENCE JOB] Deleted ${result} old notifications`);

    return { deleted: result };
  } catch (error) {
    logger.error('[GEOFENCE JOB] Cleanup failed:', error);
    throw error;
  }
}

/**
 * Alert nearby users when a new case is created
 * Call this from the case creation endpoint
 */
async function onCaseCreated(caseId) {
  try {
    return await geofenceService.alertNearbyUsersForNewCase(caseId);
  } catch (error) {
    logger.error(`[GEOFENCE JOB] onCaseCreated failed for case ${caseId}:`, error);
    return { error: error.message };
  }
}

/**
 * Start all background jobs
 */
function startJobs() {
  logger.info('[GEOFENCE JOB] Starting background jobs');

  // Process batch locations
  batchIntervalId = setInterval(processBatchLocations, CONFIG.batchInterval);

  // Check expiring cases
  expiringCasesIntervalId = setInterval(checkExpiringCases, CONFIG.expiringCasesInterval);

  // Cleanup old notifications
  cleanupIntervalId = setInterval(cleanupOldNotifications, CONFIG.cleanupInterval);

  // Run initial batch after startup
  setTimeout(processBatchLocations, 30000); // 30 seconds after startup

  logger.info('[GEOFENCE JOB] Background jobs started');
}

/**
 * Stop all background jobs
 */
function stopJobs() {
  logger.info('[GEOFENCE JOB] Stopping background jobs');

  if (batchIntervalId) {
    clearInterval(batchIntervalId);
    batchIntervalId = null;
  }

  if (expiringCasesIntervalId) {
    clearInterval(expiringCasesIntervalId);
    expiringCasesIntervalId = null;
  }

  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }

  logger.info('[GEOFENCE JOB] Background jobs stopped');
}

/**
 * Get job status
 */
function getJobStatus() {
  return {
    batchProcessor: batchIntervalId !== null,
    expiringCasesChecker: expiringCasesIntervalId !== null,
    notificationCleanup: cleanupIntervalId !== null,
    config: CONFIG,
  };
}

/**
 * Run a specific job manually
 */
async function runJob(jobName) {
  switch (jobName) {
    case 'batch':
      return processBatchLocations();
    case 'expiring':
      return checkExpiringCases();
    case 'cleanup':
      return cleanupOldNotifications();
    default:
      throw new Error(`Unknown job: ${jobName}`);
  }
}

module.exports = {
  startJobs,
  stopJobs,
  getJobStatus,
  runJob,
  onCaseCreated,
  processBatchLocations,
  checkExpiringCases,
  cleanupOldNotifications,
  CONFIG,
};
