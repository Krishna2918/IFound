const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/aiController');
const { protect, optionalAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

// AI search endpoints (public)
router.post('/search-by-face', optionalAuth, upload.single('photo'), searchByFace);
router.post('/search-by-object', optionalAuth, upload.single('photo'), searchByObject);
router.post('/search-similar', optionalAuth, upload.single('photo'), searchSimilar);
router.post('/analyze-photo', optionalAuth, upload.single('photo'), analyzePhoto);

// AI status
router.get('/status', getAIStatus);

// ==========================================
// AWS Rekognition Routes (Production-Grade)
// ==========================================

// Single image upload endpoints
router.post('/rekognition/analyze', protect, upload.single('image'), rekognitionAnalyze);
router.post('/rekognition/detect-faces', protect, upload.single('image'), rekognitionDetectFaces);
router.post('/rekognition/search-faces', protect, upload.single('image'), rekognitionSearchFaces);
router.post('/rekognition/check-duplicate', protect, upload.single('image'), rekognitionCheckDuplicate);
router.post('/rekognition/moderate', protect, upload.single('image'), rekognitionModerate);

// Face indexing (requires case ownership)
router.post('/rekognition/index-face', protect, rekognitionIndexFace);

// Face comparison (requires two images)
router.post('/rekognition/compare-faces', protect, upload.fields([
  { name: 'source', maxCount: 1 },
  { name: 'target', maxCount: 1 },
]), rekognitionCompareFaces);

module.exports = router;
