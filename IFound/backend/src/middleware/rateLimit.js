/**
 * Tiered Rate Limiting Middleware
 *
 * Provides different rate limits based on user tier/role.
 * Supports both in-memory and Redis-based storage.
 */

const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');
const auditService = require('../services/auditService');

// Rate limit configuration by tier
const TIER_LIMITS = {
  anonymous: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30,
    message: 'Too many requests. Please sign in for higher limits.',
  },
  finder: {
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Rate limit exceeded. Consider upgrading your account.',
  },
  poster_basic: {
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: 'Rate limit exceeded. Upgrade to premium for higher limits.',
  },
  poster_premium: {
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: 'Rate limit exceeded. Please contact support if you need higher limits.',
  },
  law_enforcement: {
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: 'Rate limit exceeded. Contact your account manager.',
  },
  admin: {
    windowMs: 15 * 60 * 1000,
    max: 0, // Unlimited
    message: 'Rate limit exceeded.',
  },
};

// Endpoint-specific rate limits (overrides tier limits for sensitive endpoints)
const ENDPOINT_LIMITS = {
  // Auth endpoints - tighter limits for security
  '/api/v1/auth/login': { windowMs: 15 * 60 * 1000, max: 5 },
  '/api/v1/auth/register': { windowMs: 60 * 60 * 1000, max: 3 },
  '/api/v1/auth/password-reset': { windowMs: 60 * 60 * 1000, max: 3 },

  // Payment endpoints - moderate limits
  '/api/v1/payments/create-intent': { windowMs: 60 * 60 * 1000, max: 10 },
  '/api/v1/payments/release-bounty': { windowMs: 60 * 60 * 1000, max: 20 },

  // Claims - prevent spam
  '/api/v1/claims': { windowMs: 60 * 60 * 1000, max: 10 },

  // Photo uploads - resource intensive
  '/api/v1/photos/upload': { windowMs: 60 * 60 * 1000, max: 50 },

  // AI matching - very resource intensive
  '/api/v1/matches/find': { windowMs: 60 * 60 * 1000, max: 20 },
  '/api/v1/visualdna': { windowMs: 60 * 60 * 1000, max: 30 },
};

/**
 * Determine user tier from request
 */
function getUserTier(req) {
  if (!req.user) {
    return 'anonymous';
  }

  const { role, subscription_tier, is_verified_le } = req.user;

  // Admin always has highest priority
  if (role === 'admin') {
    return 'admin';
  }

  // Law enforcement (verified)
  if (is_verified_le || role === 'law_enforcement') {
    return 'law_enforcement';
  }

  // Premium subscription
  if (subscription_tier === 'premium') {
    return 'poster_premium';
  }

  // Basic poster (has posted cases)
  if (role === 'poster' || subscription_tier === 'basic') {
    return 'poster_basic';
  }

  // Default: finder (free tier)
  return 'finder';
}

/**
 * Generate rate limit key based on user or IP
 */
function keyGenerator(req) {
  // Use user ID if authenticated, otherwise IP
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }

  // For anonymous, use IP + fingerprint if available
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
  const fingerprint = req.headers['x-device-fingerprint'] || '';

  return `ip:${ip}:${fingerprint}`;
}

/**
 * Handle rate limit exceeded
 */
async function onLimitReached(req, res, options) {
  const tier = getUserTier(req);

  logger.warn('[RATE LIMIT] Limit exceeded', {
    userId: req.user?.id,
    ip: req.ip,
    tier,
    endpoint: req.path,
  });

  // Log to audit trail
  await auditService.logRateLimitExceeded(
    req.user?.id || null,
    req.path,
    options.max,
    req
  );

  // Return tier-specific message
  const tierConfig = TIER_LIMITS[tier] || TIER_LIMITS.anonymous;
  res.status(429).json({
    success: false,
    error: 'rate_limit_exceeded',
    message: tierConfig.message,
    retryAfter: Math.ceil(options.windowMs / 1000),
  });
}

/**
 * Create tiered rate limiter
 */
function createTieredRateLimiter(options = {}) {
  const store = options.store || undefined; // Use memory store by default

  return (req, res, next) => {
    const tier = getUserTier(req);
    const tierConfig = TIER_LIMITS[tier] || TIER_LIMITS.anonymous;

    // Check for endpoint-specific limits
    const endpointPath = req.path.replace(/\/[a-f0-9-]{36}/gi, '/:id'); // Normalize UUIDs
    const endpointConfig = ENDPOINT_LIMITS[endpointPath];

    // Use stricter limit (endpoint or tier)
    let effectiveMax = tierConfig.max;
    let effectiveWindow = tierConfig.windowMs;

    if (endpointConfig && tier !== 'admin') {
      // Endpoint limits apply to non-admins
      effectiveMax = Math.min(tierConfig.max || Infinity, endpointConfig.max);
      effectiveWindow = endpointConfig.windowMs;
    }

    // Admin bypass
    if (tier === 'admin') {
      return next();
    }

    // Create rate limiter for this request
    const limiter = rateLimit({
      windowMs: effectiveWindow,
      max: effectiveMax,
      keyGenerator,
      store,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => onLimitReached(req, res, { windowMs: effectiveWindow, max: effectiveMax }),
      skip: () => tier === 'admin',
    });

    limiter(req, res, next);
  };
}

