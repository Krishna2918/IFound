/**
 * Law Enforcement Officer Model
 *
 * Represents individual officers from verified agencies who can:
 * - Login to the law enforcement portal
 * - View and manage cases
 * - Import cases on behalf of their agency
 * - Generate reports
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

const LawEnforcementOfficer = sequelize.define('LawEnforcementOfficer', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  agency_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'law_enforcement_agencies',
      key: 'id',
    },
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  first_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  last_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  badge_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  rank: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Officer rank/title',
  },
  department: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Department within the agency',
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  role: {
    type: DataTypes.ENUM('officer', 'supervisor', 'admin'),
    defaultValue: 'officer',
    comment: 'Role within the LE portal',
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
    comment: 'Agency admin or platform admin who verified',
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  login_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  failed_login_attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  locked_until: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  password_changed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  require_password_change: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Force password change on next login',
  },
  two_factor_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  two_factor_secret: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  permissions: {
    type: DataTypes.JSON,
    defaultValue: {
      view_cases: true,
      create_cases: true,
      update_cases: false,
      delete_cases: false,
      bulk_import: false,
      flag_priority: false,
      view_reports: true,
      generate_reports: false,
      manage_officers: false,
    },
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'law_enforcement_officers',
  timestamps: true,
  paranoid: true,
  indexes: [
    { fields: ['agency_id'] },
    { fields: ['email'], unique: true },
    { fields: ['badge_number'] },
    { fields: ['verification_status'] },
    { fields: ['is_active'] },
  ],
  hooks: {
    beforeCreate: async (officer) => {
      if (officer.password_hash && !officer.password_hash.startsWith('$2')) {
        officer.password_hash = await bcrypt.hash(officer.password_hash, 12);
      }
    },
    beforeUpdate: async (officer) => {
      if (officer.changed('password_hash') && !officer.password_hash.startsWith('$2')) {
        officer.password_hash = await bcrypt.hash(officer.password_hash, 12);
        officer.password_changed_at = new Date();
        officer.require_password_change = false;
      }
    },
  },
});

// Instance methods
LawEnforcementOfficer.prototype.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password_hash);
};

LawEnforcementOfficer.prototype.hasPermission = function(permission) {
  return this.permissions && this.permissions[permission] === true;
};

LawEnforcementOfficer.prototype.isLocked = function() {
  return this.locked_until && new Date() < new Date(this.locked_until);
};

LawEnforcementOfficer.prototype.recordLogin = async function() {
  this.last_login = new Date();
  this.login_count += 1;
  this.failed_login_attempts = 0;
  await this.save();
};

LawEnforcementOfficer.prototype.recordFailedLogin = async function() {
  this.failed_login_attempts += 1;

  // Lock account after 5 failed attempts for 30 minutes
  if (this.failed_login_attempts >= 5) {
    this.locked_until = new Date(Date.now() + 30 * 60 * 1000);
  }

  await this.save();
};

module.exports = LawEnforcementOfficer;
