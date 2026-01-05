/**
 * Weight Configuration Service
 *
 * Manages ML model weights and thresholds with hot-reloading capability.
 * Caches weights in memory for performance, with TTL-based invalidation.
 */

const { ModelConfig } = require('../models');
const logger = require('../config/logger');

// In-memory cache for weights
const weightCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Default weights (fallback if database is empty)
const DEFAULT_CATEGORY_WEIGHTS = {
  pet: {
    HASH: 0.15,
    COLOR: 0.30,
    SHAPE: 0.10,
    VISUAL_FEATURES: 0.25,
    DETECTED_OBJECTS: 0.15,
    OCR: 0.05,
  },
  jewelry: {
    HASH: 0.15,
    COLOR: 0.25,
    SHAPE: 0.25,
    VISUAL_FEATURES: 0.20,
    DETECTED_OBJECTS: 0.05,
    OCR: 0.10,
  },
  electronics: {
    HASH: 0.20,
    COLOR: 0.15,
    SHAPE: 0.15,
    VISUAL_FEATURES: 0.20,
    DETECTED_OBJECTS: 0.10,
    OCR: 0.20,
  },
  documents: {
    HASH: 0.15,
    COLOR: 0.05,
    SHAPE: 0.05,
    VISUAL_FEATURES: 0.10,
    DETECTED_OBJECTS: 0.05,
    OCR: 0.60,
  },
  vehicle: {
    HASH: 0.15,
    COLOR: 0.25,
    SHAPE: 0.15,
    VISUAL_FEATURES: 0.15,
    DETECTED_OBJECTS: 0.10,
    OCR: 0.20,
  },
  other: {
    HASH: 0.20,
    COLOR: 0.25,
    SHAPE: 0.15,
    VISUAL_FEATURES: 0.25,
    DETECTED_OBJECTS: 0.10,
    OCR: 0.05,
  },
};

const DEFAULT_THRESHOLDS = {
  HASH_SIMILARITY_MIN: 40,
  COLOR_SIMILARITY_MIN: 35,
  VISUAL_SIMILARITY_MIN: 35,
  OCR_SIMILARITY_MIN: 40,
  OBJECT_SIMILARITY_MIN: 30,
  LICENSE_PLATE_EXACT: 85,
  SERIAL_NUMBER_EXACT: 90,
  OVERALL_MATCH_MIN: 30,
  HIGH_CONFIDENCE: 65,
  VERY_HIGH_CONFIDENCE: 85,
};

/**
 * Get cached value or fetch from database
 */
const getCachedValue = async (key, fetchFn) => {
  const cached = weightCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.value;
  }

  const value = await fetchFn();
  weightCache.set(key, { value, timestamp: Date.now() });
  return value;
};

/**
 * Load active weights for a specific category
 */
const loadCategoryWeights = async (category) => {
  return getCachedValue(`category_weights_${category}`, async () => {
    try {
      const config = await ModelConfig.getActiveConfig(`category_weights_${category}`);

      if (config && config.config_data) {
        logger.debug(`[WeightConfig] Loaded weights for ${category} from DB (v${config.version})`);
        return config.config_data;
      }

      // Fall back to default
      return DEFAULT_CATEGORY_WEIGHTS[category] || DEFAULT_CATEGORY_WEIGHTS.other;
    } catch (error) {
      logger.warn(`[WeightConfig] Error loading ${category} weights, using defaults:`, error.message);
      return DEFAULT_CATEGORY_WEIGHTS[category] || DEFAULT_CATEGORY_WEIGHTS.other;
    }
  });
};

/**
 * Load all category weights
 */
const loadAllCategoryWeights = async () => {
  return getCachedValue('all_category_weights', async () => {
    try {
      const config = await ModelConfig.getActiveConfig('all_category_weights');

      if (config && config.config_data) {
        logger.debug(`[WeightConfig] Loaded all category weights from DB (v${config.version})`);
        return config.config_data;
      }

      return DEFAULT_CATEGORY_WEIGHTS;
    } catch (error) {
      logger.warn('[WeightConfig] Error loading all weights, using defaults:', error.message);
      return DEFAULT_CATEGORY_WEIGHTS;
    }
  });
};

/**
 * Load matching thresholds
 */
const loadThresholds = async () => {
  return getCachedValue('thresholds', async () => {
    try {
      const config = await ModelConfig.getActiveConfig('thresholds');

      if (config && config.config_data) {
        logger.debug(`[WeightConfig] Loaded thresholds from DB (v${config.version})`);
        return { ...DEFAULT_THRESHOLDS, ...config.config_data };
      }

      return DEFAULT_THRESHOLDS;
    } catch (error) {
      logger.warn('[WeightConfig] Error loading thresholds, using defaults:', error.message);
      return DEFAULT_THRESHOLDS;
    }
  });
};

/**
 * Force reload weights from database (invalidate cache)
 */
const hotReloadWeights = () => {
  logger.info('[WeightConfig] Hot-reloading all weights');
  weightCache.clear();
};

/**
 * Invalidate specific cache entry
 */
const invalidateCache = (key) => {
  weightCache.delete(key);
  logger.debug(`[WeightConfig] Invalidated cache for: ${key}`);
};

/**
 * Save new weights to database
 */
const saveWeights = async (configName, configType, weights, trainingMetrics = {}) => {
  try {
    const config = await ModelConfig.createNewVersion(
      configName,
      configType,
      weights,
      trainingMetrics
    );

    // Invalidate cache
    invalidateCache(configName);
    invalidateCache('all_category_weights');

    logger.info(`[WeightConfig] Saved new ${configName} v${config.version}`);
    return config;
  } catch (error) {
    logger.error('[WeightConfig] Error saving weights:', error);
    throw error;
  }
};

/**
 * Get weight version info
 */
const getWeightVersions = async () => {
  const configs = await ModelConfig.findAll({
    where: { is_active: true },
    attributes: ['config_name', 'version', 'training_accuracy', 'trained_at', 'createdAt'],
  });

  return configs.reduce((acc, config) => {
    acc[config.config_name] = {
      version: config.version,
      accuracy: config.training_accuracy,
      trainedAt: config.trained_at,
      createdAt: config.createdAt,
    };
    return acc;
  }, {});
};

/**
 * Initialize default weights in database (first run)
 */
const initializeDefaultWeights = async () => {
  try {
    // Check if any weights exist
    const existingConfig = await ModelConfig.findOne();

    if (existingConfig) {
      logger.info('[WeightConfig] Weights already initialized');
      return;
    }

    // Create default category weights
    await ModelConfig.create({
      config_name: 'all_category_weights',
      config_type: 'category_weights',
      config_data: DEFAULT_CATEGORY_WEIGHTS,
      is_active: true,
      notes: 'Default weights from codebase',
    });

    // Create default thresholds
    await ModelConfig.create({
      config_name: 'thresholds',
      config_type: 'thresholds',
      config_data: DEFAULT_THRESHOLDS,
      is_active: true,
      notes: 'Default thresholds from codebase',
    });

    logger.info('[WeightConfig] Initialized default weights in database');
  } catch (error) {
    logger.error('[WeightConfig] Error initializing default weights:', error);
  }
};

module.exports = {
  loadCategoryWeights,
  loadAllCategoryWeights,
  loadThresholds,
  hotReloadWeights,
  invalidateCache,
  saveWeights,
  getWeightVersions,
  initializeDefaultWeights,
  DEFAULT_CATEGORY_WEIGHTS,
  DEFAULT_THRESHOLDS,
};
