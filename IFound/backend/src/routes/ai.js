const express = require('express');
const router = express.Router();
const {
  searchByFace,
  searchByObject,
  searchSimilar,
  analyzePhoto,
  getAIStatus,
} = require('../controllers/aiController');
const { optionalAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

// AI search endpoints (public)
router.post('/search-by-face', optionalAuth, upload.single('photo'), searchByFace);
router.post('/search-by-object', optionalAuth, upload.single('photo'), searchByObject);
router.post('/search-similar', optionalAuth, upload.single('photo'), searchSimilar);
router.post('/analyze-photo', optionalAuth, upload.single('photo'), analyzePhoto);

// AI status
router.get('/status', getAIStatus);

module.exports = router;
