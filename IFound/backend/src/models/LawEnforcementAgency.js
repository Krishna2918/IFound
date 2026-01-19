/**
 * Law Enforcement Agency Model
 *
 * Represents verified law enforcement agencies that can:
 * - Access priority case information
 * - Bulk import cases from their databases
 * - Flag cases as priority/sensitive
 * - Generate compliance reports
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LawEnforcementAgency = sequelize.define('LawEnforcementAgency', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Official agency name',
  },
  agency_type: {
    type: DataTypes.ENUM(
      'police_department',
      'sheriff_office',
      'state_police',
      'federal_agency',
      'campus_security',
      'transit_authority',
      'other'
    ),
    allowNull: false,
  },
  jurisdiction: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Geographic jurisdiction (city, county, state, federal)',
  },
  badge_number_prefix: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Agency badge number prefix for verification',
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  city: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  state: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  zip_code: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  country: {
    type: DataTypes.STRING(100),
    defaultValue: 'United States',
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      isEmail: true,
    },
  },
  website: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  verification_status: {
    type: DataTypes.ENUM('pending', 'verified', 'rejected', 'suspended'),
    defaultValue: 'pending',
  },
  verified_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  verified_by: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Admin user who verified the agency',
  },
  api_key: {
    type: DataTypes.STRING(64),
    allowNull: true,
    unique: true,
    comment: 'API key for programmatic access',
  },
  api_key_expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  allowed_case_types: {
    type: DataTypes.JSON,
    defaultValue: ['missing_person', 'lost_item', 'pet'],
    comment: 'Case types this agency can access',
  },
  can_bulk_import: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Permission to bulk import cases',
  },
  can_flag_priority: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Permission to flag cases as priority',
  },
  monthly_case_limit: {
    type: DataTypes.INTEGER,
    defaultValue: 100,
    comment: 'Maximum cases agency can create per month',
  },
  cases_created_this_month: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  last_case_reset: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Internal admin notes',
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'law_enforcement_agencies',
  timestamps: true,
  paranoid: true,
  indexes: [
    { fields: ['verification_status'] },
    { fields: ['agency_type'] },
    { fields: ['state', 'city'] },
    { fields: ['api_key'], unique: true },
    { fields: ['is_active'] },
  ],
});

module.exports = LawEnforcementAgency;
