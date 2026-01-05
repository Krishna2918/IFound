const { Photo, Case } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const faceRecognitionService = require('../services/faceRecognitionService');
const objectDetectionService = require('../services/objectDetectionService');
const imageSimilarityService = require('../services/imageSimilarityService');
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
      },
      capabilities: [
        'Face detection and recognition',
        'Object and item detection',
        'Color extraction',
        'Image quality assessment',
        'Visual similarity matching',
        'Automatic categorization',
      ],
    },
  });
});

module.exports = {
  searchByFace,
  searchByObject,
  searchSimilar,
  analyzePhoto,
  getAIStatus,
};
