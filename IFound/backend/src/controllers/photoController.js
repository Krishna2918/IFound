const { Photo, Case } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const path = require('path');
const fs = require('fs');
const faceRecognitionService = require('../services/faceRecognitionService');
const objectDetectionService = require('../services/objectDetectionService');
const imageSimilarityService = require('../services/imageSimilarityService');
const visualDNAService = require('../services/visualDNAService');
const ocrService = require('../services/ocrService');
const matchingService = require('../services/universalMatchingService');
const imageDnaService = require('../services/imageDnaService');
const neuralEmbeddingService = require('../services/neuralEmbeddingService');
const logger = require('../config/logger');

// @desc    Upload photos for a case
// @route   POST /api/v1/photos/:caseId/photos
// @access  Private (case poster only)
const uploadPhotos = asyncHandler(async (req, res) => {
  const { caseId } = req.params;
  logger.info('=== uploadPhotos called ===');
  logger.info(`caseId: ${caseId}`);
  logger.info(`userId: ${req.userId}`);
  logger.info(`files received: ${req.files?.length || 0}`);

  const caseData = await Case.findByPk(caseId);

  if (!caseData) {
    logger.error(`Case not found: ${caseId}`);
    return res.status(404).json({
      success: false,
      message: 'Case not found',
    });
  }

  logger.info(`Case found. poster_id: ${caseData.poster_id}, userId: ${req.userId}`);

  // Check if user is the poster
  if (caseData.poster_id !== req.userId && req.user?.user_type !== 'admin') {
    logger.error(`Not authorized: poster_id=${caseData.poster_id}, userId=${req.userId}`);
    return res.status(403).json({
      success: false,
      message: 'Not authorized to upload photos for this case',
    });
  }

  if (!req.files || req.files.length === 0) {
    logger.error('No files in request');
    return res.status(400).json({
      success: false,
      message: 'No files uploaded',
    });
  }

  logger.info(`Processing ${req.files.length} files...`);

  // Check max photos limit
  const existingPhotosCount = await Photo.count({ where: { case_id: caseId } });
  const maxPhotos = parseInt(process.env.MAX_PHOTOS_PER_CASE) || 10;

  if (existingPhotosCount + req.files.length > maxPhotos) {
    return res.status(400).json({
      success: false,
      message: `Maximum ${maxPhotos} photos allowed per case`,
    });
  }

  const photos = [];

  for (const file of req.files) {
    const photoPath = file.path;
    const photoUrl = `/uploads/${caseId}/${file.filename}`;

    // Create photo record
    const photo = await Photo.create({
      case_id: caseId,
      image_url: photoUrl,
      file_size: file.size,
      mime_type: file.mimetype,
      is_primary: existingPhotosCount === 0 && photos.length === 0, // First photo is primary
      upload_status: 'processing',
    });

    // Process photo with AI in background (don't await to speed up response)
    processPhotoWithAI(photo, photoPath).catch(error => {
      console.error('AI processing error:', error);
    });

    photos.push(photo);
  }

  res.status(201).json({
    success: true,
    message: 'Photos uploaded successfully (AI processing in background)',
    data: { photos },
  });
});

// @desc    Get photos for a case
// @route   GET /api/v1/cases/:caseId/photos
// @access  Public
const getPhotosByCase = asyncHandler(async (req, res) => {
  const { caseId } = req.params;

  const photos = await Photo.findAll({
    where: { case_id: caseId },
    order: [
      ['is_primary', 'DESC'],
      ['created_at', 'ASC'],
    ],
  });

  res.status(200).json({
    success: true,
    data: { photos },
  });
});

// @desc    Set primary photo
// @route   PUT /api/v1/photos/:id/set-primary
// @access  Private (case poster only)
const setPrimaryPhoto = asyncHandler(async (req, res) => {
  const photo = await Photo.findByPk(req.params.id, {
    include: [{ model: Case, as: 'case' }],
  });

  if (!photo) {
    return res.status(404).json({
      success: false,
      message: 'Photo not found',
    });
  }

  // Check if user is the poster
  if (photo.case.poster_id !== req.userId && req.user?.user_type !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized',
    });
  }

  // Unset all primary photos for this case
  await Photo.update(
    { is_primary: false },
    { where: { case_id: photo.case_id } }
  );

  // Set this photo as primary
  photo.is_primary = true;
  await photo.save();

  res.status(200).json({
    success: true,
    message: 'Primary photo updated',
    data: { photo },
  });
});

