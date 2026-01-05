/**
 * Message Model
 *
 * Handles chat messages between finder and claimant (owner) for a claim.
 * Chat is enabled when a claim is accepted.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },

  // The claim this message belongs to
  claim_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'claims',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },

  // Who sent the message
  sender_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },

  // Message content
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },

  // Message type
  message_type: {
    type: DataTypes.ENUM(
      'text',           // Regular text message
      'system',         // System-generated message
      'location',       // Shared location for meetup
      'image',          // Image attachment
      'handover_request', // Request to confirm handover
      'handover_confirmed' // Handover confirmation
    ),
    allowNull: false,
    defaultValue: 'text',
  },

  // Optional metadata (for location, images, etc.)
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: null,
  },

  // Read status
  is_read: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },

  read_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

}, {
  tableName: 'messages',
  indexes: [
    { fields: ['claim_id'] },
    { fields: ['sender_id'] },
    { fields: ['created_at'] },
    { fields: ['claim_id', 'created_at'] },
  ],
});

module.exports = Message;
