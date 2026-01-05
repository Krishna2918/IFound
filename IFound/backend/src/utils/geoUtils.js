/**
 * Geographic Utility Functions
 *
 * Contains helpers for calculating distances between coordinates
 * and applying location-based score boosts to matches.
 */

// Earth's radius in miles
const EARTH_RADIUS_MILES = 3958.8;

/**
 * Calculate the Haversine distance between two coordinates
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in miles
 */
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  // Convert to radians
  const toRad = (deg) => deg * (Math.PI / 180);

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
};

/**
 * Calculate location-based score boost using exponential decay
 * Closer items get higher boost, farther items get minimal boost
 *
 * Formula: MAX_BOOST * exp(-distance / (radius * 0.5))
 *
 * Boost Scale (for 50mi default radius):
 * - 0 mi   → +15 pts
 * - 25 mi  → +8 pts
 * - 50 mi  → +4 pts
 * - 100 mi → ~1 pt
 * - 150+ mi → ~0 pts
 *
 * @param {number} distanceMiles - Distance between lost and found locations
 * @param {number} searchRadius - User's search radius (default 50mi)
 * @returns {number} Score boost (0-15)
 */
const calculateLocationBoost = (distanceMiles, searchRadius = 50) => {
  const MAX_BOOST = 15;

  // If distance is 0 or negative, give max boost
  if (distanceMiles <= 0) {
    return MAX_BOOST;
  }

  // Exponential decay based on distance
  const decay = Math.exp(-distanceMiles / (searchRadius * 0.5));

  // Round to nearest integer
  return Math.round(MAX_BOOST * decay);
};

/**
 * Calculate location score (0-100) based on distance
 * This is different from boost - it's a normalized score
 *
 * @param {number} distanceMiles - Distance between locations
 * @param {number} maxDistance - Maximum distance to consider (default 200mi)
 * @returns {number} Score from 0-100 (100 = same location, 0 = very far)
 */
const calculateLocationScore = (distanceMiles, maxDistance = 200) => {
  if (distanceMiles <= 0) {
    return 100;
  }

  if (distanceMiles >= maxDistance) {
    return 0;
  }

  // Linear decay from 100 to 0
  return Math.round(100 * (1 - distanceMiles / maxDistance));
};

/**
 * Extract coordinates from a case's location data
 * Handles various location formats that might be stored
 *
 * @param {Object} caseData - Case object with location data
 * @returns {{ lat: number, lng: number } | null} Coordinates or null if not available
 */
const extractCoordinates = (caseData) => {
  if (!caseData) return null;

  // Check for direct lat/lng fields
  if (caseData.latitude && caseData.longitude) {
    return {
      lat: parseFloat(caseData.latitude),
      lng: parseFloat(caseData.longitude),
    };
  }

  // Check for last_seen_location field (might be JSON or object)
  if (caseData.last_seen_location) {
    const loc = caseData.last_seen_location;

    // If it's already an object with lat/lng
    if (typeof loc === 'object' && loc.lat && loc.lng) {
      return {
        lat: parseFloat(loc.lat),
        lng: parseFloat(loc.lng),
      };
    }

    // If it's an object with latitude/longitude
    if (typeof loc === 'object' && loc.latitude && loc.longitude) {
      return {
        lat: parseFloat(loc.latitude),
        lng: parseFloat(loc.longitude),
      };
    }

    // If it has coordinates array [lng, lat] (GeoJSON format)
    if (typeof loc === 'object' && loc.coordinates && Array.isArray(loc.coordinates)) {
      return {
        lat: parseFloat(loc.coordinates[1]),
        lng: parseFloat(loc.coordinates[0]),
      };
    }

    // Try parsing as JSON string
    if (typeof loc === 'string') {
      try {
        const parsed = JSON.parse(loc);
        if (parsed.lat && parsed.lng) {
          return {
            lat: parseFloat(parsed.lat),
            lng: parseFloat(parsed.lng),
          };
        }
      } catch (e) {
        // Not JSON, continue
      }
    }
  }

  // Check for found_location field
  if (caseData.found_location) {
    const loc = caseData.found_location;
    if (typeof loc === 'object' && loc.lat && loc.lng) {
      return {
        lat: parseFloat(loc.lat),
        lng: parseFloat(loc.lng),
      };
    }
  }

  return null;
};

/**
 * Calculate distance between two cases
 *
 * @param {Object} sourceCase - Source case object
 * @param {Object} targetCase - Target case object
 * @returns {{ distance: number, sourceCoords: Object, targetCoords: Object } | null}
 */
const calculateCaseDistance = (sourceCase, targetCase) => {
  const sourceCoords = extractCoordinates(sourceCase);
  const targetCoords = extractCoordinates(targetCase);

  if (!sourceCoords || !targetCoords) {
    return null;
  }

  const distance = haversineDistance(
    sourceCoords.lat,
    sourceCoords.lng,
    targetCoords.lat,
    targetCoords.lng
  );

  return {
    distance: Math.round(distance * 100) / 100, // Round to 2 decimals
    sourceCoords,
    targetCoords,
  };
};

/**
 * Format distance for display
 *
 * @param {number} miles - Distance in miles
 * @returns {string} Formatted distance string
 */
const formatDistance = (miles) => {
  if (miles < 0.1) {
    return 'Same area';
  }
  if (miles < 1) {
    return `${Math.round(miles * 5280)} ft away`;
  }
  if (miles < 10) {
    return `${miles.toFixed(1)} mi away`;
  }
  return `${Math.round(miles)} mi away`;
};

module.exports = {
  haversineDistance,
  calculateLocationBoost,
  calculateLocationScore,
  extractCoordinates,
  calculateCaseDistance,
  formatDistance,
  EARTH_RADIUS_MILES,
};
