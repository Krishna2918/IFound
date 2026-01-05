const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  // Log error with context
  logger.errorWithContext(err, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userId: req.user?.id || 'anonymous',
    body: process.env.NODE_ENV === 'development' ? req.body : undefined,
  });

  // Default error
  let status = err.status || 500;
  let message = err.message || 'Internal server error';
  let errors = err.errors || null;
  let errorCode = err.code || 'INTERNAL_ERROR';

  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError') {
    status = 400;
    message = 'Validation error';
    errorCode = 'VALIDATION_ERROR';
    errors = err.errors.map(e => ({
      field: e.path,
      message: e.message,
    }));
  }

  // Sequelize unique constraint error
  if (err.name === 'SequelizeUniqueConstraintError') {
    status = 409;
    message = 'Resource already exists';
    errorCode = 'DUPLICATE_RESOURCE';
    errors = err.errors.map(e => ({
      field: e.path,
      message: `${e.path} must be unique`,
    }));
  }

  // Sequelize foreign key constraint error
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    status = 400;
    message = 'Invalid reference';
    errorCode = 'INVALID_REFERENCE';
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    status = 403;
    message = 'Invalid token';
    errorCode = 'INVALID_TOKEN';
    logger.security('Invalid JWT token attempt', {
      ip: req.ip,
      url: req.originalUrl,
    });
  }

  if (err.name === 'TokenExpiredError') {
    status = 403;
    message = 'Token expired';
    errorCode = 'TOKEN_EXPIRED';
  }

  // Multer file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    status = 400;
    message = 'File too large';
    errorCode = 'FILE_TOO_LARGE';
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    status = 400;
    message = 'Unexpected file field';
    errorCode = 'UNEXPECTED_FILE';
  }

  // Rate limit errors
  if (err.status === 429) {
    errorCode = 'RATE_LIMITED';
    logger.security('Rate limit exceeded', {
      ip: req.ip,
      url: req.originalUrl,
    });
  }

  // Send response
  res.status(status).json({
    success: false,
    message,
    code: errorCode,
    errors,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// 404 handler
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
};

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
