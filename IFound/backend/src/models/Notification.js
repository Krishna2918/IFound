/**
 * Notification Model
 *
 * Stores all notifications sent to users for in-app display and history.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },

  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },

  // Notification type
  type: {
    type: DataTypes.ENUM(
      'nearby_case',        // New case near user
      'claim_received',     // Someone claimed user's case
      'claim_approved',     // User's claim was approved
      'claim_rejected',     // User's claim was rejected
      'claim_disputed',     // Claim dispute
      'payment_received',   // Bounty received
      'payment_sent',       // Payment processed
      'new_message',        // Chat message
      'match_found',        // AI match found
      'case_expiring',      // Case about to expire
      'case_resolved',      // Case resolved
      'verification_update',// ID verification status
      'system',             // System notification
      'promo'               // Promotional
    ),
    allowNull: false,
  },

  // Display content
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },

  body: {
    type: DataTypes.TEXT,
    allowNull: false,
  },

  // Optional image URL
  image_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  // Deep link for navigation
  action_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    // e.g., "ifound://case/123" or "ifound://claim/456"
  },

  // Related entity
  entity_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },

  entity_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },

  // Additional data payload
  data: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },

  // Delivery status
  push_sent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },

  push_sent_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  email_sent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },

  email_sent_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  sms_sent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },

  sms_sent_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  // User interaction
  is_read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },

  read_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  // Priority (affects delivery)
  priority: {
    type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
    defaultValue: 'normal',
  },

  // Expiry (for time-sensitive notifications)
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

}, {
  tableName: 'notifications',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['type'] },
    { fields: ['is_read'] },
    { fields: ['createdAt'] },
    { fields: ['user_id', 'is_read'] },
    { fields: ['user_id', 'type', 'createdAt'] },
    { fields: ['entity_type', 'entity_id'] },
  ],
});

module.exports = Notification;
