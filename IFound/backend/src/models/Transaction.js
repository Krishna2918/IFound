const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Transaction = sequelize.define('Transaction', {
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
  },
  submission_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'submissions',
      key: 'id',
    },
  },
  finder_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  poster_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  transaction_type: {
    type: DataTypes.ENUM('bounty_payment', 'refund', 'commission', 'withdrawal'),
    allowNull: false,
  },
  amount: {
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
  net_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0,
    },
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD',
  },
  status: {
    type: DataTypes.ENUM('pending', 'escrow', 'processing', 'completed', 'failed', 'refunded', 'cancelled', 'disputed'),
    allowNull: false,
    defaultValue: 'pending',
  },
  payment_method: {
    type: DataTypes.ENUM('stripe', 'paypal', 'bank_transfer', 'cryptocurrency'),
    allowNull: false,
    defaultValue: 'stripe',
  },
  // Stripe Data
  stripe_payment_intent_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  stripe_transfer_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  stripe_payout_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // Payment Details
  escrow_released_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  failed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  failure_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  refunded_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  refund_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
  },
}, {
  tableName: 'transactions',
  indexes: [
    { fields: ['case_id'] },
    { fields: ['finder_id'] },
    { fields: ['poster_id'] },
    { fields: ['status'] },
    { fields: ['transaction_type'] },
    { fields: ['created_at'] },
  ],
});

// Hook to calculate net amount before save
Transaction.beforeSave(async (transaction) => {
  if (transaction.changed('amount') || transaction.changed('platform_commission')) {
    transaction.net_amount = parseFloat(transaction.amount) - parseFloat(transaction.platform_commission);
  }
});

module.exports = Transaction;
