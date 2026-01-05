const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Photo = sequelize.define('Photo', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
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
  image_url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  thumbnail_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  image_hash: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  file_size: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  mime_type: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  width: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  height: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  is_primary: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  caption: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // AI/ML Data
  face_vector: {
    type: DataTypes.ARRAY(DataTypes.FLOAT),
    allowNull: true,
  },
  face_detected: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  ai_confidence_score: {
    type: DataTypes.DECIMAL(5, 4),
    allowNull: true,
  },
  ai_metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {
      labels: [],
      colors: [],
      faces_count: 0,
      objects_detected: [],
    },
  },
  image_features: {
    type: DataTypes.ARRAY(DataTypes.FLOAT),
    allowNull: true,
  },
  // AWS Rekognition IDs
  aws_face_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  aws_s3_key: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  upload_status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
    allowNull: false,
    defaultValue: 'pending',
  },
  upload_error: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'photos',
  indexes: [
    { fields: ['case_id'] },
    { fields: ['is_primary'] },
    { fields: ['face_detected'] },
  ],
});

module.exports = Photo;
