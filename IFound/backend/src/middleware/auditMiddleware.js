/**
 * Audit Middleware
 *
 * Automatically logs sensitive route actions.
 * Wraps routes to capture request/response data for audit trail.
 */

const auditService = require('../services/auditService');
const logger = require('../config/logger');

/**
 * Create audit middleware for a specific action
 *
 * @param {Object} options
 * @param {string} options.actionCategory - Category of action (auth, user, case, claim, payment, etc.)
 * @param {string} options.action - Specific action name
 * @param {string} options.entityType - Type of entity being acted upon
 * @param {Function} options.getEntityId - Function to extract entity ID from request
 * @param {Function} options.getDescription - Function to generate description from request
 * @param {string} options.riskLevel - Risk level of this action
 */
function createAuditMiddleware(options) {
  const {
    actionCategory,
    action,
    entityType = null,
    getEntityId = null,
    getDescription = null,
    riskLevel = 'none',
  } = options;

  return async (req, res, next) => {
    const startTime = Date.now();

    // Store original json method to intercept response
    const originalJson = res.json.bind(res);

    res.json = function (data) {
      const duration = Date.now() - startTime;
      const success = res.statusCode >= 200 && res.statusCode < 400;

      // Log the action asynchronously (don't block response)
      setImmediate(async () => {
        try {
          await auditService.log({
            userId: req.user?.id || null,
            actionCategory,
            action,
            entityType,
            entityId: getEntityId ? getEntityId(req, data) : req.params.id,
            description: getDescription ? getDescription(req, data) : null,
            success,
            errorMessage: success ? null : data?.message || data?.error,
            riskLevel,
            metadata: {
              duration_ms: duration,
              response_status: res.statusCode,
            },
            req,
          });
        } catch (error) {
          logger.error('[AUDIT MIDDLEWARE] Failed to log action:', error);
        }
      });

      return originalJson(data);
    };

    next();
  };
}

/**
 * Audit middleware for payment routes
 */
const auditPayment = (action, getDescription) =>
  createAuditMiddleware({
    actionCategory: 'payment',
    action,
    entityType: 'Transaction',
    getDescription,
    riskLevel: 'low',
  });

/**
 * Audit middleware for case routes
 */
const auditCase = (action, getDescription) =>
  createAuditMiddleware({
    actionCategory: 'case',
    action,
    entityType: 'Case',
    getDescription,
    riskLevel: 'none',
  });

/**
 * Audit middleware for claim routes
 */
const auditClaim = (action, getDescription) =>
  createAuditMiddleware({
    actionCategory: 'claim',
    action,
    entityType: 'Claim',
    getDescription,
    riskLevel: 'none',
  });

/**
 * Audit middleware for user routes
 */
const auditUser = (action, riskLevel = 'none') =>
  createAuditMiddleware({
    actionCategory: 'user',
    action,
    entityType: 'User',
    riskLevel,
  });

/**
 * Audit middleware for admin routes
 */
const auditAdmin = (action, entityType, riskLevel = 'medium') =>
  createAuditMiddleware({
    actionCategory: 'admin',
    action,
    entityType,
    riskLevel,
  });

/**
 * Pre-configured audit middleware for common routes
 */
