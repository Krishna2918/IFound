/**
 * Neural Embedding Service
 *
 * Uses DINOv2 (via @xenova/transformers) to generate deep visual embeddings.
 * DINOv2 was trained on 142M images without labels and captures semantic
 * meaning - two photos of the same object will have similar embeddings.
 *
 * This enables "magic matching" where visually similar images are found
 * even if they're taken from different angles, lighting, or cameras.
 */

const logger = require('../utils/logger');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Check if neural models are disabled (useful for Windows where native libs can crash)
const NEURAL_DISABLED = process.env.DISABLE_NEURAL_MODELS === 'true';

let pipelineModule = null;
let envModule = null;

// Only load transformers.js if not disabled
if (!NEURAL_DISABLED) {
  try {
    const transformers = require('@xenova/transformers');
    pipelineModule = transformers.pipeline;
    envModule = transformers.env;

    // Configure transformers.js
    envModule.cacheDir = './.cache/transformers';
    envModule.localModelPath = './.cache/transformers';
    envModule.allowRemoteModels = true;
  } catch (error) {
    logger.warn('[NeuralEmbed] Failed to load transformers.js:', error.message);
  }
} else {
  logger.info('[NeuralEmbed] Neural models disabled via DISABLE_NEURAL_MODELS=true');
}

// Model configuration - using image-specific models
const MODELS = {
  // Using a vision encoder for image embeddings
  // Note: DINOv2 in transformers.js requires image-feature-extraction task
  DINO_SMALL: 'Xenova/vit-base-patch16-224-in21k', // General vision transformer
  // Alternative: ResNet for feature extraction
  RESNET: 'Xenova/resnet-50',
  // CLIP for entity classification - 605MB
  CLIP: 'Xenova/clip-vit-base-patch32',
};

// Entity labels for classification
const ENTITY_LABELS = [
  'a photo of a pet dog or cat',
  'a photo of a person',
  'a photo of a vehicle like a car, motorcycle, or bicycle',
  'a photo of a document, ID card, or license',
  'a photo of an item, object, or belonging',
  'a photo of jewelry or accessory',
  'a photo of electronics like phone, laptop, or camera',
  'a photo of keys or keychain',
  'a photo of a wallet or purse',
  'a photo of a bag or backpack',
];

const ENTITY_MAP = {
  0: 'pet',
  1: 'person',
  2: 'vehicle',
  3: 'document',
  4: 'item',
  5: 'item',      // jewelry -> item
  6: 'item',      // electronics -> item
  7: 'item',      // keys -> item
  8: 'item',      // wallet -> item
  9: 'item',      // bag -> item
};

// Singleton instances
let dinoExtractor = null;
let clipClassifier = null;
let isInitializing = false;
let initPromise = null;

/**
 * Initialize the Vision feature extractor
 * Downloads model on first use (~350MB for ViT, cached afterward)
 */
const initializeDINO = async () => {
  // Skip if neural models are disabled or transformers.js failed to load
  if (NEURAL_DISABLED || !pipelineModule) {
    logger.debug('[NeuralEmbed] Vision model skipped (disabled or unavailable)');
    return null;
  }

  if (dinoExtractor) return dinoExtractor;

  if (isInitializing && initPromise) {
    return await initPromise;
  }

  isInitializing = true;

  initPromise = (async () => {
    try {
      logger.info('[NeuralEmbed] Initializing Vision model (first run downloads ~350MB)...');
      const startTime = Date.now();

      // Use image-feature-extraction pipeline for vision models
      dinoExtractor = await pipelineModule('image-feature-extraction', MODELS.DINO_SMALL, {
        quantized: true, // Use quantized model for faster inference
      });

      const loadTime = Date.now() - startTime;
      logger.info(`[NeuralEmbed] Vision model loaded in ${loadTime}ms`);

      return dinoExtractor;
    } catch (error) {
      logger.error('[NeuralEmbed] Failed to initialize Vision model:', error);
      isInitializing = false;
      initPromise = null;
      throw error;
    }
  })();

  return await initPromise;
};

/**
 * Initialize CLIP for entity classification
 */
