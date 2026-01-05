require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const { testConnection } = require('./config/database');
const { syncDatabase } = require('./models');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { sanitizeInput, preventInjection } = require('./middleware/sanitize');
const { auditSensitiveRoutes } = require('./middleware/auditMiddleware');
const { tieredRateLimiter, authLimiter: tieredAuthLimiter, registrationLimiter } = require('./middleware/rateLimit');
const logger = require('./config/logger');
const { validateEnv, getSafeEnvInfo } = require('./config/validateEnv');

// Import routes
const v1Routes = require('./routes/v1');
const businessRules = require('./config/businessRules');

// Validate environment variables before starting
validateEnv({ exitOnError: process.env.NODE_ENV === 'production' });

// Ensure logs directory exists
const logDir = process.env.LOG_DIR || path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Serve static files (uploaded photos)
app.use('/uploads', express.static('uploads'));

// Security middleware
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// General rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { success: false, message: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Stricter rate limiting for auth routes (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Only 10 attempts per 15 minutes
  message: { success: false, message: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.security('Auth rate limit exceeded', {
      ip: req.ip,
      url: req.originalUrl,
    });
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again later.',
    });
  },
});
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);

// Stripe webhook endpoint (needs raw body, must be before body parsing)
app.post('/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  require('./routes/payments').webhookHandler
);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization middleware (XSS protection)
app.use(sanitizeInput);
app.use(preventInjection);

// Audit logging for sensitive routes
app.use(auditSensitiveRoutes());

// HTTP request logging with Winston
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    logger.httpRequest(req, res, responseTime);
  });
  next();
});

// Development logging with morgan
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: getSafeEnvInfo(),
  });
});

// API routes - Version 1
const API_VERSION = process.env.API_VERSION || 'v1';
app.use(`/api/${API_VERSION}`, v1Routes);

// Future: Add v2 routes when needed
// app.use('/api/v2', v2Routes);

// Root route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to I Found!! API',
    version: API_VERSION,
    documentation: `/api/${API_VERSION}/docs`,
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Test database connection
    await testConnection();
    logger.info('Database connection established');

    // Sync database (in production, use migrations instead)
    if (process.env.NODE_ENV === 'development') {
      await syncDatabase({ alter: true });
      logger.info('Database synchronized');
    }

    app.listen(PORT, () => {
      logger.info(`Server started on port ${PORT}`, {
        environment: process.env.NODE_ENV || 'development',
        apiVersion: API_VERSION,
        port: PORT,
      });

      console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🔍 I Found!! API Server                                  ║
║                                                            ║
║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(15)}                      ║
║   Port: ${String(PORT).padEnd(15)}                                   ║
║   API Version: ${API_VERSION.padEnd(15)}                                ║
║                                                            ║
║   🚀 Server is running and ready to accept connections     ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection', { error: err.message, stack: err.stack });
  console.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

startServer();

module.exports = app;
