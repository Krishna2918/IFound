/**
 * Visual DNA Matching Service
 *
 * Implements the 3-stage cascade matching algorithm:
 * - Stage 1: Hash Filter (< 50ms) - Quick elimination using perceptual hashes
 * - Stage 2: Feature Match (< 500ms) - Cosine similarity on embeddings
 * - Stage 3: Deep Verification (< 2s) - Detailed comparison with match reasons
 */

const { Op, Sequelize } = require('sequelize');
const VisualDNA = require('../models/VisualDNA');
const Case = require('../models/Case');
const Photo = require('../models/Photo');
const hashingService = require('./hashingService');
const faceRecognitionService = require('./faceRecognitionService');
const logger = require('../config/logger');

// Matching thresholds - Designed for real-world conditions
// (different angles, lighting, screenshots vs photos, etc.)
const THRESHOLDS = {
  HASH_DISTANCE: 25,       // Max Hamming distance for hash match (lenient for angle/crop variance)
  HASH_DISTANCE_STRICT: 12, // Strict threshold for high-confidence matches
  FEATURE_SIMILARITY: 0.35, // Min cosine similarity for feature match (35%)
  FACE_SIMILARITY: 50,     // Min face similarity percentage
  FINAL_CONFIDENCE: 30,    // Min overall confidence to return (lowered for broader matching)
  LABEL_MATCH_BOOST: 15,   // Bonus for matching detected objects/labels
  COLOR_MATCH_BOOST: 10,   // Bonus for matching color palette
  CATEGORY_MATCH_BOOST: 20, // Bonus for same category (book, phone, etc.)
};

/**
 * Calculate cosine similarity between two vectors
 */