const initializeCLIP = async () => {
  // Skip if neural models are disabled or transformers.js failed to load
  if (NEURAL_DISABLED || !pipelineModule) {
    logger.debug('[NeuralEmbed] CLIP classifier skipped (disabled or unavailable)');
    return null;
  }

  if (clipClassifier) return clipClassifier;

  try {
    logger.info('[NeuralEmbed] Initializing CLIP classifier (first run downloads ~600MB)...');
    const startTime = Date.now();

    clipClassifier = await pipelineModule('zero-shot-image-classification', MODELS.CLIP);

    const loadTime = Date.now() - startTime;
    logger.info(`[NeuralEmbed] CLIP classifier loaded in ${loadTime}ms`);

    return clipClassifier;
  } catch (error) {
    logger.error('[NeuralEmbed] Failed to initialize CLIP:', error);
    throw error;
  }
};

/**
 * Convert Buffer to a RawImage or temporary file path for transformers.js
 */
const prepareImageInput = async (imageInput) => {
  if (typeof imageInput === 'string') {
    // It's already a path or URL
    return imageInput;
  }

  if (Buffer.isBuffer(imageInput)) {
    // Save buffer to temp file for processing
    const tempPath = path.join(os.tmpdir(), `ifound_img_${Date.now()}.jpg`);
    fs.writeFileSync(tempPath, imageInput);
    return tempPath;
  }

  return imageInput;
};

/**
 * Clean up temporary file if needed
 */
