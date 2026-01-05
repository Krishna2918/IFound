/**
 * TrainingPair Model
 *
 * Stores image pairs with verdicts for ML training.
 * Each pair links two VisualDNA records with a user verdict.
 * Used to train and improve the matching algorithm.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TrainingPair = sequelize.define('TrainingPair', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },

  // Source VisualDNA
  source_visual_dna_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'visual_dna',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },

  // Target VisualDNA
  target_visual_dna_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'visual_dna',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },

  // Original match that generated this pair
  original_match_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'photo_matches',
      key: 'id',
    },
    onDelete: 'SET NULL',
  },

  // User verdict: is this actually a match?
  verdict: {
    type: DataTypes.ENUM('match', 'no_match', 'uncertain'),
    allowNull: false,
  },

  // Confidence in the verdict (for uncertain cases)
  verdict_confidence: {
    type: DataTypes.FLOAT,
    allowNull: true,
    validate: { min: 0, max: 1 },
    comment: 'How confident we are in this verdict (0-1)',
  },

  // Rejection reasons if verdict is no_match
  rejection_reasons: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
  },

  // Original scores from the matching algorithm
  original_scores: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Snapshot of all component scores from original match',
  },

  // Original overall score
  original_overall_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  // Category of items (for stratified training)
  item_category: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Category of items for stratified training',
  },

  // Export status
  export_status: {
    type: DataTypes.ENUM('pending', 'exported', 'used_in_training', 'excluded'),
    allowNull: false,
    defaultValue: 'pending',
  },

  // When exported
  exported_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  // Training batch
  training_batch_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  // Quality flags
  is_high_quality: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether this pair has high-quality images',
  },

  // Notes from data cleaning
  quality_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

}, {
  tableName: 'training_pairs',
  underscored: true,
  indexes: [
    { fields: ['source_visual_dna_id'] },
    { fields: ['target_visual_dna_id'] },
    { fields: ['original_match_id'] },
    { fields: ['verdict'] },
    { fields: ['export_status'] },
    { fields: ['item_category'] },
    // Prevent duplicate pairs
    {
      unique: true,
      fields: ['source_visual_dna_id', 'target_visual_dna_id'],
      name: 'unique_training_pair',
    },
  ],
});

module.exports = TrainingPair;
