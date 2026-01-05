/**
 * Visual DNA Routes
 *
 * Routes for Visual DNA operations:
 * - Smart search (photo upload)
 * - Get Visual DNA for cases
 * - Compare photos
 * - Extract Visual DNA
 * - Statistics
 */

const express = require('express');
const router = express.Router();
const {
  smartSearch,
  getCaseVisualDNA,
  comparePhotos,
  extractVisualDNA,
  getStats,
} = require('../controllers/visualDNAController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

/**
 * @route   POST /api/v1/search/smart
 * @desc    Upload photo to find matching cases
 * @access  Public (optional auth for tracking)
 */
router.post('/search/smart', optionalAuth, upload.single('photo'), smartSearch);

/**
 * @route   GET /api/v1/cases/:id/visual-dna
 * @desc    Get Visual DNA records for a case
 * @access  Public
 */
router.get('/cases/:id/visual-dna', getCaseVisualDNA);

/**
 * @route   POST /api/v1/visual-dna/compare
 * @desc    Compare two photos by their Visual DNA
 * @access  Authenticated
 */
router.post('/visual-dna/compare', authenticateToken, comparePhotos);

/**
 * @route   POST /api/v1/visual-dna/extract
 * @desc    Manually trigger Visual DNA extraction for a photo
 * @access  Admin
 */
router.post('/visual-dna/extract', authenticateToken, extractVisualDNA);

/**
 * @route   GET /api/v1/visual-dna/stats
 * @desc    Get Visual DNA statistics
 * @access  Admin
 */
router.get('/visual-dna/stats', authenticateToken, getStats);

module.exports = router;
