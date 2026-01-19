/**
 * Search Routes
 *
 * Endpoints for searching cases, autocomplete, and pricing suggestions.
 */

const express = require('express');
const router = express.Router();
const { protect, optionalAuth } = require('../middleware/auth');
const {
  searchCases,
  getSuggestions,
  getNearbyCases,
  getPricingSuggestion,
  syncSearchIndex,
  getSearchStats,
} = require('../controllers/searchController');

// Public search routes (optional auth for personalization)
router.get('/cases', optionalAuth, searchCases);
router.get('/suggestions', getSuggestions);
router.get('/nearby', optionalAuth, getNearbyCases);

// Authenticated routes
router.post('/pricing-suggestion', protect, getPricingSuggestion);

// Admin routes
router.post('/sync', protect, syncSearchIndex);
router.get('/stats', protect, getSearchStats);

module.exports = router;
