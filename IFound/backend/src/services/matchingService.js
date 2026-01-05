/**
 * Smart Matching Service
 *
 * The brain of the IFound matching system.
 * When a photo is uploaded, this service:
 * 1. Extracts fingerprints (hashes, OCR, visual features)
 * 2. Compares against all existing photos in opposite case types
 * 3. Calculates multi-dimensional similarity scores
 * 4. Creates match records for high-confidence matches
 * 5. Triggers notifications to relevant users
 *
 * Matching Strategy:
 * - Found item photos are compared against Lost item photos
 * - Lost item photos are compared against Found item photos
 * - Uses fast hash filtering first, then detailed comparison
 */

const { Op } = require('sequelize');
const { Photo, Case, VisualDNA } = require('../models');
const PhotoMatch = require('../models/PhotoMatch');
const hashingService = require('./hashingService');
const ocrService = require('./ocrService');
const logger = require('../config/logger');

// Matching thresholds
const THRESHOLDS = {
  HASH_SIMILARITY_MIN: 70,      // Minimum hash similarity to consider
  OCR_SIMILARITY_MIN: 60,       // Minimum OCR text similarity
  LICENSE_PLATE_EXACT: 90,      // Near-exact license plate match
  SERIAL_NUMBER_EXACT: 95,      // Near-exact serial number match
  OVERALL_MATCH_MIN: 65,        // Minimum overall score to create match
  HIGH_CONFIDENCE: 85,          // High confidence match (auto-notify)
};

// Weight factors for scoring
const WEIGHTS = {
  HASH: 0.25,           // Perceptual hash similarity
  OCR_TEXT: 0.15,       // General OCR text match
  LICENSE_PLATE: 0.35,  // License plate exact match (high value)
  SERIAL_NUMBER: 0.35,  // Serial number match (high value)
  COLOR: 0.10,          // Color similarity
  VISUAL: 0.15,         // Visual feature similarity
};

/**
 * Find potential matches for a newly uploaded photo
 *
 * @param {string} photoId - The photo that was just uploaded
 * @param {string} caseId - The case this photo belongs to
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<Array>} Array of match records created
 */
