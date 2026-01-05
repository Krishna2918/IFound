/**
 * Visual DNA Service
 *
 * Orchestrates the extraction of multi-layered visual fingerprints.
 * Combines:
 * - Layer 1: Perceptual hashes (fast filtering)
 * - Layer 2: Deep features (face, object, color embeddings)
 * - Layer 3: Content features (OCR, detected objects)
 */

const hashingService = require('./hashingService');
const ocrService = require('./ocrService');
const faceRecognitionService = require('./faceRecognitionService');
const objectDetectionService = require('./objectDetectionService');
const VisualDNA = require('../models/VisualDNA');
const logger = require('../config/logger');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ALGORITHM_VERSION = '1.0.0';

/**
 * Entity type classification based on detected content
 */
const classifyEntityType = (faceResult, objectResult, ocrResult) => {
  // Person detection
  if (faceResult?.faceDetected) {
    return { type: 'person', confidence: faceResult.confidence };
  }

  // Check detected objects
  if (objectResult?.objects?.length > 0) {
    const detectedClasses = objectResult.objects.map(o => o.class.toLowerCase());

    // Pet detection
    const petKeywords = ['dog', 'cat', 'bird', 'horse'];
    if (detectedClasses.some(cls => petKeywords.includes(cls))) {
      return { type: 'pet', confidence: 0.85 };
    }

    // Vehicle detection
    const vehicleKeywords = ['car', 'motorcycle', 'bus', 'truck', 'bicycle'];
    if (detectedClasses.some(cls => vehicleKeywords.includes(cls))) {
      return { type: 'vehicle', confidence: 0.85 };
    }

    // Check for documents (book, paper-like objects)
    if (detectedClasses.includes('book')) {
      return { type: 'document', confidence: 0.7 };
    }

    // Generic item
    return { type: 'item', confidence: 0.7 };
  }

  // Document detection via OCR
  if (ocrResult?.text?.length > 50 && ocrResult.confidence > 70) {
    return { type: 'document', confidence: 0.75 };
  }

  // Check for license plate patterns (vehicles)
  if (ocrResult?.identifiers?.licensePlates?.length > 0) {
    return { type: 'vehicle', confidence: 0.8 };
  }

  return { type: 'unknown', confidence: 0.5 };
};

/**
 * Extract Visual DNA from an image
 *
 * @param {string} imagePath - Path to the image file
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} Extracted Visual DNA data
 */
