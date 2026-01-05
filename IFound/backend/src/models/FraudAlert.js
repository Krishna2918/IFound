/**
 * FraudAlert Model
 *
 * Tracks potential fraud activities detected by the system.
 * Used by admins to review and take action on suspicious behavior.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FraudAlert = sequelize.define('FraudAlert', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },

  // The user involved in the suspicious activity
  user_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
    onDelete: 'SET NULL',
  },

  // Related entities (optional)
  case_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'cases',
      key: 'id',
    },
    onDelete: 'SET NULL',
  },

  claim_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'claims',
      key: 'id',
    },
    onDelete: 'SET NULL',
  },

  transaction_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'transactions',
      key: 'id',
    },
    onDelete: 'SET NULL',
  },

  // Type of fraud detected
  alert_type: {
    type: DataTypes.ENUM(
      'multiple_claims_same_ip',      // Multiple claims from same IP
      'rapid_fire_claims',            // Too many claims in short time
      'self_dealing',                 // Poster and finder same person/network
      'duplicate_photos',             // Same photo used across cases
      'location_spoofing',            // Detected GPS spoofing
      'velocity_abuse',               // Rate limit abuse
      'suspicious_payout',            // Suspicious payout pattern
      'account_takeover',             // Possible account compromise
      'fake_verification',            // Fake ID or verification docs
      'collusion',                    // Multiple accounts working together
      'chargeback_fraud',             // Payment dispute patterns
      'other'
    ),
    allowNull: false,
  },

  // Severity level
  severity: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    allowNull: false,
    defaultValue: 'medium',
  },

  // Calculated fraud score (0-100)
  fraud_score: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 50,
    validate: {
      min: 0,
      max: 100,
    },
  },

  // Description of the alert
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },

  // Evidence and context
  evidence: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    // Structure:
    // {
    //   ip_addresses: [],
    //   device_fingerprints: [],
    //   timestamps: [],
    //   related_users: [],
    //   related_cases: [],
    //   detection_rules_triggered: [],
    //   raw_data: {}
    // }
  },

  // Status of the alert
  status: {
    type: DataTypes.ENUM(
      'new',              // Just detected
      'under_review',     // Admin is reviewing
      'confirmed',        // Confirmed as fraud
      'false_positive',   // Not actually fraud
      'resolved',         // Action taken
      'escalated'         // Escalated to higher authority
    ),
    allowNull: false,
    defaultValue: 'new',
  },

  // Admin who reviewed
  reviewed_by: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
    onDelete: 'SET NULL',
  },

  reviewed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  // Action taken
  action_taken: {
    type: DataTypes.ENUM(
      'none',
      'warning_issued',
      'account_suspended',
      'account_banned',
      'transaction_reversed',
      'case_removed',
      'claim_rejected',
      'reported_to_authorities'
    ),
    allowNull: true,
  },

  // Admin notes
  admin_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  // Auto-action taken (if any)
  auto_action: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  // Source of detection
  detection_source: {
    type: DataTypes.ENUM('automated', 'user_report', 'admin_manual', 'external'),
    allowNull: false,
    defaultValue: 'automated',
  },

}, {
  tableName: 'fraud_alerts',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['case_id'] },
    { fields: ['claim_id'] },
    { fields: ['alert_type'] },
    { fields: ['severity'] },
    { fields: ['status'] },
    { fields: ['fraud_score'] },
    { fields: ['createdAt'] },
    { fields: ['status', 'severity'] }, // For admin queue
  ],
});

module.exports = FraudAlert;
