const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  phone_number: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  password_hash: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  first_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  last_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  user_type: {
    type: DataTypes.ENUM('finder', 'poster', 'law_enforcement', 'admin'),
    allowNull: false,
    defaultValue: 'finder',
  },
  verification_status: {
    type: DataTypes.ENUM('unverified', 'email_verified', 'phone_verified', 'id_verified', 'law_enforcement'),
    allowNull: false,
    defaultValue: 'unverified',
  },
  verification_documents: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
  },
  // Email verification
  email_verified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  email_verification_code: {
    type: DataTypes.STRING(6),
    allowNull: true,
  },
  email_verification_expires: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Phone verification
  phone_verified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  phone_verification_code: {
    type: DataTypes.STRING(6),
    allowNull: true,
  },
  phone_verification_expires: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // ID verification (Stripe Identity)
  stripe_identity_session_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  id_verified_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Law enforcement verification
  le_badge_number: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  le_department: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  le_rank: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  le_supervisor_email: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  le_verification_status: {
    type: DataTypes.ENUM('none', 'pending', 'approved', 'rejected'),
    allowNull: false,
    defaultValue: 'none',
  },
  le_verified_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  le_verified_by: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  le_rejection_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  profile_photo_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  reputation_score: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 50, // Starting score
  },
  reputation_updated_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  fraud_score: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0, // 0-100, higher is more suspicious
  },
  total_earnings: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  total_cases_found: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  stripe_customer_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  stripe_account_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  is_suspended: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  last_login_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  settings: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {
      notifications: {
        push: true,
        email: true,
        sms: false,
      },
      privacy: {
        show_profile: true,
        share_location: false,
      },
      search_radius: 50, // miles
      min_bounty_threshold: 0,
    },
  },
}, {
  tableName: 'users',
  indexes: [
    { fields: ['email'] },
    { fields: ['user_type'] },
    { fields: ['verification_status'] },
    { fields: ['le_verification_status'] },
    { fields: ['reputation_score'] },
    { fields: ['fraud_score'] },
  ],
  getterMethods: {
    full_name() {
      const parts = [];
      if (this.first_name) parts.push(this.first_name);
      if (this.last_name) parts.push(this.last_name);
      return parts.length > 0 ? parts.join(' ') : this.email.split('@')[0];
    },
  },
});

// Hash password before saving
User.beforeCreate(async (user) => {
  if (user.password_hash) {
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 10);
    user.password_hash = await bcrypt.hash(user.password_hash, salt);
  }
});

User.beforeUpdate(async (user) => {
  if (user.changed('password_hash')) {
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 10);
    user.password_hash = await bcrypt.hash(user.password_hash, salt);
  }
});

// Instance method to validate password
User.prototype.validatePassword = async function(password) {
  return bcrypt.compare(password, this.password_hash);
};

// Instance method to get public profile
User.prototype.toPublicJSON = function() {
  return {
    id: this.id,
    first_name: this.first_name,
    last_name: this.last_name,
    full_name: this.full_name,
    user_type: this.user_type,
    verification_status: this.verification_status,
    profile_photo_url: this.profile_photo_url,
    reputation_score: this.reputation_score,
    total_cases_found: this.total_cases_found,
    verification: {
      email: this.email_verified,
      phone: this.phone_verified,
      id: this.verification_status === 'id_verified',
      lawEnforcement: this.verification_status === 'law_enforcement',
    },
    memberSince: this.createdAt,
  };
};

module.exports = User;
