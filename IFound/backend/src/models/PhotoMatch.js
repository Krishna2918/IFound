/**
 * PhotoMatch Model
 *
 * Stores potential matches between photos from different cases.
 * When someone uploads a "found" item, this tracks if it matches
 * any "lost" item (and vice versa).
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PhotoMatch = sequelize.define('PhotoMatch', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },

  // The photo that was uploaded (source)
  source_photo_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'photos',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  source_case_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'cases',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },

  // The photo that matched (target)
  target_photo_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'photos',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  target_case_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'cases',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },

  // Match Scores (0-100)
  overall_score: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 0, max: 100 },
  },

  // Individual component scores
  dna_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Image DNA fingerprint similarity score',
  },
  hash_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Perceptual hash similarity score',
  },
  ocr_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'OCR text similarity score',
  },
  color_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Color similarity score',
  },
  visual_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Visual/feature similarity score',
  },
  shape_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Shape/silhouette similarity score',
  },

  // Match Details
  match_type: {
    type: DataTypes.ENUM('visual', 'color', 'shape', 'text', 'license_plate', 'serial_number', 'visual_features', 'combined', 'pet', 'pattern', 'image_dna'),
    allowNull: false,
    defaultValue: 'combined',
  },

  // What specifically matched
  match_details: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Details about what matched (license plate text, serial numbers, etc.)',
  },

  // Unique identifiers that matched
  matched_identifiers: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {
      licensePlates: [],
      serialNumbers: [],
      documentIds: [],
    },
  },

  // Status tracking
  status: {
    type: DataTypes.ENUM('pending', 'notified', 'viewed', 'confirmed', 'rejected', 'expired'),
    allowNull: false,
    defaultValue: 'pending',
  },

  // Who has been notified
  source_user_notified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  target_user_notified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },

  // User feedback
  source_user_feedback: {
    type: DataTypes.ENUM('confirmed', 'rejected', 'unsure'),
    allowNull: true,
  },
  target_user_feedback: {
    type: DataTypes.ENUM('confirmed', 'rejected', 'unsure'),
    allowNull: true,
  },

  // Rejection feedback details (for ML training)
  source_rejection_reasons: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of rejection reason codes from source user',
  },
  source_rejection_details: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Free-text explanation from source user',
  },
  target_rejection_reasons: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of rejection reason codes from target user',
  },
  target_rejection_details: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Free-text explanation from target user',
  },

  // Location-based scoring
  location_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Location proximity score (0-100, higher = closer)',
  },
  distance_miles: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Distance between lost and found locations in miles',
  },

  // Timestamps for tracking
  notified_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  viewed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  resolved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

}, {
  tableName: 'photo_matches',
  indexes: [
    { fields: ['source_photo_id'] },
    { fields: ['target_photo_id'] },
    { fields: ['source_case_id'] },
    { fields: ['target_case_id'] },
    { fields: ['status'] },
    { fields: ['overall_score'] },
    { fields: ['match_type'] },
    // Prevent duplicate matches
    {
      unique: true,
      fields: ['source_photo_id', 'target_photo_id'],
      name: 'unique_photo_match',
    },
  ],
});

module.exports = PhotoMatch;
