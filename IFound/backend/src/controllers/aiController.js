const { Photo, Case } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const faceRecognitionService = require('../services/faceRecognitionService');
const objectDetectionService = require('../services/objectDetectionService');
const imageSimilarityService = require('../services/imageSimilarityService');
const rekognitionService = require('../services/rekognitionService');
const logger = require('../config/logger');
const path = require('path');

// @desc    Search cases by uploading a photo (face search)
// @route   POST /api/v1/ai/search-by-face
// @access  Public
const searchByFace = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Please upload a photo',
    });
  }

  const photoPath = req.file.path;

  // Get all photos with face data
  const allPhotos = await Photo.findAll({
    where: {
      face_detected: true,
    },
    include: [
      {
        model: Case,
        as: 'case',
        where: { status: 'active' },
        attributes: ['id', 'title', 'case_type', 'bounty_amount'],
      },
    ],
  });

  // Search for matching faces
  const result = await faceRecognitionService.searchByFace(photoPath, allPhotos, 60);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: result.message,
    });
  }

  // Group by case and get unique cases
  const caseMap = new Map();

  for (const match of result.matches) {
    if (!caseMap.has(match.case_id)) {
      const caseData = await Case.findByPk(match.case_id, {
        include: [
          {
            model: Photo,
            as: 'photos',
            where: { is_primary: true },
            required: false,
            limit: 1,
          },
        ],
      });

      caseMap.set(match.case_id, {
        case: caseData,
        similarity: match.similarity,
        isMatch: match.isMatch,
      });
    }
  }

  const cases = Array.from(caseMap.values()).sort((a, b) => b.similarity - a.similarity);

  res.status(200).json({
    success: true,
    message: `Found ${cases.length} potential matches`,
    data: {
      matches: cases,
      totalMatches: cases.length,
    },
  });
});

// @desc    Search cases by object (for lost items)
// @route   POST /api/v1/ai/search-by-object
// @access  Public
const searchByObject = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Please upload a photo',
    });
  }

  const photoPath = req.file.path;

  // Get all photos with object data
  const allPhotos = await Photo.findAll({
    include: [
      {
        model: Case,
        as: 'case',
        where: {
          status: 'active',
          case_type: 'lost_item',
        },
        attributes: ['id', 'title', 'case_type', 'bounty_amount', 'item_category'],
      },
    ],
  });

  // Search for similar objects
  const result = await objectDetectionService.searchByObject(photoPath, allPhotos, 50);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: result.message,
    });
  }

  // Get case details for matches
  const caseMap = new Map();

  for (const match of result.matches) {
    if (!caseMap.has(match.case_id)) {
      const caseData = await Case.findByPk(match.case_id, {
        include: [
          {
            model: Photo,
            as: 'photos',
            where: { is_primary: true },
            required: false,
            limit: 1,
          },
        ],
      });

      caseMap.set(match.case_id, {
        case: caseData,
        similarity: match.similarity,
        matchingObjects: match.matchingObjects,
      });
    }
  }

  const cases = Array.from(caseMap.values()).sort((a, b) => b.similarity - a.similarity);

  res.status(200).json({
    success: true,
    message: `Found ${cases.length} similar items`,
    data: {
      matches: cases,
      queryObjects: result.queryObjects,
      totalMatches: cases.length,
    },
  });
});

// @desc    Search cases by image similarity
// @route   POST /api/v1/ai/search-similar
// @access  Public
const searchSimilar = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Please upload a photo',
    });
  }

  const photoPath = req.file.path;

  // Get all photos
  const allPhotos = await Photo.findAll({
    include: [
      {
        model: Case,
        as: 'case',
        where: { status: 'active' },
        attributes: ['id', 'title', 'case_type', 'bounty_amount'],
      },
    ],
  });

  // Search for visually similar images
  const result = await imageSimilarityService.searchBySimilarity(photoPath, allPhotos, 70);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: result.message,
    });
  }

  // Get case details
  const caseMap = new Map();

  for (const match of result.matches) {
    if (!caseMap.has(match.case_id)) {
      const caseData = await Case.findByPk(match.case_id, {
        include: [
          {
            model: Photo,
            as: 'photos',
            where: { is_primary: true },
            required: false,
            limit: 1,
          },
        ],
      });

      caseMap.set(match.case_id, {
        case: caseData,
        similarity: match.similarity,
      });
    }
  }

  const cases = Array.from(caseMap.values()).sort((a, b) => b.similarity - a.similarity);

  res.status(200).json({
    success: true,
    message: `Found ${cases.length} similar cases`,
    data: {
      matches: cases,
      totalMatches: cases.length,
    },
  });
});

