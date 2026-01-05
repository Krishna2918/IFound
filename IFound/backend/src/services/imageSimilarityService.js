const sharp = require('sharp');
const Jimp = require('jimp');

// Try to load TensorFlow (may fail on some systems)
let tf;
let AI_AVAILABLE = false;

try {
  tf = require('@tensorflow/tfjs-node');
  AI_AVAILABLE = true;
  console.log('Image Similarity AI: TensorFlow loaded successfully');
} catch (error) {
  console.warn('Image Similarity AI: TensorFlow not available -', error.message);
  console.warn('Image similarity features will use fallback methods.');
}

class ImageSimilarityService {
  constructor() {
    this.model = null;
    this.initialized = false;
    this.available = AI_AVAILABLE;
  }

  /**
   * Initialize MobileNet for image feature extraction
   */
  async initialize() {
    if (this.initialized) return;
    if (!this.available) {
      console.log('Image Similarity AI: Skipping initialization (TensorFlow not available)');
      return;
    }

    try {
      console.log('Initializing Image Similarity AI...');

      // Load MobileNet model for feature extraction
      this.model = await tf.loadGraphModel(
        'https://tfhub.dev/google/tfjs-model/imagenet/mobilenet_v3_small_100_224/feature_vector/5/default/1',
        { fromTFHub: true }
      );

      this.initialized = true;
      console.log('Image Similarity AI initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Image Similarity:', error.message);
      console.log('Using fallback image comparison');
    }
  }

  /**
   * Extract image features (embeddings)
   */
  async extractFeatures(imagePath) {
    // Return null if AI not available
    if (!this.available || !this.model) {
      return null;
    }

    try {
      // Load and preprocess image
      const imageBuffer = await sharp(imagePath)
        .resize(224, 224)
        .removeAlpha()
        .raw()
        .toBuffer();

      // Convert to tensor
      const tensor = tf.tensor3d(
        new Uint8Array(imageBuffer),
        [224, 224, 3]
      );

      // Normalize
      const normalized = tensor.toFloat().div(255.0);

      let features;
      if (this.model && this.initialized) {
        // Use MobileNet features
        const batched = normalized.expandDims(0);
        features = this.model.predict(batched);
        batched.dispose();
      } else {
        // Fallback: Use simple color histogram as features
        features = await this.extractColorHistogram(imagePath);
      }

      // Clean up
      tensor.dispose();
      normalized.dispose();

      // Convert to array
      const featureArray = features.dataSync
        ? Array.from(await features.data())
        : features;

      if (features.dispose) features.dispose();

      return {
        success: true,
        features: featureArray,
      };
    } catch (error) {
      console.error('Feature extraction error:', error);

      // Ultimate fallback
      return this.extractSimpleFeatures(imagePath);
    }
  }

  /**
   * Extract color histogram as simple features
   */
  async extractColorHistogram(imagePath) {
    const image = await Jimp.read(imagePath);
    image.resize(32, 32);

    const histogram = new Array(64).fill(0); // 4x4x4 color bins

    image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
      const r = Math.floor(image.bitmap.data[idx + 0] / 64);
      const g = Math.floor(image.bitmap.data[idx + 1] / 64);
      const b = Math.floor(image.bitmap.data[idx + 2] / 64);
      const binIndex = r * 16 + g * 4 + b;
      histogram[binIndex]++;
    });

    // Normalize
    const total = image.bitmap.width * image.bitmap.height;
    return histogram.map(count => count / total);
  }

  /**
   * Simple feature extraction fallback
   */
  async extractSimpleFeatures(imagePath) {
    try {
      const features = await this.extractColorHistogram(imagePath);
      return {
        success: true,
        features,
      };
    } catch (error) {
      console.error('Simple feature extraction error:', error);
      return {
        success: false,
        features: [],
      };
    }
  }

  /**
   * Calculate cosine similarity between two feature vectors
   */
  cosineSimilarity(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  /**
   * Find similar images
   */
  async findSimilarImages(queryFeatures, database, threshold = 0.7) {
    if (!queryFeatures || queryFeatures.length === 0) {
      return [];
    }

    const matches = [];

    for (const entry of database) {
      if (!entry.features || entry.features.length === 0) continue;

      const similarity = this.cosineSimilarity(queryFeatures, entry.features);

      if (similarity >= threshold) {
        matches.push({
          ...entry,
          similarity: Math.round(similarity * 100),
        });
      }
    }

    // Sort by similarity
    matches.sort((a, b) => b.similarity - a.similarity);

    return matches;
  }

  /**
   * Process photo and extract features
   */
  async processPhoto(photoPath) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const result = await this.extractFeatures(photoPath);

      // Handle null result when TensorFlow is not available
      if (!result) {
        return {
          success: false,
          message: 'AI features not available (TensorFlow not initialized)',
          features: [],
        };
      }

      return {
        success: result.success,
        features: result.features || [],
        featureLength: result.features?.length || 0,
      };
    } catch (error) {
      console.error('Photo processing error:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Search for visually similar images
   */
  async searchBySimilarity(queryPhotoPath, allCasePhotos, threshold = 70) {
    try {
      // Extract features from query image
      const queryResult = await this.processPhoto(queryPhotoPath);

      if (!queryResult.success || !queryResult.features) {
        return {
          success: false,
          message: 'Could not extract features from query image',
          matches: [],
        };
      }

      // Build database
      const database = allCasePhotos
        .filter(photo => photo.image_features && photo.image_features.length > 0)
        .map(photo => ({
          photo_id: photo.id,
          case_id: photo.case_id,
          features: photo.image_features,
        }));

      // Find similar images
      const matches = await this.findSimilarImages(
        queryResult.features,
        database,
        threshold / 100
      );

      return {
        success: true,
        matches,
      };
    } catch (error) {
      console.error('Similarity search error:', error);
      return {
        success: false,
        message: error.message,
        matches: [],
      };
    }
  }

  /**
   * Compare two images directly
   */
  async compareImages(imagePath1, imagePath2) {
    try {
      const [result1, result2] = await Promise.all([
        this.processPhoto(imagePath1),
        this.processPhoto(imagePath2),
      ]);

      if (!result1.success || !result2.success) {
        return {
          success: false,
          message: 'Could not process images',
        };
      }

      const similarity = this.cosineSimilarity(result1.features, result2.features);

      return {
        success: true,
        similarity: Math.round(similarity * 100),
        isMatch: similarity >= 0.8, // 80% threshold for direct comparison
      };
    } catch (error) {
      console.error('Image comparison error:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Get image quality score
   */
  async getImageQuality(imagePath) {
    try {
      const metadata = await sharp(imagePath).metadata();
      const stats = await sharp(imagePath).stats();

      const { width, height, format } = metadata;

      // Calculate quality score based on:
      // - Resolution
      // - Color variance (blurry images have low variance)
      // - Format

      const resolutionScore = Math.min(100, (width * height) / 10000); // 1MP = 100 points
      const varianceScore = Math.min(100, stats.channels[0].stdev); // Standard deviation
      const formatScore = format === 'jpeg' ? 80 : format === 'png' ? 100 : 60;

      const overallScore = (resolutionScore + varianceScore + formatScore) / 3;

      return {
        success: true,
        quality: Math.round(overallScore),
        resolution: { width, height },
        format,
        isGoodQuality: overallScore >= 70,
      };
    } catch (error) {
      console.error('Quality check error:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }
}

// Singleton instance
const imageSimilarityService = new ImageSimilarityService();

// Initialize on module load
imageSimilarityService.initialize().catch(console.error);

module.exports = imageSimilarityService;