// @desc    Delete photo
// @route   DELETE /api/v1/photos/:id
// @access  Private (case poster only)
const deletePhoto = asyncHandler(async (req, res) => {
  const photo = await Photo.findByPk(req.params.id, {
    include: [{ model: Case, as: 'case' }],
  });

  if (!photo) {
    return res.status(404).json({
      success: false,
      message: 'Photo not found',
    });
  }

  // Check if user is the poster
  if (photo.case.poster_id !== req.userId && req.user?.user_type !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized',
    });
  }

  // Delete file from filesystem
  try {
    const filePath = path.join(__dirname, '../../', photo.image_url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Error deleting file:', error);
  }

  await photo.destroy();

  res.status(200).json({
    success: true,
    message: 'Photo deleted successfully',
  });
});

// Helper function to process photo with AI
async function processPhotoWithAI(photo, photoPath) {
  try {
    logger.info(`Processing photo ${photo.id} with AI...`);

    // Process photo with all AI services in parallel (including OCR)
    const [faceResult, objectResult, imageResult, ocrResult] = await Promise.all([
      faceRecognitionService.processPhoto(photoPath),
      objectDetectionService.processPhoto(photoPath),
      imageSimilarityService.processPhoto(photoPath),
      ocrService.extractText(photoPath).catch(err => {
        logger.warn(`OCR processing failed for photo ${photo.id}:`, err.message);
        return { text: '', confidence: 0, identifiers: {}, processingTimeMs: 0 };
      }),
    ]);

    // Update photo with AI results
    photo.face_detected = faceResult.faceDetected || false;
    photo.face_vector = faceResult.descriptor || null;
    photo.ai_confidence_score = faceResult.confidence || null;

    photo.ai_metadata = {
      faces_count: faceResult.facesCount || 0,
      objects_detected: objectResult.objects?.map(o => o.class) || [],
      colors: objectResult.colors?.map(c => c.hex) || [],
      primary_object: objectResult.primaryObject || null,
      dominant_color: objectResult.dominantColor || null,
      // OCR data
      ocr: {
        text: ocrResult.text || '',
        confidence: ocrResult.confidence || 0,
        identifiers: ocrResult.identifiers || {},
        processingTimeMs: ocrResult.processingTimeMs || 0,
        hasText: (ocrResult.text || '').trim().length > 0,
      },
    };

    // Store image features for similarity search
    photo.image_features = imageResult.features || null;
    photo.upload_status = 'completed';

    await photo.save();

    logger.info(`Photo ${photo.id} AI processing completed (OCR confidence: ${ocrResult.confidence}%)`);

    // Extract Visual DNA in background (non-blocking)
    extractVisualDNA(photo.id, photo.case_id, photoPath).catch(error => {
      logger.error(`Visual DNA extraction failed for photo ${photo.id}:`, error);
    });

    // Find matches for this photo (non-blocking)
    findMatchesForPhoto(photo.id, photo.case_id, photoPath).catch(error => {
      logger.error(`Match search failed for photo ${photo.id}:`, error);
    });

  } catch (error) {
    logger.error(`Failed to process photo ${photo.id}:`, error);

    // Mark as failed
    photo.upload_status = 'failed';
    photo.upload_error = error.message;
    await photo.save();
  }
}

// Helper function to extract Visual DNA
async function extractVisualDNA(photoId, caseId, photoPath) {
  try {
    logger.info(`Extracting Visual DNA for photo ${photoId}...`);

    const result = await visualDNAService.processAndSaveVisualDNA(photoId, caseId, photoPath);

    logger.info(`Visual DNA extracted for photo ${photoId}`, {
      entityType: result.entity_type,
      processingTime: result.processing_time_ms,
    });

    return result;
  } catch (error) {
    logger.error(`Visual DNA extraction failed for photo ${photoId}:`, error);
    throw error;
  }
}

// Helper function to find matches for a photo
async function findMatchesForPhoto(photoId, caseId, photoPath) {
  try {
    logger.info(`Searching for matches for photo ${photoId}...`);

    const matches = await matchingService.findMatchesForPhoto(photoId, caseId, photoPath);

    if (matches.length > 0) {
      logger.info(`Found ${matches.length} potential matches for photo ${photoId}`);
      // TODO: Trigger notifications for high-confidence matches
    } else {
      logger.info(`No matches found for photo ${photoId}`);
    }

    return matches;
  } catch (error) {
    logger.error(`Match search failed for photo ${photoId}:`, error);
    throw error;
  }
}

