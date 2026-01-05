/**
 * Visual DNA Model v2.0
 *
 * Stores multi-layered visual fingerprints for each photo.
 * Enables "magic matching" when users search by uploading photos.
 *
 * Layers:
 * - Layer 1: Quick hashes (pHash, aHash, dHash, blockHash) for fast filtering
 * - Layer 2: Deep features (DINOv2 neural embeddings, color, texture)
 * - Layer 3: Content features (OCR text, detected objects, colors)
 *
 * v2.0 Additions:
 * - Human-readable DNA ID: PET-BRN.ORG-VERT-dino7f3a-phash4c2b-Q85
 * - DINOv2 neural embeddings for semantic matching
 * - HSV color space for perceptually accurate color matching
 * - Entity classification via CLIP
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const VisualDNA = sequelize.define('VisualDNA', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  photo_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'photos',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  case_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'cases',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },

  // Entity Classification
  entity_type: {
    type: DataTypes.ENUM('person', 'pet', 'item', 'vehicle', 'document', 'unknown'),
    allowNull: false,
    defaultValue: 'unknown',
  },
  entity_confidence: {
    type: DataTypes.DECIMAL(5, 4),
    allowNull: true,
  },

  // Image DNA v1 (legacy)
  image_dna_id: {
    type: DataTypes.STRING(32),
    allowNull: true,
    comment: 'Unique identifier for the image DNA fingerprint (v1 - machine hash)',
  },
  image_dna: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Complete Image DNA with all fingerprint components',
  },

  // ============================================================
  // IMAGE DNA v2.0 - Human-Readable DNA System
  // ============================================================

  // Human-readable DNA ID: PET-BRN.ORG-VERT-dino7f3a-phash4c2b-Q85
  dna_v2_id: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: 'Human-readable DNA ID v2: ENTITY-COLORS-SHAPE-NEURAL-HASH-QUALITY',
  },

  // DINOv2 Neural Embedding (384-dimensional vector)
  neural_embedding: {
    type: DataTypes.ARRAY(DataTypes.FLOAT),
    allowNull: true,
    comment: 'DINOv2 384-dim neural embedding for semantic matching',
  },
  neural_embedding_hash: {
    type: DataTypes.STRING(16),
    allowNull: true,
    comment: '8-char hash of neural embedding for DNA ID',
  },

  // Color DNA (HSV-based)
  color_code: {
    type: DataTypes.STRING(16),
    allowNull: true,
    comment: 'Short color code like BRN.ORG for DNA ID',
  },
  hsv_color_data: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'HSV color histograms and dominant colors',
  },

  // Shape DNA
  shape_code: {
    type: DataTypes.STRING(8),
    allowNull: true,
    comment: 'Shape code: VERT, HORZ, SQR for DNA ID',
  },

  // Searchable fields (for fast filtering before similarity search)
  searchable_colors: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    comment: 'Array of color names for filtering',
  },
  quality_tier: {
    type: DataTypes.ENUM('high', 'medium', 'low'),
    allowNull: true,
  },

  // DNA v2 full data
  dna_v2_full: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Complete DNA v2 object with all fingerprints',
  },

  // Layer 1: Perceptual Hashes (for fast Hamming distance matching)
  perceptual_hash: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  average_hash: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  difference_hash: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  block_hash: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: 'Block mean hash for crop detection',
  },

  // Layer 2: Deep Feature Embeddings
  face_embedding: {
    type: DataTypes.ARRAY(DataTypes.FLOAT),
    allowNull: true,
  },
  object_features: {
    type: DataTypes.ARRAY(DataTypes.FLOAT),
    allowNull: true,
  },
  color_signature: {
    type: DataTypes.ARRAY(DataTypes.FLOAT),
    allowNull: true,
  },
  texture_features: {
    type: DataTypes.ARRAY(DataTypes.FLOAT),
    allowNull: true,
  },

  // Layer 3: Content Features
  ocr_text: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ocr_confidence: {
    type: DataTypes.DECIMAL(5, 4),
    allowNull: true,
  },
  detected_objects: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
  },
  detected_labels: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
  },
  dominant_colors: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
  },
  average_color: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Average RGB color of the image',
  },
  color_histograms: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'RGB color histograms from Image DNA',
  },

  // NEW: Edge and Shape Fingerprints
  edge_fingerprint: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Edge detection fingerprint (Sobel-based)',
  },
  shape_signature: {
    type: DataTypes.ARRAY(DataTypes.FLOAT),
    allowNull: true,
    comment: 'Shape/silhouette signature vector',
  },
  shape_data: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Shape metrics (aspect ratio, edge density, contours)',
  },

  // NEW: Texture Fingerprint
  texture_fingerprint: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Texture analysis (pattern type, complexity, uniformity)',
  },

  // Composite Visual Fingerprint
  visual_fingerprint: {
    type: DataTypes.STRING(256),
    allowNull: true,
  },

  // Matching Metadata
  match_hints: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
  },

  // Quality & Status
  quality_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0,
      max: 100,
    },
  },
  processing_status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'partial'),
    allowNull: false,
    defaultValue: 'pending',
  },
  processing_error: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  processing_time_ms: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  // Version for algorithm updates
  algorithm_version: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: '1.0.0',
  },
}, {
  tableName: 'visual_dna',
  indexes: [
    // Image DNA ID lookup (v1)
    { fields: ['image_dna_id'] },
    // DNA v2 ID lookup (human-readable)
    { fields: ['dna_v2_id'] },
    // Fast hash lookups
    { fields: ['perceptual_hash'] },
    { fields: ['average_hash'] },
    { fields: ['difference_hash'] },
    { fields: ['block_hash'] },
    { fields: ['neural_embedding_hash'] },
    // Relationship lookups
    { fields: ['photo_id'], unique: true },
    { fields: ['case_id'] },
    // Filtering
    { fields: ['entity_type'] },
    { fields: ['processing_status'] },
    { fields: ['quality_tier'] },
    { fields: ['color_code'] },
    { fields: ['shape_code'] },
    // GIN index for color array search
    {
      fields: ['searchable_colors'],
      using: 'gin',
      name: 'visual_dna_searchable_colors_gin',
    },
    // Full-text search on OCR
    {
      fields: ['ocr_text'],
      using: 'gin',
      operator: 'gin_trgm_ops',
      name: 'visual_dna_ocr_text_trgm',
    },
  ],
  hooks: {
    beforeCreate: (instance) => {
      // Generate composite fingerprint from available hashes
      const hashes = [
        instance.perceptual_hash,
        instance.average_hash,
        instance.difference_hash,
      ].filter(Boolean);

      if (hashes.length > 0) {
        instance.visual_fingerprint = hashes.join('-');
      }
    },
    beforeUpdate: (instance) => {
      if (instance.changed('perceptual_hash') ||
          instance.changed('average_hash') ||
          instance.changed('difference_hash')) {
        const hashes = [
          instance.perceptual_hash,
          instance.average_hash,
          instance.difference_hash,
        ].filter(Boolean);

        if (hashes.length > 0) {
          instance.visual_fingerprint = hashes.join('-');
        }
      }
    },
  },
});

module.exports = VisualDNA;