// @desc    Analyze a photo (detect faces, objects, colors)
// @route   POST /api/v1/ai/analyze-photo
// @access  Public
const analyzePhoto = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Please upload a photo',
    });
  }

  const photoPath = req.file.path;

  // Run all AI services in parallel
  const [faceResult, objectResult, qualityResult] = await Promise.all([
    faceRecognitionService.processPhoto(photoPath),
    objectDetectionService.processPhoto(photoPath),
    imageSimilarityService.getImageQuality(photoPath),
  ]);

  // Suggest category based on detected objects
  const suggestedCategory = objectDetectionService.categorizeItem(objectResult.objects || []);

  res.status(200).json({
    success: true,
    message: 'Photo analyzed successfully',
    data: {
      faces: {
        detected: faceResult.faceDetected || false,
        count: faceResult.facesCount || 0,
        confidence: faceResult.confidence || 0,
      },
      objects: {
        detected: objectResult.objects || [],
        count: objectResult.objectsCount || 0,
        primary: objectResult.primaryObject || null,
      },
      colors: {
        palette: objectResult.colors || [],
        dominant: objectResult.dominantColor || null,
      },
      quality: {
        score: qualityResult.quality || 0,
        resolution: qualityResult.resolution || {},
        isGoodQuality: qualityResult.isGoodQuality || false,
      },
      suggestions: {
        category: suggestedCategory,
        hasFace: faceResult.faceDetected || false,
      },
    },
  });
});

// @desc    Get AI service status
// @route   GET /api/v1/ai/status
// @access  Public
const getAIStatus = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      services: {
        faceRecognition: {
          name: 'Face Recognition',
          status: faceRecognitionService.initialized ? 'active' : 'initializing',
          description: 'Detect and match faces in photos',
        },
        objectDetection: {
          name: 'Object Detection',
          status: objectDetectionService.initialized ? 'active' : 'initializing',
          description: 'Identify objects and items in photos',
        },
        imageSimilarity: {
          name: 'Image Similarity',
          status: imageSimilarityService.initialized ? 'active' : 'initializing',
          description: 'Find visually similar images',
        },
        awsRekognition: {
          name: 'AWS Rekognition',
          status: rekognitionService.available ? 'active' : 'unavailable',
          description: 'Production-grade face and object recognition',
        },
      },
      capabilities: [
        'Face detection and recognition',
        'Object and item detection',
        'Color extraction',
        'Image quality assessment',
        'Visual similarity matching',
        'Automatic categorization',
        'Content moderation',
        'Cloud-based face indexing',
      ],
    },
  });
});

// ============================================
// AWS REKOGNITION ENDPOINTS (Production-Grade)
// ============================================

// @desc    Analyze image using AWS Rekognition
// @route   POST /api/v1/ai/rekognition/analyze
// @access  Private
const rekognitionAnalyze = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Image file is required',
    });
  }

  const imageBuffer = req.file.buffer;

  const [labels, moderation, category] = await Promise.all([
    rekognitionService.detectLabels(imageBuffer),
    rekognitionService.moderateContent(imageBuffer),
    rekognitionService.categorizePhoto(imageBuffer),
  ]);

  if (moderation.shouldBlock) {
    logger.warn('Inappropriate content blocked', {
      userId: req.user?.id,
      labels: moderation.unsafeLabels,
    });

    return res.status(400).json({
      success: false,
      message: 'Image contains inappropriate content',
      moderationLabels: moderation.unsafeLabels,
    });
  }

  res.json({
    success: true,
    analysis: {
      labels: labels.labels,
      category: category.category,
      categoryConfidence: category.confidence,
      suggestedTags: category.suggestedTags,
      moderation: {
        safe: moderation.safe,
        warnings: moderation.moderationLabels?.filter(l => l.confidence >= 50) || [],
      },
    },
  });
});

// @desc    Detect faces using AWS Rekognition
// @route   POST /api/v1/ai/rekognition/detect-faces
// @access  Private
const rekognitionDetectFaces = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Image file is required',
    });
  }

  const result = await rekognitionService.detectFaces(req.file.buffer);

  res.json({
    success: result.success,
    faces: result.faces,
    count: result.count,
  });
});

// @desc    Compare two faces using AWS Rekognition
// @route   POST /api/v1/ai/rekognition/compare-faces
// @access  Private
const rekognitionCompareFaces = asyncHandler(async (req, res) => {
  if (!req.files || !req.files.source || !req.files.target) {
    return res.status(400).json({
      success: false,
      message: 'Both source and target images are required',
    });
  }

  const sourceBuffer = req.files.source[0].buffer;
  const targetBuffer = req.files.target[0].buffer;
  const threshold = req.body.threshold ? parseFloat(req.body.threshold) : 70;

  const result = await rekognitionService.compareFaces(
    sourceBuffer,
    targetBuffer,
    threshold
  );

  res.json(result);
});

