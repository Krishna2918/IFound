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
    type: DataTypes.ENUM('unverified', 'email_verified', 'id_verified', 'law_enforcement_verified'),
    allowNull: false,
    defaultValue: 'unverified',
  },
  verification_documents: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
  },
  profile_photo_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  reputation_score: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.00,
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
  ],
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
    user_type: this.user_type,
    verification_status: this.verification_status,
    profile_photo_url: this.profile_photo_url,
    reputation_score: this.reputation_score,
    total_cases_found: this.total_cases_found,
  };
};

module.exports = User;
