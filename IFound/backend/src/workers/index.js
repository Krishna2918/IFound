/**
 * Background Workers
 *
 * Initializes and manages all background jobs for the application.
 */

const geofenceJob = require('../jobs/geofenceAlertJob');
const escrowJob = require('../jobs/escrowJob');
const logger = require('../config/logger');

let isRunning = false;

/**
 * Start all background workers
 */
function startWorkers() {
  if (isRunning) {
    logger.warn('[WORKERS] Background workers are already running');
    return;
  }

  logger.info('[WORKERS] Starting background workers...');

  try {
    // Start geofence job
    geofenceJob.startJobs();
    logger.info('[WORKERS] Geofence alert job started');

    // Start escrow job
    escrowJob.startJobs();
    logger.info('[WORKERS] Escrow processing job started');

    isRunning = true;
    logger.info('[WORKERS] All background workers started successfully');
  } catch (error) {
    logger.error('[WORKERS] Failed to start background workers:', error);
    throw error;
  }
}

/**
 * Stop all background workers
 */
function stopWorkers() {
  if (!isRunning) {
    logger.warn('[WORKERS] Background workers are not running');
    return;
  }

  logger.info('[WORKERS] Stopping background workers...');

  try {
    geofenceJob.stopJobs();
    escrowJob.stopJobs();

    isRunning = false;
    logger.info('[WORKERS] All background workers stopped');
  } catch (error) {
    logger.error('[WORKERS] Error stopping background workers:', error);
    throw error;
  }
}

/**
 * Get status of all workers
 */
function getWorkersStatus() {
  return {
    isRunning,
    jobs: {
      geofence: geofenceJob.getJobStatus(),
      escrow: escrowJob.getJobStatus(),
    },
  };
}

/**
 * Run a specific job manually
 */
async function runJob(category, jobName) {
  switch (category) {
    case 'geofence':
      return geofenceJob.runJob(jobName);
    case 'escrow':
      return escrowJob.runJob(jobName);
    default:
      throw new Error(`Unknown job category: ${category}`);
  }
}

module.exports = {
  startWorkers,
  stopWorkers,
  getWorkersStatus,
  runJob,
};
