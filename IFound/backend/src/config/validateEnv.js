/**
 * Environment Variable Validation
 * Validates required environment variables on startup
 */

const logger = require('./logger');

// Define required environment variables with descriptions
const requiredVars = {
  // Database
  DB_HOST: 'PostgreSQL database host',
  DB_NAME: 'PostgreSQL database name',
  DB_USER: 'PostgreSQL database username',
  DB_PASSWORD: 'PostgreSQL database password',

  // JWT Authentication
  JWT_SECRET: 'Secret key for JWT token signing',
  JWT_REFRESH_SECRET: 'Secret key for JWT refresh token signing',
};

// Define optional but recommended variables
const recommendedVars = {
  // Security
  CORS_ORIGIN: 'Allowed CORS origins (defaults to *)',
  BCRYPT_ROUNDS: 'Bcrypt hashing rounds (defaults to 10)',

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: 'Rate limit window in milliseconds',
  RATE_LIMIT_MAX_REQUESTS: 'Maximum requests per window',

  // External Services
  STRIPE_SECRET_KEY: 'Stripe API secret key for payments',
  STRIPE_WEBHOOK_SECRET: 'Stripe webhook signing secret',

  // Email
  SMTP_HOST: 'SMTP server host for email',
  SMTP_USER: 'SMTP username',
  SMTP_PASS: 'SMTP password',

  // AWS (for file storage)
  AWS_ACCESS_KEY_ID: 'AWS access key for S3',
  AWS_SECRET_ACCESS_KEY: 'AWS secret key for S3',
  AWS_S3_BUCKET: 'S3 bucket name for uploads',

  // Redis
  REDIS_URL: 'Redis connection URL for caching',
};

// Define variables that should never be default in production
const productionRequired = {
  JWT_SECRET: 'Must be a strong, unique secret in production',
  JWT_REFRESH_SECRET: 'Must be a strong, unique secret in production',
  STRIPE_SECRET_KEY: 'Must be a real Stripe key in production',
};

/**
 * Validate environment variables
 * @param {Object} options - Validation options
 * @param {boolean} options.exitOnError - Exit process on validation failure (default: true in production)
 * @returns {Object} Validation result
 */
const validateEnv = (options = {}) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const exitOnError = options.exitOnError ?? isProduction;

  const errors = [];
  const warnings = [];

  // Check required variables
  for (const [varName, description] of Object.entries(requiredVars)) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName} (${description})`);
    }
  }

  // Check recommended variables
  for (const [varName, description] of Object.entries(recommendedVars)) {
    if (!process.env[varName]) {
      warnings.push(`Missing recommended environment variable: ${varName} (${description})`);
    }
  }

  // Production-specific checks
  if (isProduction) {
    for (const [varName, description] of Object.entries(productionRequired)) {
      const value = process.env[varName];

      // Check for weak/default values
      if (!value) {
        errors.push(`Production requires: ${varName} (${description})`);
      } else if (
        value.includes('dummy') ||
        value.includes('test') ||
        value.includes('example') ||
        value.includes('changeme') ||
        value.length < 32
      ) {
        errors.push(`${varName} appears to be a weak/test value. ${description}`);
      }
    }

    // Check CORS is not wildcard in production
    if (process.env.CORS_ORIGIN === '*') {
      warnings.push('CORS_ORIGIN is set to wildcard (*) in production. Consider restricting to specific origins.');
    }

    // Check NODE_ENV is explicitly set
    if (!process.env.NODE_ENV) {
      errors.push('NODE_ENV must be explicitly set in production');
    }
  }

  // Validate JWT secrets are different
  if (
    process.env.JWT_SECRET &&
    process.env.JWT_REFRESH_SECRET &&
    process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET
  ) {
    errors.push('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }

  // Validate numeric values
  const numericVars = ['PORT', 'DB_PORT', 'BCRYPT_ROUNDS', 'RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_MAX_REQUESTS'];
  for (const varName of numericVars) {
    if (process.env[varName] && isNaN(parseInt(process.env[varName]))) {
      errors.push(`${varName} must be a valid number`);
    }
  }

  // Log results
  if (warnings.length > 0) {
    logger.warn('Environment validation warnings:', { warnings });
  }

  if (errors.length > 0) {
    logger.error('Environment validation failed:', { errors });

    if (exitOnError) {
      console.error('\n❌ Environment validation failed!\n');
      errors.forEach((err, i) => console.error(`  ${i + 1}. ${err}`));
      console.error('\nPlease fix the above issues and restart the server.\n');
      process.exit(1);
    }
  } else {
    logger.info('Environment validation passed');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * Get safe environment info (excludes secrets)
 */
const getSafeEnvInfo = () => {
  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 3000,
    API_VERSION: process.env.API_VERSION || 'v1',
    DB_HOST: process.env.DB_HOST ? '***configured***' : 'not set',
    DB_NAME: process.env.DB_NAME || 'not set',
    STRIPE_CONFIGURED: !!process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('dummy'),
    REDIS_CONFIGURED: !!process.env.REDIS_URL,
    SMTP_CONFIGURED: !!process.env.SMTP_HOST,
    AWS_CONFIGURED: !!process.env.AWS_ACCESS_KEY_ID,
  };
};

module.exports = {
  validateEnv,
  getSafeEnvInfo,
  requiredVars,
  recommendedVars,
};
