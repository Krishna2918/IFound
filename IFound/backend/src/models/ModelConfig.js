/**
 * ModelConfig Model
 *
 * Stores ML model configurations, weights, and thresholds.
 * Allows hot-reloading of trained weights without code deployment.
 * Tracks training history and accuracy metrics.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ModelConfig = sequelize.define('ModelConfig', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },

  // Configuration name (e.g., 'category_weights', 'thresholds', 'pet_weights')
  config_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  // Version for tracking changes
  version: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },

  // Type of configuration
  config_type: {
    type: DataTypes.ENUM('weights', 'thresholds', 'category_weights', 'neural_config'),
    allowNull: false,
  },

  // The actual configuration data
  config_data: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: 'The weight/threshold values',
  },

  // Is this the active configuration?
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },

  // Training metrics
  training_accuracy: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Accuracy on training data',
  },

  validation_accuracy: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Accuracy on validation data',
  },

  test_accuracy: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Accuracy on test data',
  },

  // Confusion matrix stats
  precision: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },

  recall: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },

  f1_score: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },

  // Training metadata
  training_samples: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Number of training samples used',
  },

  training_batch_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  // When this was trained
  trained_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  // Who approved this config for production
  approved_by: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
    onDelete: 'SET NULL',
  },

  approved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  // Notes about this configuration
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  // Previous version this was based on
  parent_config_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'model_configs',
      key: 'id',
    },
    onDelete: 'SET NULL',
  },

}, {
  tableName: 'model_configs',
  underscored: true,
  indexes: [
    { fields: ['config_name'] },
    { fields: ['config_type'] },
    { fields: ['is_active'] },
    { fields: ['version'] },
    // Only one active config per name
    {
      unique: true,
      fields: ['config_name', 'is_active'],
      where: { is_active: true },
      name: 'unique_active_config',
    },
  ],
});

// Class method to get active config by name
ModelConfig.getActiveConfig = async function(configName) {
  return await this.findOne({
    where: {
      config_name: configName,
      is_active: true,
    },
    order: [['version', 'DESC']],
  });
};

// Class method to create new version and set as active
ModelConfig.createNewVersion = async function(configName, configType, configData, trainingMetrics = {}) {
  const transaction = await sequelize.transaction();

  try {
    // Get current version
    const currentActive = await this.findOne({
      where: { config_name: configName, is_active: true },
      transaction,
    });

    const newVersion = currentActive ? currentActive.version + 1 : 1;

    // Deactivate current
    if (currentActive) {
      await currentActive.update({ is_active: false }, { transaction });
    }

    // Create new version
    const newConfig = await this.create({
      config_name: configName,
      config_type: configType,
      config_data: configData,
      version: newVersion,
      is_active: true,
      parent_config_id: currentActive?.id,
      ...trainingMetrics,
    }, { transaction });

    await transaction.commit();
    return newConfig;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

module.exports = ModelConfig;
