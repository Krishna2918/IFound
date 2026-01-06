const { User, Case, Submission, Transaction, PhotoMatch, FraudAlert, AuditLog, sequelize } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const os = require('os');

// @desc    Get comprehensive system health status
// @route   GET /api/v1/admin/health
// @access  Private (admin only)
const getSystemHealth = asyncHandler(async (req, res) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
  };

  // Database health check
  try {
    await sequelize.authenticate();
    const [dbResult] = await sequelize.query('SELECT NOW() as time, version() as version');
    healthData.database = {
      status: 'connected',
      responseTime: Date.now(),
      version: dbResult[0]?.version?.split(' ')[0] || 'PostgreSQL',
      serverTime: dbResult[0]?.time,
    };
  } catch (error) {
    healthData.database = {
      status: 'error',
      error: error.message,
    };
    healthData.status = 'degraded';
  }

  // Model counts
  try {
    const [
      userCount,
      caseCount,
      submissionCount,
      transactionCount,
      matchCount,
      fraudAlertCount,
      auditLogCount,
    ] = await Promise.all([
      User.count(),
      Case.count(),
      Submission.count(),
      Transaction.count(),
      PhotoMatch.count(),
      FraudAlert.count().catch(() => 0),
      AuditLog.count().catch(() => 0),
    ]);

    healthData.models = {
      users: userCount,
      cases: caseCount,
      submissions: submissionCount,
      transactions: transactionCount,
      matches: matchCount,
      fraudAlerts: fraudAlertCount,
      auditLogs: auditLogCount,
    };
  } catch (error) {
    healthData.models = { error: error.message };
  }

  // Active cases and pending items
  try {
    const [
      activeCases,
      pendingSubmissions,
      pendingTransactions,
      unreviewedAlerts,
    ] = await Promise.all([
      Case.count({ where: { status: 'active' } }),
      Submission.count({ where: { verification_status: 'pending' } }),
      Transaction.count({ where: { status: 'pending' } }),
      FraudAlert.count({ where: { status: 'pending' } }).catch(() => 0),
    ]);

    healthData.pending = {
      activeCases,
      pendingSubmissions,
      pendingTransactions,
      unreviewedAlerts,
    };
  } catch (error) {
    healthData.pending = { error: error.message };
  }

  // System resources
  const memoryUsage = process.memoryUsage();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();

  healthData.system = {
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    cpus: os.cpus().length,
    loadAverage: os.loadavg(),
    memory: {
      total: formatBytes(totalMemory),
      free: formatBytes(freeMemory),
      used: formatBytes(totalMemory - freeMemory),
      usagePercent: Math.round(((totalMemory - freeMemory) / totalMemory) * 100),
    },
    process: {
      heapTotal: formatBytes(memoryUsage.heapTotal),
      heapUsed: formatBytes(memoryUsage.heapUsed),
      rss: formatBytes(memoryUsage.rss),
      external: formatBytes(memoryUsage.external),
    },
    uptime: {
      system: formatUptime(os.uptime()),
      process: formatUptime(process.uptime()),
    },
  };

  // Environment info
  healthData.environment = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    hasStripe: !!process.env.STRIPE_SECRET_KEY,
    hasTwilio: !!process.env.TWILIO_ACCOUNT_SID,
    hasFirebase: !!process.env.FIREBASE_PROJECT_ID,
    hasRedis: !!process.env.REDIS_URL,
  };

  // Recent activity (last 24 hours)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    const [
      newUsers,
      newCases,
      newSubmissions,
      completedTransactions,
    ] = await Promise.all([
      User.count({ where: { created_at: { [require('sequelize').Op.gte]: oneDayAgo } } }),
      Case.count({ where: { created_at: { [require('sequelize').Op.gte]: oneDayAgo } } }),
      Submission.count({ where: { created_at: { [require('sequelize').Op.gte]: oneDayAgo } } }),
      Transaction.count({
        where: {
          status: 'completed',
          updated_at: { [require('sequelize').Op.gte]: oneDayAgo },
        },
      }),
    ]);

    healthData.last24Hours = {
      newUsers,
      newCases,
      newSubmissions,
      completedTransactions,
    };
  } catch (error) {
    healthData.last24Hours = { error: error.message };
  }

  res.status(healthData.status === 'healthy' ? 200 : 503).json({
    success: true,
    data: healthData,
  });
});

// @desc    Get simple health check for load balancers
// @route   GET /api/v1/admin/health/ping
// @access  Private (admin only)
const healthPing = asyncHandler(async (req, res) => {
  try {
    await sequelize.authenticate();
    res.status(200).json({ status: 'ok', timestamp: Date.now() });
  } catch (error) {
    res.status(503).json({ status: 'error', error: 'Database connection failed' });
  }
});

// @desc    Get database connection pool status
// @route   GET /api/v1/admin/health/database
// @access  Private (admin only)
const getDatabaseHealth = asyncHandler(async (req, res) => {
  try {
    await sequelize.authenticate();

    // Get connection pool info
    const pool = sequelize.connectionManager.pool;

    res.status(200).json({
      success: true,
      data: {
        status: 'connected',
        dialect: sequelize.getDialect(),
        database: sequelize.config.database,
        host: sequelize.config.host,
        pool: pool ? {
          size: pool.size,
          available: pool.available,
          pending: pool.pending,
          max: pool.max,
          min: pool.min,
        } : 'Pool info unavailable',
      },
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: error.message,
    });
  }
});

// Helper functions
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

module.exports = {
  getSystemHealth,
  healthPing,
  getDatabaseHealth,
};
