const { sequelize } = require('../config/database');
const User = require('./User');
const Case = require('./Case');
const Photo = require('./Photo');
const Submission = require('./Submission');
const Transaction = require('./Transaction');
const VisualDNA = require('./VisualDNA');
const PhotoMatch = require('./PhotoMatch');
const Claim = require('./Claim');
const Message = require('./Message');
const MatchFeedback = require('./MatchFeedback');
const TrainingPair = require('./TrainingPair');
const ModelConfig = require('./ModelConfig');

// Define Associations

// User associations
User.hasMany(Case, { foreignKey: 'poster_id', as: 'posted_cases' });
User.hasMany(Submission, { foreignKey: 'finder_id', as: 'submissions' });
User.hasMany(Transaction, { foreignKey: 'finder_id', as: 'received_transactions' });
User.hasMany(Transaction, { foreignKey: 'poster_id', as: 'paid_transactions' });

// Case associations
Case.belongsTo(User, { foreignKey: 'poster_id', as: 'poster' });
Case.belongsTo(User, { foreignKey: 'resolved_by', as: 'resolver' });
Case.hasMany(Photo, { foreignKey: 'case_id', as: 'photos' });
Case.hasMany(Submission, { foreignKey: 'case_id', as: 'submissions' });
Case.hasMany(Transaction, { foreignKey: 'case_id', as: 'transactions' });

// Photo associations
Photo.belongsTo(Case, { foreignKey: 'case_id', as: 'case' });
Photo.hasOne(VisualDNA, { foreignKey: 'photo_id', as: 'visualDNA' });

// VisualDNA associations
VisualDNA.belongsTo(Photo, { foreignKey: 'photo_id', as: 'photo' });
VisualDNA.belongsTo(Case, { foreignKey: 'case_id', as: 'case' });
Case.hasMany(VisualDNA, { foreignKey: 'case_id', as: 'visualDNAs' });

// PhotoMatch associations
PhotoMatch.belongsTo(Photo, { foreignKey: 'source_photo_id', as: 'sourcePhoto' });
PhotoMatch.belongsTo(Photo, { foreignKey: 'target_photo_id', as: 'targetPhoto' });
PhotoMatch.belongsTo(Case, { foreignKey: 'source_case_id', as: 'sourceCase' });
PhotoMatch.belongsTo(Case, { foreignKey: 'target_case_id', as: 'targetCase' });
Case.hasMany(PhotoMatch, { foreignKey: 'source_case_id', as: 'sourceMatches' });
Case.hasMany(PhotoMatch, { foreignKey: 'target_case_id', as: 'targetMatches' });

// Submission associations
Submission.belongsTo(Case, { foreignKey: 'case_id', as: 'case' });
Submission.belongsTo(User, { foreignKey: 'finder_id', as: 'finder' });
Submission.belongsTo(User, { foreignKey: 'reviewed_by', as: 'reviewer' });
Submission.hasMany(Transaction, { foreignKey: 'submission_id', as: 'transactions' });

// Transaction associations
Transaction.belongsTo(Case, { foreignKey: 'case_id', as: 'case' });
Transaction.belongsTo(Submission, { foreignKey: 'submission_id', as: 'submission' });
Transaction.belongsTo(User, { foreignKey: 'finder_id', as: 'finder' });
Transaction.belongsTo(User, { foreignKey: 'poster_id', as: 'poster' });

// Claim associations
Claim.belongsTo(Case, { foreignKey: 'found_case_id', as: 'foundCase' });
Claim.belongsTo(Case, { foreignKey: 'lost_case_id', as: 'lostCase' });
Claim.belongsTo(User, { foreignKey: 'claimant_id', as: 'claimant' });
Claim.belongsTo(Transaction, { foreignKey: 'payment_transaction_id', as: 'paymentTransaction' });
Case.hasMany(Claim, { foreignKey: 'found_case_id', as: 'claims' });
User.hasMany(Claim, { foreignKey: 'claimant_id', as: 'myClaims' });

// Message associations
Message.belongsTo(Claim, { foreignKey: 'claim_id', as: 'claim' });
Message.belongsTo(User, { foreignKey: 'sender_id', as: 'sender' });
Claim.hasMany(Message, { foreignKey: 'claim_id', as: 'messages' });
User.hasMany(Message, { foreignKey: 'sender_id', as: 'sentMessages' });

// MatchFeedback associations
MatchFeedback.belongsTo(PhotoMatch, { foreignKey: 'photo_match_id', as: 'match' });
MatchFeedback.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
PhotoMatch.hasMany(MatchFeedback, { foreignKey: 'photo_match_id', as: 'feedback' });
User.hasMany(MatchFeedback, { foreignKey: 'user_id', as: 'matchFeedback' });

// TrainingPair associations
TrainingPair.belongsTo(VisualDNA, { foreignKey: 'source_visual_dna_id', as: 'sourceVisualDNA' });
TrainingPair.belongsTo(VisualDNA, { foreignKey: 'target_visual_dna_id', as: 'targetVisualDNA' });
TrainingPair.belongsTo(PhotoMatch, { foreignKey: 'original_match_id', as: 'originalMatch' });
VisualDNA.hasMany(TrainingPair, { foreignKey: 'source_visual_dna_id', as: 'sourceTrainingPairs' });
VisualDNA.hasMany(TrainingPair, { foreignKey: 'target_visual_dna_id', as: 'targetTrainingPairs' });

// ModelConfig self-referencing for version history
ModelConfig.belongsTo(ModelConfig, { foreignKey: 'parent_config_id', as: 'parentConfig' });
ModelConfig.hasMany(ModelConfig, { foreignKey: 'parent_config_id', as: 'childConfigs' });
ModelConfig.belongsTo(User, { foreignKey: 'approved_by', as: 'approver' });

// Add new enum value if it doesn't exist (for PostgreSQL)
const updateEnumType = async () => {
  try {
    // Check if 'found_item' exists in the enum
    const [results] = await sequelize.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'found_item'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_cases_case_type')
      ) as exists
    `);

    if (!results[0]?.exists) {
      // Add 'found_item' to the enum
      await sequelize.query(`ALTER TYPE "enum_cases_case_type" ADD VALUE IF NOT EXISTS 'found_item'`);
      console.log('✅ Added found_item to case_type enum.');
    }
  } catch (error) {
    // Enum might not exist yet (first run), which is fine
    if (!error.message.includes('does not exist')) {
      console.warn('Warning updating enum:', error.message);
    }
  }
};

// Sync database
const syncDatabase = async (options = {}) => {
  try {
    // Update enum types first (for existing databases)
    await updateEnumType();

    await sequelize.sync(options);
    console.log('✅ Database synchronized successfully.');
  } catch (error) {
    console.error('❌ Error synchronizing database:', error);
    throw error;
  }
};

module.exports = {
  sequelize,
  User,
  Case,
  Photo,
  Submission,
  Transaction,
  VisualDNA,
  PhotoMatch,
  Claim,
  Message,
  MatchFeedback,
  TrainingPair,
  ModelConfig,
  syncDatabase,
};
