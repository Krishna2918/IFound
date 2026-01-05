const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Submission = sequelize.define('Submission', {
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
  finder_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  submission_type: {
    type: DataTypes.ENUM('tip', 'photo', 'video', 'location', 'sighting'),
    allowNull: false,
  },
  is_anonymous: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  media_urls: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: [],
  },
  location_data: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {
      latitude: null,
      longitude: null,
      address: null,
      accuracy: null,
      timestamp: null,
    },
  },
  verification_status: {
    type: DataTypes.ENUM('pending', 'reviewing', 'verified', 'rejected', 'duplicate'),
    allowNull: false,
    defaultValue: 'pending',
  },
  verification_level: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    validate: {
      min: 1,
      max: 4,
    },
  },
  confidence_score: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
  bounty_percentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.00,
    validate: {
      min: 0,
      max: 100,
    },
  },
  reviewer_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  reviewed_by: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  reviewed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  ip_address: {
    type: DataTypes.INET,
    allowNull: true,
  },
  user_agent: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
  },
}, {
  tableName: 'submissions',
  indexes: [
    { fields: ['case_id'] },
    { fields: ['finder_id'] },
    { fields: ['verification_status'] },
    { fields: ['created_at'] },
  ],
});

module.exports = Submission;
