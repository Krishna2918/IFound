/**
 * DeviceToken Model
 *
 * Stores FCM (Firebase Cloud Messaging) device tokens for push notifications.
 * A user can have multiple devices.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DeviceToken = sequelize.define('DeviceToken', {
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

  // FCM token
  token: {
    type: DataTypes.TEXT,
    allowNull: false,
  },

  // Device information
  device_type: {
    type: DataTypes.ENUM('ios', 'android', 'web'),
    allowNull: false,
  },

  device_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },

  device_model: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },

  os_version: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },

  app_version: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },

  // Token status
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  // Last time a notification was successfully sent
  last_used_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  // Number of failed sends (for cleanup)
  failed_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },

  // Last known location (for geofencing)
  last_latitude: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },

  last_longitude: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },

  last_location_update: {
    type: DataTypes.DATE,
    allowNull: true,
  },

}, {
  tableName: 'device_tokens',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['token'], unique: true },
    { fields: ['is_active'] },
    { fields: ['device_type'] },
    { fields: ['last_location_update'] },
  ],
});

module.exports = DeviceToken;
