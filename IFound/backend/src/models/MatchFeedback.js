/**
 * MatchFeedback Model
 *
 * Records detailed feedback from users about potential matches.
 * Used for ML training to improve matching accuracy.
 * Captures:
 * - User's verdict (confirmed/rejected/unsure)
 * - Rejection reasons with specific codes
 * - Snapshot of scores and weights at feedback time
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MatchFeedback = sequelize.define('MatchFeedback', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },

  // Link to the match this feedback is for
  photo_match_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'photo_matches',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },

  // User who provided the feedback
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },

  // Whether user was source or target in the match
  is_source_user: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
  },

  // User's feedback type
  feedback_type: {
    type: DataTypes.ENUM('confirmed', 'rejected', 'unsure'),
    allowNull: false,
  },

  // Rejection reasons (array of reason codes)
  rejection_reasons: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of rejection reason codes',
  },

  // Free-text explanation
  rejection_explanation: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  // Snapshot of match scores at feedback time
  match_scores_snapshot: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Snapshot of all scores when feedback was given',
  },

  // Snapshot of weights used for this match
  weights_used_snapshot: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'The weight configuration used for this match',
  },

  // Training pipeline status
  training_status: {
    type: DataTypes.ENUM('pending', 'exported', 'trained', 'invalid'),
    allowNull: false,
    defaultValue: 'pending',
  },

  // When this was exported for training
  exported_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  // Training batch ID if exported
  training_batch_id: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Identifier for the training batch this was included in',
  },

}, {
  tableName: 'match_feedback',
  underscored: true,
  indexes: [
    { fields: ['photo_match_id'] },
    { fields: ['user_id'] },
    { fields: ['feedback_type'] },
    { fields: ['training_status'] },
    { fields: ['created_at'] },
  ],
});

module.exports = MatchFeedback;