const cleanupTempFile = (filePath, originalInput) => {
  // Only delete if we created a temp file (original was a Buffer)
  if (Buffer.isBuffer(originalInput) && filePath.startsWith(os.tmpdir())) {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
};

/**
 * Generate Vision Transformer embedding for an image
 *
 * @param {Buffer|string} imageInput - Image buffer or file path
 * @returns {Object} - Neural embedding data
 */
const generateEmbedding = async (imageInput) => {
  // Early return if neural is disabled
  if (NEURAL_DISABLED || !pipelineModule) {
    return {
      embedding: null,
      embeddingHash: null,
      error: 'Neural models disabled',
    };
  }

  let imagePath = null;

  try {
    const startTime = Date.now();

    // Prepare image input
    imagePath = await prepareImageInput(imageInput);

    // Initialize model if needed
    const extractor = await initializeDINO();

    // If extractor is null, return early
    if (!extractor) {
      return {
        embedding: null,
        embeddingHash: null,
        error: 'Vision model not available',
      };
    }

    // Generate embedding using file path
    const output = await extractor(imagePath, {
      pooling: 'mean', // Average pooling over spatial dimensions
      normalize: true,  // L2 normalize the output
    });

    // Convert to regular array
    const embedding = Array.from(output.data);

    // Generate a short hash of the embedding for the DNA ID
    const embeddingHash = hashEmbedding(embedding);

    const processingTime = Date.now() - startTime;
    logger.debug(`[NeuralEmbed] Generated embedding in ${processingTime}ms (${embedding.length} dims)`);

    // Cleanup temp file
    cleanupTempFile(imagePath, imageInput);

    return {
      embedding,
      embeddingHash,
      dimensions: embedding.length,
      model: 'vit-base-patch16-224',
      processingTime,
    };
  } catch (error) {
    logger.error('[NeuralEmbed] Error generating embedding:', error);
    // Cleanup on error too
    if (imagePath) cleanupTempFile(imagePath, imageInput);
    return {
      embedding: null,
      embeddingHash: null,
      error: error.message,
    };
  }
};

/**
 * Classify entity type using CLIP zero-shot classification
 *
 * @param {Buffer|string} imageInput - Image buffer or file path
 * @returns {Object} - Entity classification result
 */
const classifyEntity = async (imageInput) => {
  // Early return if neural is disabled
  if (NEURAL_DISABLED || !pipelineModule) {
    return {
      entityType: 'unknown',
      confidence: 0,
      error: 'Neural models disabled',
    };
  }

  let imagePath = null;

  try {
    const startTime = Date.now();

    // Prepare image input
    imagePath = await prepareImageInput(imageInput);

    // Initialize CLIP if needed
    const classifier = await initializeCLIP();

    // If classifier is null, return early
    if (!classifier) {
      return {
        entityType: 'unknown',
        confidence: 0,
        error: 'CLIP classifier not available',
      };
    }

    // Run zero-shot classification
    const results = await classifier(imagePath, ENTITY_LABELS);

    // Cleanup temp file
    cleanupTempFile(imagePath, imageInput);

    // Get top result
    const topResult = results[0];
    const entityIndex = ENTITY_LABELS.indexOf(topResult.label);
    const entityType = ENTITY_MAP[entityIndex] || 'unknown';

    const processingTime = Date.now() - startTime;
    logger.debug(`[NeuralEmbed] Classified as "${entityType}" (${(topResult.score * 100).toFixed(1)}%) in ${processingTime}ms`);

    return {
      entityType,
      confidence: topResult.score,
      allScores: results.map(r => ({
        label: r.label,
        score: r.score,
      })),
      processingTime,
    };
  } catch (error) {
    logger.error('[NeuralEmbed] Error classifying entity:', error);
    // Cleanup on error too
    if (imagePath) cleanupTempFile(imagePath, imageInput);
    return {
      entityType: 'unknown',
      confidence: 0,
      error: error.message,
    };
  }
};

/**
 * Calculate cosine similarity between two embeddings
 *
 * @param {number[]} embedding1 - First embedding vector
 * @param {number[]} embedding2 - Second embedding vector
 * @returns {number} - Similarity score (0-1)
 */
const cosineSimilarity = (embedding1, embedding2) => {
  if (!embedding1 || !embedding2) return 0;
  if (embedding1.length !== embedding2.length) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
};

/**
 * Hash embedding to a short string for DNA ID
 *
 * @param {number[]} embedding - Embedding vector
 * @returns {string} - 8-character hash
 */
const hashEmbedding = (embedding) => {
  if (!embedding || !embedding.length) return null;

  // Convert first 64 values to a string representation
  const subset = embedding.slice(0, 64).map(v => v.toFixed(4)).join(',');

  // Generate MD5 hash and take first 8 characters
  const hash = crypto.createHash('md5').update(subset).digest('hex');
  return hash.slice(0, 8);
};

/**
 * Find similar embeddings from a list
 *
 * @param {number[]} queryEmbedding - Query embedding
 * @param {Array} candidates - Array of {id, embedding} objects
 * @param {number} threshold - Minimum similarity threshold (0-1)
 * @param {number} limit - Maximum number of results
 * @returns {Array} - Sorted array of {id, similarity} objects
 */
const findSimilar = (queryEmbedding, candidates, threshold = 0.7, limit = 10) => {
  if (!queryEmbedding || !candidates?.length) return [];

  const results = candidates
    .map(candidate => ({
      id: candidate.id,
      similarity: cosineSimilarity(queryEmbedding, candidate.embedding),
    }))
    .filter(result => result.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return results;
};

/**
 * Generate complete neural fingerprint (embedding + classification)
 *
 * @param {Buffer|string} imageInput - Image buffer or file path
 * @returns {Object} - Complete neural fingerprint
 */
const generateNeuralFingerprint = async (imageInput) => {
  try {
    const startTime = Date.now();

    // Run embedding and classification in parallel
    const [embeddingResult, classificationResult] = await Promise.all([
      generateEmbedding(imageInput),
      classifyEntity(imageInput),
    ]);

    const totalTime = Date.now() - startTime;

    return {
      embedding: embeddingResult.embedding,
      embeddingHash: embeddingResult.embeddingHash,
      dimensions: embeddingResult.dimensions,
      entityType: classificationResult.entityType,
      entityConfidence: classificationResult.confidence,
      model: embeddingResult.model,
      processingTime: totalTime,
      success: !embeddingResult.error && !classificationResult.error,
    };
  } catch (error) {
    logger.error('[NeuralEmbed] Error generating neural fingerprint:', error);
    return {
      embedding: null,
      embeddingHash: null,
      entityType: 'unknown',
      entityConfidence: 0,
      error: error.message,
      success: false,
    };
  }
};

/**
 * Pre-warm the models (call on server startup)
 */
const warmUp = async () => {
  try {
    logger.info('[NeuralEmbed] Pre-warming neural models...');

    // Just initialize the models, don't run inference
    await initializeDINO();
    logger.info('[NeuralEmbed] DINOv2 model ready');

    // CLIP is optional, don't fail if it doesn't load
    try {
      await initializeCLIP();
      logger.info('[NeuralEmbed] CLIP classifier ready');
    } catch (clipError) {
      logger.warn('[NeuralEmbed] CLIP classifier not loaded, entity classification disabled');
    }

    logger.info('[NeuralEmbed] Neural models warmed up');
    return true;
  } catch (error) {
    logger.error('[NeuralEmbed] Warm-up failed:', error);
    return false;
  }
};

/**
 * Check if models are loaded
 */
const isReady = () => {
  return {
    dino: !!dinoExtractor,
    clip: !!clipClassifier,
  };
};

module.exports = {
  generateEmbedding,
  classifyEntity,
  generateNeuralFingerprint,
  cosineSimilarity,
  findSimilar,
  hashEmbedding,
  warmUp,
  isReady,
};