const auditMiddlewares = {
  // Case operations
  caseCreate: auditCase('case_created', (req) => `Creating case: ${req.body.title}`),
  caseUpdate: auditCase('case_updated', (req) => `Updating case ${req.params.id}`),
  caseDelete: auditCase('case_deleted', (req) => `Deleting case ${req.params.id}`),

  // Claim operations
  claimCreate: auditClaim('claim_created', (req) => `Submitting claim for case ${req.body.found_case_id}`),
  claimApprove: auditClaim('claim_approved', (req) => `Approving claim ${req.params.id}`),
  claimReject: auditClaim('claim_rejected', (req) => `Rejecting claim ${req.params.id}`),

  // Payment operations
  paymentCreate: auditPayment('payment_initiated', (req) => `Initiating payment for case ${req.body.caseId}`),
  paymentCapture: auditPayment('payment_captured', (req) => `Capturing payment ${req.params.paymentIntentId}`),
  bountyRelease: auditPayment('bounty_released', (req) => `Releasing bounty for case ${req.params.caseId}`),
  refundProcess: auditPayment('refund_processed', (req) => `Processing refund for case ${req.params.caseId}`),

  // User operations
  userUpdate: auditUser('user_updated'),
  userDelete: auditUser('user_deleted', 'medium'),

  // Admin operations
  adminUserSuspend: auditAdmin('user_suspended', 'User', 'high'),
  adminUserBan: auditAdmin('user_banned', 'User', 'high'),
  adminCaseRemove: auditAdmin('case_removed', 'Case', 'medium'),
  adminFraudReview: auditAdmin('fraud_alert_reviewed', 'FraudAlert', 'medium'),
};

/**
 * Generic audit wrapper for any async route handler
 * Logs the action and captures any errors
 */
function auditRoute(options) {
  return (handler) => {
    return async (req, res, next) => {
      const startTime = Date.now();

      try {
        // Run the audit middleware first
        const middleware = createAuditMiddleware(options);
        await new Promise((resolve) => middleware(req, res, resolve));

        // Then run the actual handler
        await handler(req, res, next);
      } catch (error) {
        const duration = Date.now() - startTime;

        // Log the failed action
        await auditService.log({
          userId: req.user?.id || null,
          actionCategory: options.actionCategory,
          action: options.action,
          entityType: options.entityType,
          success: false,
          errorMessage: error.message,
          riskLevel: 'medium',
          metadata: {
            duration_ms: duration,
            error_stack: error.stack,
          },
          req,
        });

        next(error);
      }
    };
  };
}

/**
 * Express middleware to automatically log all requests to sensitive endpoints
 */
function auditSensitiveRoutes() {
  // Define patterns for sensitive routes
  const sensitivePatterns = [
    { pattern: /^\/api\/v\d+\/payments/, category: 'payment' },
    { pattern: /^\/api\/v\d+\/claims.*\/(approve|reject)/, category: 'claim' },
    { pattern: /^\/api\/v\d+\/admin/, category: 'admin' },
    { pattern: /^\/api\/v\d+\/users.*\/suspend/, category: 'security' },
    { pattern: /^\/api\/v\d+\/users.*\/ban/, category: 'security' },
  ];

  return (req, res, next) => {
    // Check if this is a sensitive route
    const isSensitive = sensitivePatterns.some((p) => p.pattern.test(req.path));

    if (!isSensitive) {
      return next();
    }

    const startTime = Date.now();
    const originalJson = res.json.bind(res);

    res.json = function (data) {
      const duration = Date.now() - startTime;
      const success = res.statusCode >= 200 && res.statusCode < 400;

      // Determine action from method and path
      const action = `${req.method.toLowerCase()}_${req.path.split('/').slice(-1)[0] || 'resource'}`;

      // Log asynchronously
      setImmediate(async () => {
        try {
          await auditService.log({
            userId: req.user?.id || null,
            actionCategory: 'security',
            action: `sensitive_route_access`,
            description: `${req.method} ${req.path}`,
            success,
            riskLevel: success ? 'none' : 'low',
            metadata: {
              method: req.method,
              path: req.path,
              duration_ms: duration,
              response_status: res.statusCode,
            },
            req,
          });
        } catch (error) {
          logger.error('[AUDIT MIDDLEWARE] Failed to log sensitive route:', error);
        }
      });

      return originalJson(data);
    };

    next();
  };
}

module.exports = {
  createAuditMiddleware,
  auditMiddlewares,
  auditRoute,
  auditSensitiveRoutes,
  auditPayment,
  auditCase,
  auditClaim,
  auditUser,
  auditAdmin,
};