const extractVisualDNA = async (imagePath, options = {}) => {
  const startTime = Date.now();

  try {
    // Verify image exists
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image not found: ${imagePath}`);
    }

    // Read image buffer
    const imageBuffer = fs.readFileSync(imagePath);

    // Run all extractions in parallel for speed
    const [
      hashResult,
      faceResult,
      objectResult,
      colorResult,
      ocrResult,
      qualityResult,
    ] = await Promise.all([
      // Layer 1: Hashes
      hashingService.computeAllHashes(imageBuffer).catch(err => {
        logger.warn('Hash computation failed:', err.message);
        return null;
      }),

      // Layer 2: Face detection
      faceRecognitionService.processPhoto(imagePath).catch(err => {
        logger.warn('Face detection failed:', err.message);
        return { faceDetected: false };
      }),

      // Layer 2: Object detection
      objectDetectionService.processPhoto(imagePath).catch(err => {
        logger.warn('Object detection failed:', err.message);
        return { objects: [] };
      }),

      // Layer 2: Color extraction
      hashingService.computeColorHistogram(imageBuffer).catch(err => {
        logger.warn('Color histogram failed:', err.message);
        return null;
      }),

      // Layer 3: OCR (conditional - skip if option says no)
      options.skipOCR ? Promise.resolve(null) :
        ocrService.extractText(imageBuffer).catch(err => {
          logger.warn('OCR extraction failed:', err.message);
          return null;
        }),

      // Quality assessment
      hashingService.assessImageQuality(imageBuffer).catch(err => {
        logger.warn('Quality assessment failed:', err.message);
        return { score: 50 };
      }),
    ]);

    // Extract dominant colors separately
    const dominantColors = await hashingService.extractDominantColors(imageBuffer)
      .catch(() => []);

    // Classify entity type
    const entityClassification = classifyEntityType(faceResult, objectResult, ocrResult);

    // Build Visual DNA object
    const visualDNA = {
      // Entity Classification
      entity_type: entityClassification.type,
      entity_confidence: entityClassification.confidence,

      // Layer 1: Hashes
      perceptual_hash: hashResult?.perceptualHash || null,
      average_hash: hashResult?.averageHash || null,
      difference_hash: hashResult?.differenceHash || null,

      // Layer 2: Deep Features
      face_embedding: faceResult?.descriptor || null,
      object_features: null, // Reserved for future CNN features
      color_signature: colorResult || null,
      texture_features: null, // Reserved for future texture analysis

      // Layer 3: Content
      ocr_text: ocrResult?.text || null,
      ocr_confidence: ocrResult?.confidence || null,
      detected_objects: objectResult?.objects?.map(o => ({
        class: o.class,
        confidence: o.confidence,
        box: o.box,
      })) || [],
      detected_labels: objectResult?.objects?.map(o => o.class) || [],
      dominant_colors: dominantColors,

      // Match hints for quick filtering
      match_hints: buildMatchHints(faceResult, objectResult, ocrResult, dominantColors),

      // Metadata
      quality_score: qualityResult?.score || 50,
      processing_time_ms: Date.now() - startTime,
      algorithm_version: ALGORITHM_VERSION,
      processing_status: 'completed',
    };

    logger.info(`Visual DNA extracted in ${visualDNA.processing_time_ms}ms`, {
      entityType: visualDNA.entity_type,
      hasHashes: !!hashResult,
      hasFace: !!faceResult?.faceDetected,
      hasOCR: !!ocrResult?.text,
      objectCount: visualDNA.detected_objects.length,
    });

    return visualDNA;
  } catch (error) {
    logger.error('Visual DNA extraction failed:', error);
    return {
      entity_type: 'unknown',
      processing_status: 'failed',
      processing_error: error.message,
      processing_time_ms: Date.now() - startTime,
      algorithm_version: ALGORITHM_VERSION,
    };
  }
};

/**
 * Build match hints for quick filtering
 */
const buildMatchHints = (faceResult, objectResult, ocrResult, colors) => {
  const hints = {};

  // Face hints
  if (faceResult?.faceDetected) {
    hints.hasFace = true;
    hints.faceCount = faceResult.facesCount;
  }

  // Object hints
  if (objectResult?.objects?.length > 0) {
    hints.primaryObject = objectResult.objects[0]?.class;
    hints.objectTypes = [...new Set(objectResult.objects.map(o => o.class))];
  }

  // OCR hints
  if (ocrResult?.identifiers) {
    if (ocrResult.identifiers.serialNumbers.length > 0) {
      hints.hasSerialNumber = true;
    }
    if (ocrResult.identifiers.licensePlates.length > 0) {
      hints.hasLicensePlate = true;
      hints.licensePlates = ocrResult.identifiers.licensePlates;
    }
  }

  // Color hints
  if (colors?.length > 0) {
    hints.primaryColor = colors[0];
    hints.colorCount = colors.length;
  }

  return hints;
};

/**
 * Extract and save Visual DNA for a photo
 *
 * @param {string} photoId - Photo ID
 * @param {string} caseId - Case ID
 * @param {string} imagePath - Path to image
 * @returns {Promise<Object>} Saved Visual DNA record
 */
const processAndSaveVisualDNA = async (photoId, caseId, imagePath) => {
  try {
    // Check if Visual DNA already exists
    const existing = await VisualDNA.findOne({ where: { photo_id: photoId } });

    if (existing && existing.processing_status === 'completed') {
      logger.info(`Visual DNA already exists for photo ${photoId}`);
      return existing;
    }

    // Mark as processing
    let record;
    if (existing) {
      existing.processing_status = 'processing';
      await existing.save();
      record = existing;
    } else {
      record = await VisualDNA.create({
        photo_id: photoId,
        case_id: caseId,
        processing_status: 'processing',
        algorithm_version: ALGORITHM_VERSION,
      });
    }

    // Extract Visual DNA
    const visualDNA = await extractVisualDNA(imagePath);

    // Update record with extracted data
    Object.assign(record, visualDNA);
    await record.save();

    logger.info(`Visual DNA saved for photo ${photoId}`, {
      recordId: record.id,
      entityType: record.entity_type,
      status: record.processing_status,
    });

    return record;
  } catch (error) {
    logger.error(`Failed to process Visual DNA for photo ${photoId}:`, error);

    // Update status to failed
    await VisualDNA.update(
      {
        processing_status: 'failed',
        processing_error: error.message,
      },
      { where: { photo_id: photoId } }
    );

    throw error;
  }
};

/**
 * Extract Visual DNA from buffer (for search queries)
 *
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Promise<Object>} Extracted Visual DNA
 */
const extractFromBuffer = async (imageBuffer) => {
  // Save to temp file for processing
  const tempPath = path.join(process.cwd(), 'temp', `query_${Date.now()}.jpg`);

  try {
    // Ensure temp directory exists
    const tempDir = path.dirname(tempPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Save buffer to temp file
    fs.writeFileSync(tempPath, imageBuffer);

    // Extract Visual DNA
    const result = await extractVisualDNA(tempPath);

    return result;
  } finally {
    // Cleanup temp file
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
};

/**
 * Get Visual DNA for a case
 *
 * @param {string} caseId - Case ID
 * @returns {Promise<Array>} Array of Visual DNA records
 */
const getVisualDNAForCase = async (caseId) => {
  return VisualDNA.findAll({
    where: { case_id: caseId, processing_status: 'completed' },
    order: [['created_at', 'ASC']],
  });
};

/**
 * Batch process photos for Visual DNA extraction
 *
 * @param {Array} photos - Array of { photoId, caseId, imagePath }
 * @returns {Promise<Array>} Results
 */
const batchExtract = async (photos) => {
  const results = [];

  for (const photo of photos) {
    try {
      const result = await processAndSaveVisualDNA(
        photo.photoId,
        photo.caseId,
        photo.imagePath
      );
      results.push({ success: true, photoId: photo.photoId, record: result });
    } catch (error) {
      results.push({
        success: false,
        photoId: photo.photoId,
        error: error.message,
      });
    }
  }

  return results;
};

/**
 * Re-extract Visual DNA for photos with failed or outdated algorithms
 */
const reprocessOutdated = async () => {
  const outdated = await VisualDNA.findAll({
    where: {
      [require('sequelize').Op.or]: [
        { processing_status: 'failed' },
        { algorithm_version: { [require('sequelize').Op.ne]: ALGORITHM_VERSION } },
      ],
    },
    include: [{
      model: require('../models/Photo'),
      as: 'photo',
      attributes: ['id', 'image_url', 'aws_s3_key'],
    }],
  });

  logger.info(`Found ${outdated.length} Visual DNA records to reprocess`);

  // Process in batches of 10
  const batchSize = 10;
  for (let i = 0; i < outdated.length; i += batchSize) {
    const batch = outdated.slice(i, i + batchSize);
    await Promise.all(batch.map(async (record) => {
      // This would need actual image path resolution
      // For now, just update status
      record.processing_status = 'pending';
      await record.save();
    }));
  }

  return outdated.length;
};

module.exports = {
  extractVisualDNA,
  extractFromBuffer,
  processAndSaveVisualDNA,
  getVisualDNAForCase,
  batchExtract,
  reprocessOutdated,
  classifyEntityType,
  ALGORITHM_VERSION,
};