const findMatchesForPhoto = async (photoId, caseId, imagePath) => {
  const startTime = Date.now();
  logger.info(`Starting match search for photo ${photoId}`);

  try {
    // Get the source case to know if it's found/lost
    const sourceCase = await Case.findByPk(caseId);
    if (!sourceCase) {
      throw new Error(`Case not found: ${caseId}`);
    }

    // Get or create Visual DNA for this photo
    let sourceVisualDNA = await VisualDNA.findOne({ where: { photo_id: photoId } });

    // If Visual DNA not ready, extract fingerprints now
    if (!sourceVisualDNA || sourceVisualDNA.processing_status !== 'completed') {
      logger.info(`Extracting fingerprints for photo ${photoId}`);
      sourceVisualDNA = await extractFingerprints(photoId, caseId, imagePath);
    }

    // Determine opposite case type to search
    const oppositeType = sourceCase.case_type === 'found_item' ? 'lost_item' : 'found_item';

    // Find all photos from opposite type cases that have Visual DNA
    const candidatePhotos = await findCandidatePhotos(oppositeType, sourceVisualDNA);
    logger.info(`Found ${candidatePhotos.length} candidate photos to compare`);

    // Compare and score each candidate
    const matches = [];
    for (const candidate of candidatePhotos) {
      const matchResult = await comparePhotos(sourceVisualDNA, candidate);

      if (matchResult.overallScore >= THRESHOLDS.OVERALL_MATCH_MIN) {
        matches.push({
          targetPhotoId: candidate.photo_id,
          targetCaseId: candidate.case_id,
          ...matchResult,
        });
      }
    }

    // Sort by score (highest first)
    matches.sort((a, b) => b.overallScore - a.overallScore);

    // Create match records
    const createdMatches = [];
    for (const match of matches) {
      try {
        const record = await PhotoMatch.create({
          source_photo_id: photoId,
          source_case_id: caseId,
          target_photo_id: match.targetPhotoId,
          target_case_id: match.targetCaseId,
          overall_score: match.overallScore,
          hash_score: match.hashScore,
          ocr_score: match.ocrScore,
          color_score: match.colorScore,
          visual_score: match.visualScore,
          match_type: match.matchType,
          match_details: match.details,
          matched_identifiers: match.matchedIdentifiers,
          status: match.overallScore >= THRESHOLDS.HIGH_CONFIDENCE ? 'pending' : 'pending',
        });

        createdMatches.push(record);
        logger.info(`Created match: ${photoId} <-> ${match.targetPhotoId} (score: ${match.overallScore})`);
      } catch (err) {
        // Duplicate match - skip
        if (err.name === 'SequelizeUniqueConstraintError') {
          logger.debug(`Match already exists: ${photoId} <-> ${match.targetPhotoId}`);
        } else {
          throw err;
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`Match search completed in ${duration}ms. Found ${createdMatches.length} matches.`);

    return createdMatches;
  } catch (error) {
    logger.error(`Match search failed for photo ${photoId}:`, error);
    throw error;
  }
};

/**
 * Extract fingerprints for a photo (lightweight version for matching)
 */
const extractFingerprints = async (photoId, caseId, imagePath) => {
  const fs = require('fs');

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  const imageBuffer = fs.readFileSync(imagePath);

  // Extract in parallel
  const [hashes, ocrResult] = await Promise.all([
    hashingService.computeAllHashes(imageBuffer).catch(err => {
      logger.warn('Hash extraction failed:', err.message);
      return null;
    }),
    ocrService.extractText(imagePath).catch(err => {
      logger.warn('OCR extraction failed:', err.message);
      return { text: '', identifiers: {}, confidence: 0 };
    }),
  ]);

  // Get or create Visual DNA record
  let visualDNA = await VisualDNA.findOne({ where: { photo_id: photoId } });

  if (visualDNA) {
    // Update existing
    visualDNA.perceptual_hash = hashes?.perceptualHash || visualDNA.perceptual_hash;
    visualDNA.average_hash = hashes?.averageHash || visualDNA.average_hash;
    visualDNA.difference_hash = hashes?.differenceHash || visualDNA.difference_hash;
    visualDNA.ocr_text = ocrResult?.text || visualDNA.ocr_text;
    visualDNA.ocr_confidence = ocrResult?.confidence || visualDNA.ocr_confidence;
    visualDNA.match_hints = {
      ...visualDNA.match_hints,
      licensePlates: ocrResult?.identifiers?.licensePlates || [],
      serialNumbers: ocrResult?.identifiers?.serialNumbers || [],
      hasLicensePlate: (ocrResult?.identifiers?.licensePlates?.length || 0) > 0,
      hasSerialNumber: (ocrResult?.identifiers?.serialNumbers?.length || 0) > 0,
    };
    visualDNA.processing_status = 'completed';
    await visualDNA.save();
  } else {
    // Create new
    visualDNA = await VisualDNA.create({
      photo_id: photoId,
      case_id: caseId,
      perceptual_hash: hashes?.perceptualHash,
      average_hash: hashes?.averageHash,
      difference_hash: hashes?.differenceHash,
      ocr_text: ocrResult?.text,
      ocr_confidence: ocrResult?.confidence,
      match_hints: {
        licensePlates: ocrResult?.identifiers?.licensePlates || [],
        serialNumbers: ocrResult?.identifiers?.serialNumbers || [],
        hasLicensePlate: (ocrResult?.identifiers?.licensePlates?.length || 0) > 0,
        hasSerialNumber: (ocrResult?.identifiers?.serialNumbers?.length || 0) > 0,
      },
      processing_status: 'completed',
      algorithm_version: '2.0.0',
    });
  }

  return visualDNA;
};

/**
 * Find candidate photos to compare against
 */
const findCandidatePhotos = async (caseType, sourceVisualDNA) => {
  // Get active cases of the opposite type
  const cases = await Case.findAll({
    where: {
      case_type: caseType,
      status: 'active',
    },
    attributes: ['id'],
  });

  const caseIds = cases.map(c => c.id);

  if (caseIds.length === 0) {
    return [];
  }

  // Find Visual DNA records for these cases
  const candidates = await VisualDNA.findAll({
    where: {
      case_id: { [Op.in]: caseIds },
      processing_status: 'completed',
    },
  });

  // Quick pre-filter: prioritize photos that might match
  // If source has license plate, prioritize candidates with license plates
  const sourceHints = sourceVisualDNA.match_hints || {};

  if (sourceHints.hasLicensePlate) {
    // Move license plate candidates to front
    candidates.sort((a, b) => {
      const aHasPlate = a.match_hints?.hasLicensePlate ? 1 : 0;
      const bHasPlate = b.match_hints?.hasLicensePlate ? 1 : 0;
      return bHasPlate - aHasPlate;
    });
  }

  return candidates;
};

/**
 * Compare two photos and calculate similarity scores
 */
const comparePhotos = async (source, target) => {
  const scores = {
    hashScore: 0,
    ocrScore: 0,
    colorScore: 0,
    visualScore: 0,
  };

  const details = {};
  const matchedIdentifiers = {
    licensePlates: [],
    serialNumbers: [],
    documentIds: [],
  };

  let matchType = 'combined';
  let hasHighValueMatch = false;

  // 1. Hash Similarity (fast)
  if (source.perceptual_hash && target.perceptual_hash) {
    const pHashSim = hashingService.hashSimilarity(source.perceptual_hash, target.perceptual_hash);
    const aHashSim = hashingService.hashSimilarity(source.average_hash, target.average_hash);
    const dHashSim = hashingService.hashSimilarity(source.difference_hash, target.difference_hash);

    // Use weighted average (pHash is most reliable)
    scores.hashScore = Math.round(pHashSim * 0.5 + aHashSim * 0.25 + dHashSim * 0.25);

    details.hashSimilarity = {
      perceptual: pHashSim,
      average: aHashSim,
      difference: dHashSim,
      combined: scores.hashScore,
    };
  }

  // 2. License Plate Matching (high value)
  const sourcePlates = source.match_hints?.licensePlates || [];
  const targetPlates = target.match_hints?.licensePlates || [];

  if (sourcePlates.length > 0 && targetPlates.length > 0) {
    const plateMatch = findBestMatch(sourcePlates, targetPlates);
    if (plateMatch.similarity >= THRESHOLDS.LICENSE_PLATE_EXACT) {
      scores.ocrScore = 100;
      matchedIdentifiers.licensePlates.push({
        source: plateMatch.source,
        target: plateMatch.target,
        similarity: plateMatch.similarity,
      });
      matchType = 'license_plate';
      hasHighValueMatch = true;
      details.licensePlateMatch = plateMatch;
    }
  }

  // 3. Serial Number Matching (high value)
  const sourceSerials = source.match_hints?.serialNumbers || [];
  const targetSerials = target.match_hints?.serialNumbers || [];

  if (sourceSerials.length > 0 && targetSerials.length > 0) {
    const serialMatch = findBestMatch(sourceSerials, targetSerials);
    if (serialMatch.similarity >= THRESHOLDS.SERIAL_NUMBER_EXACT) {
      scores.ocrScore = Math.max(scores.ocrScore, 100);
      matchedIdentifiers.serialNumbers.push({
        source: serialMatch.source,
        target: serialMatch.target,
        similarity: serialMatch.similarity,
      });
      matchType = hasHighValueMatch ? 'combined' : 'serial_number';
      hasHighValueMatch = true;
      details.serialNumberMatch = serialMatch;
    }
  }

  // 4. General OCR Text Similarity
  if (!hasHighValueMatch && source.ocr_text && target.ocr_text) {
    const textSim = calculateTextSimilarity(source.ocr_text, target.ocr_text);
    scores.ocrScore = Math.round(textSim * 100);
    details.textSimilarity = textSim;

    if (scores.ocrScore >= THRESHOLDS.OCR_SIMILARITY_MIN) {
      matchType = 'text';
    }
  }

  // 5. Color Similarity
  if (source.color_signature && target.color_signature) {
    const colorSim = calculateVectorSimilarity(source.color_signature, target.color_signature);
    scores.colorScore = Math.round(colorSim * 100);
    details.colorSimilarity = colorSim;
  }

  // Calculate overall score
  let overallScore;

  if (hasHighValueMatch) {
    // High-value matches (license plate, serial number) get boosted score
    overallScore = Math.min(100, Math.round(
      scores.hashScore * 0.2 +
      scores.ocrScore * 0.6 +
      scores.colorScore * 0.1 +
      scores.visualScore * 0.1
    ));
  } else {
    // Standard weighting
    overallScore = Math.round(
      scores.hashScore * WEIGHTS.HASH +
      scores.ocrScore * WEIGHTS.OCR_TEXT +
      scores.colorScore * WEIGHTS.COLOR +
      scores.visualScore * WEIGHTS.VISUAL
    ) * 2; // Scale up since we're not using all weights
  }

  // Ensure score is in valid range
  overallScore = Math.min(100, Math.max(0, overallScore));

  return {
    overallScore,
    hashScore: scores.hashScore,
    ocrScore: scores.ocrScore,
    colorScore: scores.colorScore,
    visualScore: scores.visualScore,
    matchType,
    details,
    matchedIdentifiers,
  };
};

/**
 * Find the best matching string between two arrays
 */
const findBestMatch = (sourceArray, targetArray) => {
  let bestMatch = { source: '', target: '', similarity: 0 };

  for (const source of sourceArray) {
    for (const target of targetArray) {
      const similarity = calculateStringSimilarity(
        normalizeIdentifier(source),
        normalizeIdentifier(target)
      );

      if (similarity > bestMatch.similarity) {
        bestMatch = { source, target, similarity };
      }
    }
  }

  return bestMatch;
};

/**
 * Normalize identifier for comparison (remove spaces, special chars)
 */
const normalizeIdentifier = (str) => {
  return str
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
};

/**
 * Calculate string similarity (Levenshtein-based)
 */
const calculateStringSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 100;

  const len1 = str1.length;
  const len2 = str2.length;
  const maxLen = Math.max(len1, len2);

  if (maxLen === 0) return 100;

  // Create distance matrix
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[len1][len2];
  return Math.round(((maxLen - distance) / maxLen) * 100);
};

/**
 * Calculate text similarity (word overlap)
 */
const calculateTextSimilarity = (text1, text2) => {
  if (!text1 || !text2) return 0;

  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;

  return intersection / union; // Jaccard similarity
};

/**
 * Calculate vector similarity (cosine)
 */
const calculateVectorSimilarity = (vec1, vec2) => {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
};

/**
 * Get matches for a case (items that might match this lost/found item)
 */
const getMatchesForCase = async (caseId, userId = null) => {
  const matches = await PhotoMatch.findAll({
    where: {
      [Op.or]: [
        { source_case_id: caseId },
        { target_case_id: caseId },
      ],
      overall_score: { [Op.gte]: THRESHOLDS.OVERALL_MATCH_MIN },
    },
    order: [['overall_score', 'DESC'], ['created_at', 'DESC']],
    include: [
      {
        model: Photo,
        as: 'sourcePhoto',
        attributes: ['id', 'image_url', 'case_id'],
      },
      {
        model: Photo,
        as: 'targetPhoto',
        attributes: ['id', 'image_url', 'case_id'],
      },
    ],
  });

  return matches;
};

/**
 * Get pending matches for a user (across all their cases)
 */
const getPendingMatchesForUser = async (userId) => {
  // Get user's cases
  const userCases = await Case.findAll({
    where: { poster_id: userId },
    attributes: ['id'],
  });

  const caseIds = userCases.map(c => c.id);

  if (caseIds.length === 0) {
    return [];
  }

  const matches = await PhotoMatch.findAll({
    where: {
      [Op.or]: [
        { source_case_id: { [Op.in]: caseIds } },
        { target_case_id: { [Op.in]: caseIds } },
      ],
      status: { [Op.in]: ['pending', 'notified'] },
      overall_score: { [Op.gte]: THRESHOLDS.OVERALL_MATCH_MIN },
    },
    order: [['overall_score', 'DESC'], ['created_at', 'DESC']],
  });

  return matches;
};

/**
 * Mark match as viewed
 */
const markMatchViewed = async (matchId, userId) => {
  const match = await PhotoMatch.findByPk(matchId);
  if (!match) return null;

  match.status = 'viewed';
  match.viewed_at = new Date();
  await match.save();

  return match;
};

/**
 * User feedback on match
 */
const submitMatchFeedback = async (matchId, userId, feedback, isSourceUser) => {
  const match = await PhotoMatch.findByPk(matchId);
  if (!match) return null;

  if (isSourceUser) {
    match.source_user_feedback = feedback;
  } else {
    match.target_user_feedback = feedback;
  }

  // If both users confirmed, mark as confirmed
  if (match.source_user_feedback === 'confirmed' && match.target_user_feedback === 'confirmed') {
    match.status = 'confirmed';
    match.resolved_at = new Date();
  } else if (feedback === 'rejected') {
    match.status = 'rejected';
    match.resolved_at = new Date();
  }

  await match.save();
  return match;
};

module.exports = {
  findMatchesForPhoto,
  getMatchesForCase,
  getPendingMatchesForUser,
  markMatchViewed,
  submitMatchFeedback,
  extractFingerprints,
  THRESHOLDS,
};