/**
 * Simple in-memory rate limiter store
 * For development/testing only - use Redis in production
 */
class MemoryStore {
  constructor() {
    this.hits = new Map();
    this.resetTime = new Map();

    // Cleanup every minute
    setInterval(() => this.cleanup(), 60000);
  }

  async increment(key) {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // Default window

    if (!this.hits.has(key) || now > this.resetTime.get(key)) {
      this.hits.set(key, 0);
      this.resetTime.set(key, now + windowMs);
    }

    const current = this.hits.get(key) + 1;
    this.hits.set(key, current);

    return {
      totalHits: current,
      resetTime: this.resetTime.get(key),
    };
  }

  async decrement(key) {
    const current = this.hits.get(key) || 0;
    if (current > 0) {
      this.hits.set(key, current - 1);
    }
  }

  async resetKey(key) {
    this.hits.delete(key);
    this.resetTime.delete(key);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, resetTime] of this.resetTime.entries()) {
      if (now > resetTime) {
        this.hits.delete(key);
        this.resetTime.delete(key);
      }
    }
  }
}

/**
 * Redis store for rate limiting
 * Requires ioredis
 */
class RedisStore {
  constructor(redisClient) {
    this.client = redisClient;
    this.prefix = 'ratelimit:';
  }

  async increment(key) {
    const fullKey = this.prefix + key;
    const windowMs = 15 * 60 * 1000;
    const windowSec = Math.ceil(windowMs / 1000);

    const multi = this.client.multi();
    multi.incr(fullKey);
    multi.pttl(fullKey);

    const results = await multi.exec();
    const totalHits = results[0][1];
    let ttl = results[1][1];

    // Set expiry if key is new
    if (ttl === -1) {
      await this.client.pexpire(fullKey, windowMs);
      ttl = windowMs;
    }

    return {
      totalHits,
      resetTime: Date.now() + ttl,
    };
  }

  async decrement(key) {
    const fullKey = this.prefix + key;
    await this.client.decr(fullKey);
  }

  async resetKey(key) {
    const fullKey = this.prefix + key;
    await this.client.del(fullKey);
  }
}

/**
 * Create store based on environment
 */
function createStore(redisClient = null) {
  if (redisClient) {
    return new RedisStore(redisClient);
  }

  if (process.env.NODE_ENV === 'production') {
    logger.warn('[RATE LIMIT] Using in-memory store in production. Consider using Redis.');
  }

  return new MemoryStore();
}

/**
 * Strict rate limiter for specific endpoints
 * Use this for sensitive endpoints like login, registration
 */
function strictRateLimit(options = {}) {
  const {
    windowMs = 15 * 60 * 1000,
    max = 5,
    message = 'Too many attempts. Please try again later.',
    store,
  } = options;

  return rateLimit({
    windowMs,
    max,
    keyGenerator,
    store,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: 'rate_limit_exceeded',
      message,
      retryAfter: Math.ceil(windowMs / 1000),
    },
  });
}

/**
 * Skip rate limiting for specific conditions
 */
function skipRateLimit(req) {
  // Skip for webhooks
  if (req.path.includes('/webhooks/')) {
    return true;
  }

  // Skip for health checks
  if (req.path === '/health' || req.path === '/api/health') {
    return true;
  }

  return false;
}

/**
 * Main rate limiter middleware
 */
const tieredRateLimiter = createTieredRateLimiter();

/**
 * Specific limiters for common use cases
 */
const authLimiter = strictRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again in 15 minutes.',
});

const registrationLimiter = strictRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many registration attempts. Please try again in an hour.',
});

const passwordResetLimiter = strictRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many password reset attempts. Please try again in an hour.',
});

const uploadLimiter = strictRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: 'Upload limit reached. Please try again later.',
});

const claimLimiter = strictRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Claim submission limit reached. Please try again later.',
});

module.exports = {
  tieredRateLimiter,
  createTieredRateLimiter,
  strictRateLimit,
  createStore,
  MemoryStore,
  RedisStore,
  getUserTier,
  keyGenerator,
  skipRateLimit,
  TIER_LIMITS,
  ENDPOINT_LIMITS,

  // Pre-configured limiters
  authLimiter,
  registrationLimiter,
  passwordResetLimiter,
  uploadLimiter,
  claimLimiter,
};
