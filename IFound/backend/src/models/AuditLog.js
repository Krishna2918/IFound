/**
 * AuditLog Model
 *
 * Comprehensive audit trail for sensitive actions.
 * Used for security monitoring, compliance, and debugging.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },

  // Who performed the action
  user_id: {
    type: DataTypes.UUID,
    allowNull: true, // Null for system actions or unauthenticated
    references: {
      model: 'users',
      key: 'id',
    },
    onDelete: 'SET NULL',
  },

  // Action category
  action_category: {
    type: DataTypes.ENUM(
      'auth',           // Login, logout, password change
      'user',           // User profile changes
      'case',           // Case CRUD operations
      'claim',          // Claim actions
      'payment',        // Payment transactions
      'verification',   // ID verification events
      'admin',          // Admin actions
      'security',       // Security-related events
      'system'          // System events
    ),
    allowNull: false,
  },

  // Specific action performed
  action: {
    type: DataTypes.STRING(100),
    allowNull: false,
    // Examples: 'login_success', 'case_created', 'bounty_released', 'user_suspended'
  },

  // Entity type affected
  entity_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    // Examples: 'User', 'Case', 'Claim', 'Transaction'
  },

  // Entity ID affected
  entity_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },

  // Description of the action
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  // Previous state (for updates)
  old_values: {
    type: DataTypes.JSONB,
    allowNull: true,
  },

  // New state (for creates/updates)
  new_values: {
    type: DataTypes.JSONB,
    allowNull: true,
  },

  // Request metadata
  ip_address: {
    type: DataTypes.STRING(45), // IPv6 compatible
    allowNull: true,
  },

  user_agent: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  // Device fingerprint (if available)
  device_fingerprint: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },

  // Request details
  request_method: {
    type: DataTypes.STRING(10),
    allowNull: true,
  },

  request_path: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },

  // Response status
  response_status: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  // Duration in milliseconds
  duration_ms: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  // Success indicator
  success: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },

  // Error details (if failed)
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  // Additional context
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
  },

  // Risk level (for security events)
  risk_level: {
    type: DataTypes.ENUM('none', 'low', 'medium', 'high', 'critical'),
    allowNull: false,
    defaultValue: 'none',
  },

  // Session ID (for tracking user sessions)
  session_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },

  // Geographic info (if available)
  geo_location: {
    type: DataTypes.JSONB,
    allowNull: true,
    // { country, region, city, latitude, longitude }
  },

}, {
  tableName: 'audit_logs',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['action_category'] },
    { fields: ['action'] },
    { fields: ['entity_type', 'entity_id'] },
    { fields: ['ip_address'] },
    { fields: ['createdAt'] },
    { fields: ['success'] },
    { fields: ['risk_level'] },
    { fields: ['session_id'] },
    // Composite for common queries
    { fields: ['user_id', 'action_category', 'createdAt'] },
    { fields: ['action_category', 'action', 'createdAt'] },
  ],
  // Don't allow updates or deletes on audit logs
  hooks: {
    beforeUpdate: () => {
      throw new Error('Audit logs cannot be modified');
    },
    beforeDestroy: () => {
      throw new Error('Audit logs cannot be deleted');
    },
  },
});

module.exports = AuditLog;
