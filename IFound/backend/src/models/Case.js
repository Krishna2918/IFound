const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Case = sequelize.define('Case', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  poster_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  case_type: {
    type: DataTypes.ENUM('criminal', 'missing_person', 'lost_item', 'found_item'),
    allowNull: false,
  },
  case_number: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  status: {
    // Lifecycle: active -> claimed -> in_progress -> completed -> archived
    type: DataTypes.ENUM('active', 'claimed', 'in_progress', 'completed', 'archived', 'resolved', 'expired', 'suspended'),
    allowNull: false,
    defaultValue: 'active',
  },
  priority_level: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    allowNull: false,
    defaultValue: 'medium',
  },
  bounty_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0,
    },
  },
  platform_commission: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  // Subject Information
  subject_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  subject_aliases: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: [],
  },
  subject_age: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  subject_dob: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  physical_description: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {
      height: null,
      weight: null,
      hair_color: null,
      eye_color: null,
      distinguishing_marks: [],
      clothing: null,
    },
  },
  // Location Information
  last_seen_location: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {
      address: null,
      city: null,
      state: null,
      country: null,
      latitude: null,
      longitude: null,
    },
  },
  last_seen_date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  search_radius: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 50, // miles
  },
  // For Criminals
  charges: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: [],
  },
  danger_level: {
    type: DataTypes.ENUM('not_dangerous', 'potentially_dangerous', 'armed_and_dangerous'),
    allowNull: true,
  },
  jurisdictional_info: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  // For Lost Items
  item_category: {
    type: DataTypes.ENUM('pet', 'jewelry', 'electronics', 'documents', 'vehicle', 'other'),
    allowNull: true,
  },
  item_value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  serial_numbers: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: [],
  },
  // Medical/Safety Information
  medical_conditions: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  special_circumstances: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // Contact Information
  contact_info: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {
      phone: null,
      email: null,
      agency_name: null,
      case_officer: null,
    },
  },
  // Metadata
  view_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  share_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  submission_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  is_featured: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  resolved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  resolved_by: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
  },
}, {
  tableName: 'cases',
  indexes: [
    { fields: ['poster_id'] },
    { fields: ['case_type'] },
    { fields: ['status'] },
    { fields: ['priority_level'] },
    { fields: ['created_at'] },
    {
      fields: ['case_number'],
      unique: true,
      where: {
        case_number: {
          [sequelize.Sequelize.Op.ne]: null
        }
      }
    },
  ],
});

module.exports = Case;
