/**
 * Case Creator Helper
 *
 * API helper for creating cases and uploading photos during test data seeding.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const {
  API_BASE_URL,
  SEED_CONFIG,
  generateRandomLocation,
  generateCaseTitle,
  generateCaseDescription,
} = require('../config');

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a case via API
 */
async function createCase(token, caseData) {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/cases`,
      caseData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    return response.data?.data?.case || response.data?.case || response.data;
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    throw new Error(`Failed to create case: ${message}`);
  }
}

/**
 * Upload a photo to a case
 */
async function uploadPhoto(token, caseId, imagePath) {
  try {
    const form = new FormData();
    form.append('photos', fs.createReadStream(imagePath));

    const response = await axios.post(
      `${API_BASE_URL}/photos/${caseId}/photos`,
      form,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...form.getHeaders(),
        },
        timeout: 60000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    return response.data?.data?.photos?.[0] || response.data?.photos?.[0] || response.data;
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    throw new Error(`Failed to upload photo: ${message}`);
  }
}

/**
 * Create a case with photo in one operation
 */
async function createCaseWithPhoto(token, options) {
  const {
    imagePath,
    category,
    type, // 'lost' or 'found'
    customData = {},
  } = options;

  // Generate location
  const location = generateRandomLocation();

  // Generate title and description
  const isLost = type === 'lost';
  const title = generateCaseTitle(category, isLost);
  const description = generateCaseDescription(category, isLost, location);

  // Prepare case data - use API field names
  const randomDate = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);
  const caseData = {
    case_type: isLost ? 'lost_item' : 'found_item',
    title,
    description,
    bounty_amount: isLost ? Math.floor(Math.random() * 50) : 0, // Lost items get random bounty 0-50, found items get 0
    item_category: category,
    last_seen_location: `${location.city}, ${location.state}`,
    last_seen_date: isLost ? randomDate.toISOString() : null,
    found_date_time: !isLost ? randomDate.toISOString() : null,
    search_radius: 25 + Math.floor(Math.random() * 50), // Random 25-75 km
    ...customData,
  };

  // Create case
  const createdCase = await createCase(token, caseData);
  const caseId = createdCase.id;

  // Upload photo
  const photo = await uploadPhoto(token, caseId, imagePath);

  return {
    caseId,
    photoId: photo.id,
    visualDnaId: photo.visual_dna_id,
    type,
    category,
    location,
    imagePath: path.basename(imagePath),
  };
}

/**
 * Create multiple cases in batch with progress tracking
 */
async function createCasesInBatch(token, items, type, onProgress = null) {
  const results = [];
  const failures = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    try {
      const result = await createCaseWithPhoto(token, {
        imagePath: item.imagePath,
        category: item.category,
        type,
        customData: item.customData,
      });

      results.push({
        ...result,
        originalFilename: item.filename,
        pairId: item.pairId,
      });

      if (onProgress) {
        onProgress(i + 1, items.length, 'success', item.filename);
      }
    } catch (error) {
      failures.push({
        filename: item.filename,
        error: error.message,
      });

      if (onProgress) {
        onProgress(i + 1, items.length, 'failed', item.filename, error.message);
      }
    }

    // Rate limiting
    await sleep(SEED_CONFIG.delayBetweenCases);
  }

  return { results, failures };
}

/**
 * Get all photos for a case
 */
async function getCasePhotos(token, caseId) {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/cases/${caseId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 30000,
      }
    );

    return response.data.case?.photos || response.data.photos || [];
  } catch (error) {
    return [];
  }
}

/**
 * Get matches for a photo
 */
async function getPhotoMatches(token, photoId) {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/matches/photo/${photoId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 30000,
      }
    );

    return response.data.matches || response.data || [];
  } catch (error) {
    return [];
  }
}

module.exports = {
  createCase,
  uploadPhoto,
  createCaseWithPhoto,
  createCasesInBatch,
  getCasePhotos,
  getPhotoMatches,
  sleep,
};