// @desc    Analyze image with OCR (quick scan without case)
// @route   POST /api/v1/photos/analyze-ocr
// @access  Private
const analyzeOCR = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No image uploaded',
    });
  }

  const photoPath = req.file.path;

  try {
    logger.info(`Analyzing image with OCR and DNA v2: ${req.file.filename}`);

    // Read image buffer before processing (needed for DNA generation)
    const imageBuffer = fs.readFileSync(photoPath);

    // Run OCR analysis and DNA v2 generation in parallel
    const [ocrResult, dnaV2Result] = await Promise.all([
      ocrService.extractText(photoPath),
      imageDnaService.generateImageDNA_v2(imageBuffer).catch(err => {
        logger.warn(`DNA v2 generation failed: ${err.message}`);
        return null;
      }),
    ]);

    // Clean up temp file after analysis
    try {
      fs.unlinkSync(photoPath);
    } catch (err) {
      logger.warn(`Could not delete temp file: ${photoPath}`);
    }

    // Determine if OCR is garbage (low confidence or nonsensical text)
    const ocrScore = calculateOCRScore(ocrResult);
    const isGarbageOCR = ocrScore < 40 ||
      !ocrResult.text ||
      ocrResult.text.split(/\s+/).filter(w => w.length > 2).length < 2;

    res.status(200).json({
      success: true,
      message: 'Image analysis completed',
      data: {
        // OCR data (may be garbage for non-text images)
        text: ocrResult.text,
        confidence: ocrResult.confidence,
        identifiers: ocrResult.identifiers,
        words: ocrResult.words?.slice(0, 50),
        lines: ocrResult.lines,
        processingTimeMs: ocrResult.processingTimeMs,
        hasText: (ocrResult.text || '').trim().length > 0,
        score: ocrScore,
        isGarbageOCR,

        // DNA v2 data - the real visual fingerprint
        dnaId: dnaV2Result?.dnaId || null,
        dna_v2_id: dnaV2Result?.dnaId || null, // Alias for frontend compatibility
        visualDNA: dnaV2Result ? {
          dnaId: dnaV2Result.dnaId,
          interpretation: dnaV2Result.interpretation,
          searchableFields: dnaV2Result.searchableFields,
          processingTimeMs: dnaV2Result.processingTimeMs,
        } : null,
      },
    });
  } catch (error) {
    logger.error('Image analysis failed:', error);

    // Clean up file on error
    try {
      fs.unlinkSync(photoPath);
    } catch (err) {}

    return res.status(500).json({
      success: false,
      message: 'Image analysis failed',
      error: error.message,
    });
  }
});

// Helper function to calculate OCR score (0-100)
function calculateOCRScore(ocrResult) {
  let score = 0;

  // Base confidence score (0-40 points)
  score += Math.min(40, (ocrResult.confidence || 0) * 0.4);

  // Bonus for detected identifiers (0-40 points)
  const identifiers = ocrResult.identifiers || {};
  if (identifiers.serialNumbers?.length > 0) score += 15;
  if (identifiers.licensePlates?.length > 0) score += 15;
  if (identifiers.documentIds?.length > 0) score += 10;
  if (identifiers.emails?.length > 0) score += 5;
  if (identifiers.phones?.length > 0) score += 5;

  // Bonus for amount of readable text (0-20 points)
  const textLength = (ocrResult.text || '').trim().length;
  if (textLength > 0) score += Math.min(20, textLength / 10);

  return Math.min(100, Math.round(score));
}

// @desc    Get OCR data for a photo
// @route   GET /api/v1/photos/:id/ocr
// @access  Public
const getPhotoOCR = asyncHandler(async (req, res) => {
  const photo = await Photo.findByPk(req.params.id);

  if (!photo) {
    return res.status(404).json({
      success: false,
      message: 'Photo not found',
    });
  }

  const ocrData = photo.ai_metadata?.ocr || null;

  if (!ocrData) {
    return res.status(200).json({
      success: true,
      message: 'No OCR data available for this photo',
      data: { ocr: null },
    });
  }

  res.status(200).json({
    success: true,
    data: {
      ocr: {
        ...ocrData,
        score: calculateOCRScore({
          text: ocrData.text,
          confidence: ocrData.confidence,
          identifiers: ocrData.identifiers,
        }),
      },
    },
  });
});

module.exports = {
  uploadPhotos,
  getPhotosByCase,
  setPrimaryPhoto,
  deletePhoto,
  analyzeOCR,
  getPhotoOCR,
};
