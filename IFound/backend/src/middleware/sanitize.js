/**
 * Input Sanitization Middleware
 * Protects against XSS attacks by sanitizing user inputs
 */

const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;

  return str
    // Remove script tags and their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove event handlers (onclick, onerror, etc.)
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '')
    // Remove javascript: protocol
    .replace(/javascript:/gi, '')
    // Remove data: protocol (can be used for XSS)
    .replace(/data:/gi, '')
    // Escape HTML entities
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

const sanitizeObject = (obj) => {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized = {};
    for (const key of Object.keys(obj)) {
      // Sanitize the key as well (prevent prototype pollution)
      const sanitizedKey = sanitizeString(key);
      if (sanitizedKey === '__proto__' || sanitizedKey === 'constructor' || sanitizedKey === 'prototype') {
        continue; // Skip dangerous keys
      }
      sanitized[sanitizedKey] = sanitizeObject(obj[key]);
    }
    return sanitized;
  }

  return obj;
};

/**
 * Express middleware to sanitize request body, query, and params
 */
const sanitizeInput = (req, res, next) => {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to prevent NoSQL/SQL injection patterns
 */
const preventInjection = (req, res, next) => {
  const dangerousPatterns = [
    /(\$where|\$regex|\$ne|\$gt|\$lt|\$gte|\$lte|\$in|\$nin|\$or|\$and|\$not|\$nor|\$exists|\$type|\$mod|\$text|\$geoWithin)/i,
    /(union\s+select|select\s+\*|drop\s+table|insert\s+into|delete\s+from|update\s+.*\s+set)/i,
  ];

  const checkValue = (value) => {
    if (typeof value === 'string') {
      for (const pattern of dangerousPatterns) {
        if (pattern.test(value)) {
          return false;
        }
      }
    }
    return true;
  };

  const checkObject = (obj) => {
    if (typeof obj === 'string') {
      return checkValue(obj);
    }

    if (Array.isArray(obj)) {
      return obj.every(item => checkObject(item));
    }

    if (typeof obj === 'object' && obj !== null) {
      return Object.values(obj).every(value => checkObject(value));
    }

    return true;
  };

  const bodyValid = checkObject(req.body);
  const queryValid = checkObject(req.query);
  const paramsValid = checkObject(req.params);

  if (!bodyValid || !queryValid || !paramsValid) {
    return res.status(400).json({
      success: false,
      message: 'Invalid characters detected in request',
    });
  }

  next();
};

module.exports = {
  sanitizeInput,
  preventInjection,
  sanitizeString,
  sanitizeObject,
};
