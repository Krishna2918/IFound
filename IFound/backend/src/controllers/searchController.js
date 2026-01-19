/**
 * Search Controller
 *
 * Handles search-related endpoints for cases, including
 * full-text search, geospatial queries, and autocomplete.
 */

const asyncHandler = require('express-async-handler');
const searchService = require('../services/searchService');
const smartPricingService = require('../services/smartPricingService');
const logger = require('../config/logger');

/**
 * Search cases with filters
 * @route GET /api/v1/search/cases
 */
const searchCases = asyncHandler(async (req, res) => {
  const {
    q: query,
    type: caseType,
    category,
    status = 'active',
    minBounty,
    maxBounty,
    lat: latitude,
    lng: longitude,
    radius: radiusKm = 50,
    page = 1,
    limit = 20,
    sort: sortBy = 'relevance',
  } = req.query;

  const result = await searchService.search({
    query,
    caseType,
    category,
    status,
    minBounty: minBounty ? parseFloat(minBounty) : undefined,
    maxBounty: maxBounty ? parseFloat(maxBounty) : undefined,
    latitude: latitude ? parseFloat(latitude) : undefined,
    longitude: longitude ? parseFloat(longitude) : undefined,
    radiusKm: parseFloat(radiusKm),
    page: parseInt(page),
    limit: Math.min(parseInt(limit), 100),
    sortBy,
  });

  res.json(result);
});

/**
 * Get search suggestions (autocomplete)
 * @route GET /api/v1/search/suggestions
 */
const getSuggestions = asyncHandler(async (req, res) => {
  const { q: prefix, limit = 5 } = req.query;

  if (!prefix || prefix.length < 2) {
    return res.json({ suggestions: [] });
  }

  const suggestions = await searchService.getSuggestions(prefix, parseInt(limit));

  res.json({ suggestions });
});

/**
 * Get nearby cases based on user location
 * @route GET /api/v1/search/nearby
 */
const getNearbyCases = asyncHandler(async (req, res) => {
  const {
    lat: latitude,
    lng: longitude,
    radius: radiusKm = 25,
    category,
    type: caseType,
    limit = 20,
  } = req.query;

  if (!latitude || !longitude) {
    return res.status(400).json({
      success: false,
      message: 'Latitude and longitude are required',
    });
  }

  const result = await searchService.search({
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    radiusKm: parseFloat(radiusKm),
    category,
    caseType,
    status: 'active',
    sortBy: 'distance',
    limit: Math.min(parseInt(limit), 50),
    page: 1,
  });

  res.json(result);
});

/**
 * Get bounty pricing suggestion
 * @route POST /api/v1/search/pricing-suggestion
 */
const getPricingSuggestion = asyncHandler(async (req, res) => {
  const {
    category,
    estimatedValue,
    description,
    latitude,
    longitude,
    isUrgent,
    lostDate,
  } = req.body;

  if (!category) {
    return res.status(400).json({
      success: false,
      message: 'Category is required',
    });
  }

  // Estimate value from description if not provided
  let value = estimatedValue;
  if (!value && description) {
    value = smartPricingService.estimateItemValue(description, category);
  }

  const location = latitude && longitude ? { city: 'provided' } : null;

  const suggestion = await smartPricingService.getSuggestion({
    category,
    estimatedValue: value,
    location,
    isUrgent: isUrgent === true,
    lostDate,
  });

  // Add location demand if coordinates provided
  if (latitude && longitude) {
    const demand = await smartPricingService.getLocationDemand(
      parseFloat(latitude),
      parseFloat(longitude)
    );
    suggestion.locationDemand = demand;
  }

  res.json(suggestion);
});

/**
 * Sync all cases to search index (admin only)
 * @route POST /api/v1/search/sync
 */
const syncSearchIndex = asyncHandler(async (req, res) => {
  // Check admin permission
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required',
    });
  }

  const result = await searchService.syncAllCases();

  logger.info(`Search index synced by admin ${req.user.id}`, { synced: result.synced });

  res.json({
    success: true,
    message: `Synced ${result.synced} cases to search index`,
    ...result,
  });
});

/**
 * Get search statistics (admin only)
 * @route GET /api/v1/search/stats
 */
const getSearchStats = asyncHandler(async (req, res) => {
  // Check admin permission
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required',
    });
  }

  res.json({
    success: true,
    stats: {
      searchEngine: searchService.available ? 'elasticsearch' : 'postgresql',
      indexName: searchService.indexName,
      available: searchService.available,
    },
  });
});

module.exports = {
  searchCases,
  getSuggestions,
  getNearbyCases,
  getPricingSuggestion,
  syncSearchIndex,
  getSearchStats,
};
