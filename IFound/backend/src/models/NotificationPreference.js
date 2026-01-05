/**
 * NotificationPreference Model
 *
 * Stores user preferences for different notification channels and types.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const NotificationPreference = sequelize.define('NotificationPreference', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },

  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    references: {
      model: 'users',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },

  // Push notification preferences
  push_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  push_nearby_cases: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  push_claim_updates: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  push_payment_updates: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  push_messages: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  push_matches: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  // Email preferences
  email_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  email_nearby_cases: {
    type: DataTypes.BOOLEAN,
    defaultValue: false, // Don't spam email for nearby cases
  },

  email_claim_updates: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  email_payment_updates: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  email_messages: {
    type: DataTypes.BOOLEAN,
    defaultValue: false, // Use push for messages
  },

  email_weekly_digest: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  // SMS preferences
  sms_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },

  sms_payment_updates: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  sms_urgent_only: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  // Quiet hours (no notifications)
  quiet_hours_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },

  quiet_hours_start: {
    type: DataTypes.TIME,
    defaultValue: '22:00:00', // 10 PM
  },

  quiet_hours_end: {
    type: DataTypes.TIME,
    defaultValue: '08:00:00', // 8 AM
  },

  // Timezone for quiet hours
  timezone: {
    type: DataTypes.STRING(50),
    defaultValue: 'America/New_York',
  },

  // Location alert preferences
  location_alerts_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  location_alert_radius_km: {
    type: DataTypes.FLOAT,
    defaultValue: 10, // 10 km radius
    validate: {
      min: 1,
      max: 100,
    },
  },

  max_alerts_per_day: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
    validate: {
      min: 1,
      max: 50,
    },
  },

  // Alert categories subscribed to
  subscribed_categories: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: ['lost_item', 'found_item', 'lost_pet'],
  },

}, {
  tableName: 'notification_preferences',
  indexes: [
    { unique: true, fields: ['user_id'] },
  ],
});

module.exports = NotificationPreference;