const cosineSimilarity = (vec1, vec2) => {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    normA += vec1[i] * vec1[i];
    normB += vec2[i] * vec2[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

/**
 * Stage 1: Broad candidate filter
 * Uses multiple strategies: hash similarity, label matching, and entity type
 * Designed to handle real-world variance (different angles, screenshots, etc.)
 */
const hashFilter = async (queryDNA, options = {}) => {
  const startTime = Date.now();
  const maxCandidates = options.maxCandidates || 100;

  try {
    // Get all Visual DNA records
    const allRecords = await VisualDNA.findAll({
      where: {
        processing_status: 'completed',
      },
      include: [{
        model: Case,
        as: 'case',
        where: { status: 'active' },
        attributes: ['id', 'title', 'case_type', 'bounty_amount', 'status', 'category'],
      }],
      attributes: ['id', 'photo_id', 'case_id', 'entity_type', 'perceptual_hash', 'average_hash',
                   'difference_hash', 'detected_labels', 'dominant_colors', 'color_signature'],
    });

    const candidates = [];

    for (const record of allRecords) {
      let score = 0;
      let matchReasons = [];

      // Strategy 1: Hash-based matching (if hashes exist)
      let hashSimilarity = 0;
      if (queryDNA.perceptual_hash && record.perceptual_hash) {
        let totalDistance = 0;
        let hashCount = 0;

        totalDistance += hashingService.hammingDistance(queryDNA.perceptual_hash, record.perceptual_hash);
        hashCount++;

        if (queryDNA.average_hash && record.average_hash) {
          totalDistance += hashingService.hammingDistance(queryDNA.average_hash, record.average_hash);
          hashCount++;
        }
        if (queryDNA.difference_hash && record.difference_hash) {
          totalDistance += hashingService.hammingDistance(queryDNA.difference_hash, record.difference_hash);
          hashCount++;
        }

        const avgDistance = totalDistance / hashCount;
        hashSimilarity = Math.round(((64 - avgDistance) / 64) * 100);

        // Accept if within lenient threshold
        if (avgDistance <= THRESHOLDS.HASH_DISTANCE) {
          score += hashSimilarity;
          matchReasons.push(`hash:${hashSimilarity}%`);
        }
      }

      // Strategy 2: Label/Object matching (angle-invariant)
      if (queryDNA.detected_labels?.length > 0 && record.detected_labels?.length > 0) {
        const queryLabels = queryDNA.detected_labels.map(l => l.toLowerCase());
        const recordLabels = record.detected_labels.map(l => l.toLowerCase());
        const commonLabels = queryLabels.filter(l => recordLabels.includes(l));

        if (commonLabels.length > 0) {
          const labelScore = (commonLabels.length / Math.max(queryLabels.length, recordLabels.length)) * 100;
          score += THRESHOLDS.LABEL_MATCH_BOOST + (labelScore * 0.5);
          matchReasons.push(`labels:${commonLabels.join(',')}`);
        }
      }

      // Strategy 3: Entity type matching
      if (queryDNA.entity_type && record.entity_type) {
        if (queryDNA.entity_type === record.entity_type && record.entity_type !== 'unknown') {
          score += 10;
          matchReasons.push(`entity:${record.entity_type}`);
        }
      }

      // Strategy 4: Color palette matching (lighting-tolerant)
      if (queryDNA.dominant_colors?.length > 0 && record.dominant_colors?.length > 0) {
        const commonColors = queryDNA.dominant_colors.filter(c =>
          record.dominant_colors.includes(c)
        );
        if (commonColors.length >= 2) {
          score += THRESHOLDS.COLOR_MATCH_BOOST;
          matchReasons.push(`colors:${commonColors.length}`);
        }
      }

      // Strategy 5: Category matching from case
      if (record.case?.category && queryDNA.case_category) {
        if (record.case.category.toLowerCase() === queryDNA.case_category.toLowerCase()) {
          score += THRESHOLDS.CATEGORY_MATCH_BOOST;
          matchReasons.push(`category:${record.case.category}`);
        }
      }

      // Include if any meaningful match found
      if (score > 0 || matchReasons.length > 0) {
        candidates.push({
          record,
          hashDistance: hashSimilarity > 0 ? Math.round((1 - hashSimilarity/100) * 64) : 64,
          hashSimilarity: hashSimilarity,
          broadScore: score,
          matchReasons,
        });
      }
    }

    // Sort by combined score (hash similarity + broad matching bonuses)
    candidates.sort((a, b) => {
      const scoreA = a.hashSimilarity + a.broadScore;
      const scoreB = b.hashSimilarity + b.broadScore;
      return scoreB - scoreA;
    });

    logger.debug(`Broad filter: ${allRecords.length} records -> ${candidates.length} candidates in ${Date.now() - startTime}ms`);

    return {
      candidates: candidates.slice(0, maxCandidates),
      scanned: allRecords.length,
      timeMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Broad filter failed:', error);
    return { candidates: [], scanned: 0, timeMs: Date.now() - startTime, error: error.message };
  }
};

/**
 * Stage 2: Feature-based matching
 * Uses cosine similarity on embeddings for semantic matching
 */
const featureMatch = async (queryDNA, candidates, options = {}) => {
  const startTime = Date.now();
  const maxCandidates = options.maxCandidates || 20;

  try {
    const enrichedCandidates = [];

    for (const candidate of candidates) {
      const scores = {
        hashSimilarity: candidate.hashSimilarity,
        faceSimilarity: 0,
        colorSimilarity: 0,
        entityMatch: false,
      };

      // Fetch full record if needed
      const fullRecord = await VisualDNA.findByPk(candidate.record.id);

      // Face similarity (if both have face embeddings)
      if (queryDNA.face_embedding && fullRecord.face_embedding) {
        scores.faceSimilarity = faceRecognitionService.compareFaces(
          queryDNA.face_embedding,
          fullRecord.face_embedding
        );
      }

      // Color similarity
      if (queryDNA.color_signature && fullRecord.color_signature) {
        scores.colorSimilarity = Math.round(
          cosineSimilarity(queryDNA.color_signature, fullRecord.color_signature) * 100
        );
      }

      // Entity type match bonus
      if (queryDNA.entity_type === fullRecord.entity_type) {
        scores.entityMatch = true;
      }

      // Calculate combined feature score
      let featureScore = candidate.hashSimilarity;

      // Weight face similarity heavily for persons
      if (scores.faceSimilarity > 0) {
        featureScore = (featureScore + scores.faceSimilarity * 2) / 3;
      }

      // Add color similarity
      if (scores.colorSimilarity > 0) {
        featureScore = (featureScore * 2 + scores.colorSimilarity) / 3;
      }

      // Entity match bonus
      if (scores.entityMatch) {
        featureScore += 5;
      }

      enrichedCandidates.push({
        ...candidate,
        fullRecord,
        scores,
        featureScore: Math.round(featureScore),
      });
    }

    // Filter by threshold and sort
    const filtered = enrichedCandidates
      .filter(c => c.featureScore >= THRESHOLDS.FEATURE_SIMILARITY * 100)
      .sort((a, b) => b.featureScore - a.featureScore);

    logger.debug(`Feature match: ${candidates.length} candidates -> ${filtered.length} matches in ${Date.now() - startTime}ms`);

    return {
      matches: filtered.slice(0, maxCandidates),
      timeMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Feature match failed:', error);
    return { matches: [], timeMs: Date.now() - startTime, error: error.message };
  }
};

/**
 * Stage 3: Deep verification with match reasons
 * Detailed comparison and reason generation
 */
const deepVerification = async (queryDNA, matches, options = {}) => {
  const startTime = Date.now();

  try {
    const verifiedMatches = [];

    for (const match of matches) {
      const reasons = [];
      const fullRecord = match.fullRecord;

      // Generate match reasons based on entity type
      const entityType = fullRecord.entity_type;

      // Face matching reasons
      if (match.scores.faceSimilarity > 0) {
        reasons.push({
          type: 'face',
          label: `Face similarity: ${Math.round(match.scores.faceSimilarity)}%`,
          score: match.scores.faceSimilarity,
          weight: 3,
        });
      }

      // Hash similarity reason
      if (match.scores.hashSimilarity > 80) {
        reasons.push({
          type: 'visual',
          label: 'Visually similar image',
          score: match.scores.hashSimilarity,
          weight: 2,
        });
      }

      // Color matching
      if (match.scores.colorSimilarity > 70) {
        reasons.push({
          type: 'color',
          label: 'Color palette match',
          score: match.scores.colorSimilarity,
          weight: 1,
        });
      }

      // Dominant colors
      if (queryDNA.dominant_colors?.length > 0 && fullRecord.dominant_colors?.length > 0) {
        const commonColors = queryDNA.dominant_colors.filter(c =>
          fullRecord.dominant_colors.includes(c)
        );
        if (commonColors.length > 0) {
          reasons.push({
            type: 'color',
            label: `Same colors detected: ${commonColors.join(', ')}`,
            score: (commonColors.length / Math.max(queryDNA.dominant_colors.length, fullRecord.dominant_colors.length)) * 100,
            weight: 1,
          });
        }
      }

      // Object matching
      if (queryDNA.detected_labels?.length > 0 && fullRecord.detected_labels?.length > 0) {
        const commonObjects = queryDNA.detected_labels.filter(obj =>
          fullRecord.detected_labels.includes(obj)
        );
        if (commonObjects.length > 0) {
          reasons.push({
            type: 'object',
            label: `Same objects detected: ${commonObjects.join(', ')}`,
            score: (commonObjects.length / queryDNA.detected_labels.length) * 100,
            weight: 2,
          });
        }
      }

      // OCR matching (serial numbers, plates)
      if (queryDNA.ocr_text && fullRecord.ocr_text) {
        // Check for matching identifiers
        const queryIds = extractAllIdentifiers(queryDNA.ocr_text);
        const recordIds = extractAllIdentifiers(fullRecord.ocr_text);

        const matchingIds = queryIds.filter(id => recordIds.includes(id));

        if (matchingIds.length > 0) {
          reasons.push({
            type: 'identifier',
            label: `Matching ID found: ${matchingIds[0]}`,
            score: 100,
            weight: 5, // High weight for exact ID match
          });
        }
      }

      // Entity type match
      if (queryDNA.entity_type === fullRecord.entity_type && fullRecord.entity_type !== 'unknown') {
        reasons.push({
          type: 'entity',
          label: `Same type: ${fullRecord.entity_type}`,
          score: 80,
          weight: 1,
        });
      }

      // Calculate final weighted confidence
      let totalWeight = 0;
      let weightedScore = 0;

      for (const reason of reasons) {
        weightedScore += reason.score * reason.weight;
        totalWeight += reason.weight;
      }

      const confidence = totalWeight > 0 ? weightedScore / totalWeight : match.featureScore;

      // Only include if above threshold
      if (confidence >= THRESHOLDS.FINAL_CONFIDENCE) {
        verifiedMatches.push({
          visual_dna_id: fullRecord.id,
          photo_id: fullRecord.photo_id,
          case_id: fullRecord.case_id,
          case: match.record.case,
          entity_type: fullRecord.entity_type,
          match_confidence: Math.round(confidence),
          match_reasons: reasons.map(r => r.label),
          detailed_scores: {
            hash: match.scores.hashSimilarity,
            face: match.scores.faceSimilarity,
            color: match.scores.colorSimilarity,
            feature: match.featureScore,
            final: Math.round(confidence),
          },
        });
      }
    }

    // Sort by confidence
    verifiedMatches.sort((a, b) => b.match_confidence - a.match_confidence);

    logger.debug(`Deep verification: ${matches.length} matches -> ${verifiedMatches.length} verified in ${Date.now() - startTime}ms`);

    return {
      results: verifiedMatches,
      timeMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Deep verification failed:', error);
    return { results: [], timeMs: Date.now() - startTime, error: error.message };
  }
};

/**
 * Extract all identifiers from OCR text
 */
const extractAllIdentifiers = (text) => {
  if (!text) return [];

  const identifiers = [];

  // Serial numbers
  const serialPatterns = [
    /\b[A-Z]{2,3}-?\d{5,10}\b/gi,
    /\b\d{2,4}-\d{4,6}-\d{2,4}\b/g,
    /\b[A-Z0-9]{8,15}\b/g,
  ];

  // License plates
  const platePatterns = [
    /\b[A-Z]{2,3}\s?\d{1,4}\s?[A-Z]{0,3}\b/g,
    /\b\d{1,4}\s?[A-Z]{2,3}\s?\d{1,4}\b/g,
  ];

  const allPatterns = [...serialPatterns, ...platePatterns];

  for (const pattern of allPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      identifiers.push(...matches.map(m => m.replace(/\s+/g, '').toUpperCase()));
    }
  }

  return [...new Set(identifiers)];
};

/**
 * Full cascade search
 *
 * @param {Object} queryDNA - Query image's Visual DNA
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results
 */
const cascadeSearch = async (queryDNA, options = {}) => {
  const startTime = Date.now();

  try {
    // Stage 1: Hash filter
    const stage1 = await hashFilter(queryDNA, { maxCandidates: 100 });

    if (stage1.candidates.length === 0) {
      return {
        success: true,
        matches: [],
        message: 'No similar images found',
        metadata: {
          total_scanned: stage1.scanned,
          processing_time_ms: Date.now() - startTime,
          stages: { hash_filter: stage1.timeMs },
        },
      };
    }

    // Stage 2: Feature matching
    const stage2 = await featureMatch(queryDNA, stage1.candidates, { maxCandidates: 20 });

    if (stage2.matches.length === 0) {
      return {
        success: true,
        matches: [],
        message: 'No matches passed feature verification',
        metadata: {
          total_scanned: stage1.scanned,
          candidates_after_hash: stage1.candidates.length,
          processing_time_ms: Date.now() - startTime,
          stages: {
            hash_filter: stage1.timeMs,
            feature_match: stage2.timeMs,
          },
        },
      };
    }

    // Stage 3: Deep verification
    const stage3 = await deepVerification(queryDNA, stage2.matches, options);

    // Fetch case details for results
    const results = await Promise.all(stage3.results.map(async (result) => {
      const caseData = await Case.findByPk(result.case_id, {
        attributes: ['id', 'title', 'case_type', 'bounty_amount', 'status', 'description'],
      });

      const photo = await Photo.findByPk(result.photo_id, {
        attributes: ['id', 'image_url', 'thumbnail_url', 'is_primary'],
      });

      return {
        case_id: result.case_id,
        case_title: caseData?.title || 'Unknown',
        case_type: caseData?.case_type || 'unknown',
        case_status: caseData?.status || 'unknown',
        bounty_amount: caseData?.bounty_amount || 0,
        match_confidence: result.match_confidence,
        match_reasons: result.match_reasons,
        primary_photo: photo?.image_url || photo?.thumbnail_url,
        entity_type: result.entity_type,
        detailed_scores: result.detailed_scores,
      };
    }));

    return {
      success: true,
      matches: results,
      message: `Found ${results.length} potential matches`,
      metadata: {
        total_scanned: stage1.scanned,
        candidates_after_hash: stage1.candidates.length,
        candidates_after_features: stage2.matches.length,
        final_matches: stage3.results.length,
        processing_time_ms: Date.now() - startTime,
        stages: {
          hash_filter: stage1.timeMs,
          feature_match: stage2.timeMs,
          deep_verification: stage3.timeMs,
        },
        algorithm_version: require('./visualDNAService').ALGORITHM_VERSION,
      },
    };
  } catch (error) {
    logger.error('Cascade search failed:', error);
    return {
      success: false,
      matches: [],
      message: 'Search failed: ' + error.message,
      metadata: {
        processing_time_ms: Date.now() - startTime,
        error: error.message,
      },
    };
  }
};

/**
 * Quick similarity check between two Visual DNA records
 */
const quickCompare = async (dna1, dna2) => {
  const hashSim = hashingService.hashSimilarity(dna1.perceptual_hash, dna2.perceptual_hash);

  let faceSim = 0;
  if (dna1.face_embedding && dna2.face_embedding) {
    faceSim = faceRecognitionService.compareFaces(dna1.face_embedding, dna2.face_embedding);
  }

  let colorSim = 0;
  if (dna1.color_signature && dna2.color_signature) {
    colorSim = cosineSimilarity(dna1.color_signature, dna2.color_signature) * 100;
  }

  // Calculate overall similarity
  let total = hashSim;
  let count = 1;

  if (faceSim > 0) {
    total += faceSim * 2; // Weight face higher
    count += 2;
  }

  if (colorSim > 0) {
    total += colorSim;
    count++;
  }

  return {
    overall: Math.round(total / count),
    hash: hashSim,
    face: Math.round(faceSim),
    color: Math.round(colorSim),
    entityMatch: dna1.entity_type === dna2.entity_type,
  };
};

module.exports = {
  cascadeSearch,
  hashFilter,
  featureMatch,
  deepVerification,
  quickCompare,
  cosineSimilarity,
  THRESHOLDS,
};
