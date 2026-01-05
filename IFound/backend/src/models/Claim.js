/**
 * Claim Model
 *
 * Represents a claim made by an owner on a found item.
 * This handles the scenario where a finder posts first, and the owner
 * later sees the post and claims it as theirs.
 *
 * Flow:
 * 1. Finder posts "Found Item" (Case with case_type='found_item')
 * 2. Owner sees it, clicks "This Is Mine!"
 * 3. Owner creates a Claim with verification details + bounty offer
 * 4. Finder reviews claim, can ask verification questions
 * 5. Finder accepts/rejects claim
 * 6. If accepted: Chat opens, handover arranged, bounty released
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Claim = sequelize.define('Claim', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },

  // The found_item case being claimed
  found_case_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'cases',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },

  // The user claiming the item (owner)
  claimant_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },

  // Optional: Link to a lost_item case if owner created one
  // This connects the claim to an existing lost item post
  lost_case_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'cases',
      key: 'id',
    },
    onDelete: 'SET NULL',
  },

  // Verification details provided by claimant
  verification_description: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Owner describes the item to prove ownership (e.g., contents of wallet, unique marks)',
  },

  // Optional proof photo uploaded by claimant
  proof_photo_url: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'URL to proof photo (e.g., photo of matching item, receipt, etc.)',
  },

  // Bounty/Finder's fee offered
  bounty_offered: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0,
      max: 50, // $50 CAD max
    },
  },

  // Claim status
  status: {
    type: DataTypes.ENUM(
      'pending',           // Waiting for finder to review
      'under_review',      // Finder is reviewing/asking questions
      'accepted',          // Finder accepted the claim
      'rejected',          // Finder rejected the claim
      'completed',         // Handover completed, bounty paid
      'cancelled',         // Claimant cancelled
      'disputed'           // Dispute raised
    ),
    allowNull: false,
    defaultValue: 'pending',
  },

  // Finder's response/notes
  finder_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Notes from finder about why they accepted/rejected',
  },

  // Rejection reason (if rejected)
  rejection_reason: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  // Verification questions asked by finder
  verification_questions: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of {question, answer, askedAt, answeredAt}',
  },

  // Handover details
  handover_location: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: null,
    comment: 'Agreed meetup location {address, lat, lng, time}',
  },

  handover_confirmed_by_finder: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },

  handover_confirmed_by_claimant: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },

  handover_completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  // Payment tracking
  payment_status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'refunded'),
    allowNull: false,
    defaultValue: 'pending',
  },

  payment_transaction_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'transactions',
      key: 'id',
    },
  },

  // Timestamps
  accepted_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  rejected_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  // Chat/communication
  chat_enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Chat opens when claim is accepted',
  },

}, {
  tableName: 'claims',
  indexes: [
    { fields: ['found_case_id'] },
    { fields: ['claimant_id'] },
    { fields: ['lost_case_id'] },
    { fields: ['status'] },
    { fields: ['created_at'] },
    // Prevent duplicate claims from same user on same item
    {
      fields: ['found_case_id', 'claimant_id'],
      unique: true,
      name: 'unique_claim_per_user_per_case',
    },
  ],
});

module.exports = Claim;