// @desc    Search for matching faces in indexed collection
// @route   POST /api/v1/ai/rekognition/search-faces
// @access  Private
const rekognitionSearchFaces = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Image file is required',
    });
  }

  const maxFaces = req.body.maxFaces ? parseInt(req.body.maxFaces) : 10;
  const threshold = req.body.threshold ? parseFloat(req.body.threshold) : 70;

  const result = await rekognitionService.searchFaces(
    req.file.buffer,
    maxFaces,
    threshold
  );

  if (result.success && result.matches.length > 0) {
    const caseIds = [...new Set(
      result.matches
        .map(m => m.externalId?.split('-')[0])
        .filter(Boolean)
    )];

    if (caseIds.length > 0) {
      const cases = await Case.findAll({
        where: { id: caseIds },
        attributes: ['id', 'title', 'case_type', 'status', 'bounty_amount'],
      });

      const caseMap = new Map(cases.map(c => [c.id, c]));

      result.matches = result.matches.map(match => {
        const caseId = match.externalId?.split('-')[0];
        return {
          ...match,
          case: caseId ? caseMap.get(caseId)?.toJSON() : null,
        };
      });
    }
  }

  res.json(result);
});

// @desc    Index a face from a case photo
// @route   POST /api/v1/ai/rekognition/index-face
// @access  Private
const rekognitionIndexFace = asyncHandler(async (req, res) => {
  const { photoId } = req.body;

  if (!photoId) {
    return res.status(400).json({
      success: false,
      message: 'Photo ID is required',
    });
  }

  const photo = await Photo.findByPk(photoId, {
    include: [{ model: Case, as: 'case' }],
  });

  if (!photo) {
    return res.status(404).json({
      success: false,
      message: 'Photo not found',
    });
  }

  if (photo.case.poster_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to index this photo',
    });
  }

  const imageBuffer = await rekognitionService.fetchFromS3(photo.s3_url);
  if (!imageBuffer) {
    return res.status(400).json({
      success: false,
      message: 'Could not fetch photo from storage',
    });
  }

  const externalId = `${photo.case_id}-${photo.id}`;
  const result = await rekognitionService.indexFace(imageBuffer, externalId);

  if (result.success) {
    await photo.update({ face_id: result.faceId });

    logger.info('Face indexed via Rekognition', {
      photoId: photo.id,
      caseId: photo.case_id,
      faceId: result.faceId,
    });
  }

  res.json(result);
});

// @desc    Check for duplicate images
// @route   POST /api/v1/ai/rekognition/check-duplicate
// @access  Private
const rekognitionCheckDuplicate = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Image file is required',
    });
  }

  const { caseType, category } = req.body;

  const whereClause = { status: 'active' };
  if (caseType) whereClause.case_type = caseType;
  if (category) whereClause.item_category = category;

  const recentCases = await Case.findAll({
    where: whereClause,
    include: [{
      model: Photo,
      as: 'photos',
      limit: 1,
      where: { is_primary: true },
      required: false,
    }],
    order: [['createdAt', 'DESC']],
    limit: 50,
  });

  const existingPhotos = recentCases
    .map(c => c.photos?.[0])
    .filter(Boolean)
    .map(p => ({
      id: p.id,
      case_id: p.case_id,
      s3_url: p.s3_url,
    }));

  const result = await rekognitionService.checkDuplicate(
    req.file.buffer,
    existingPhotos
  );

  if (result.isDuplicate && result.matches.length > 0) {
    const caseIds = result.matches.map(m => m.caseId);
    const cases = await Case.findAll({
      where: { id: caseIds },
      attributes: ['id', 'title', 'case_type', 'status', 'poster_id'],
    });

    const caseMap = new Map(cases.map(c => [c.id, c]));
    result.matches = result.matches.map(m => ({
      ...m,
      case: caseMap.get(m.caseId)?.toJSON(),
    }));
  }

  res.json(result);
});

// @desc    Moderate image content
// @route   POST /api/v1/ai/rekognition/moderate
// @access  Private
const rekognitionModerate = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Image file is required',
    });
  }

  const result = await rekognitionService.moderateContent(req.file.buffer);

  res.json(result);
});

module.exports = {
  searchByFace,
  searchByObject,
  searchSimilar,
  analyzePhoto,
  getAIStatus,
  // AWS Rekognition endpoints
  rekognitionAnalyze,
  rekognitionDetectFaces,
  rekognitionCompareFaces,
  rekognitionSearchFaces,
  rekognitionIndexFace,
  rekognitionCheckDuplicate,
  rekognitionModerate,
};
