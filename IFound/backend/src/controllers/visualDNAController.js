/**
 * Visual DNA Controller
 *
 * API endpoints for Visual DNA operations:
 * - Smart search (upload photo, find matches)
 * - Get Visual DNA for a case
 * - Compare two photos
 */

const path = require('path');
const fs = require('fs');
const visualDNAService = require('../services/visualDNAService');
const visualDNAMatchingService = require('../services/visualDNAMatchingService');
const VisualDNA = require('../models/VisualDNA');
const Case = require('../models/Case');
const Photo = require('../models/Photo');
const logger = require('../config/logger');

/**
 * Smart Search - Upload photo to find matching cases
 * POST /api/v1/search/smart
 */
const smartSearch = async (req, res) => {
  const startTime = Date.now();

  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an image to search',
      });
    }

    logger.info('Smart search initiated', {
      filename: req.file.originalname,
      size: req.file.size,
      userId: req.user?.id,
    });

    // Extract Visual DNA from uploaded image
    const queryDNA = await visualDNAService.extractFromBuffer(req.file.buffer);

    if (queryDNA.processing_status === 'failed') {
      return res.status(400).json({
        success: false,
        message: 'Could not process uploaded image',
        error: queryDNA.processing_error,
      });
    }

    // Run cascade search
    const searchResult = await visualDNAMatchingService.cascadeSearch(queryDNA, {
      maxResults: req.query.limit ? parseInt(req.query.limit) : 10,
    });

    // Log search for analytics
    logger.audit('smart_search', req.user?.id || 'anonymous', {
      matchCount: searchResult.matches.length,
      processingTime: searchResult.metadata.processing_time_ms,
      entityType: queryDNA.entity_type,
    });

    // Format response
    res.json({
      success: true,
      message: searchResult.message,
      data: {
        matches: searchResult.matches.map(match => ({
          case_id: match.case_id,
          case_title: match.case_title,
          case_type: match.case_type,
          match_confidence: match.match_confidence,
          match_reasons: match.match_reasons,
          primary_photo: match.primary_photo,
          bounty_amount: match.bounty_amount,
        })),
        query_analysis: {
          entity_type: queryDNA.entity_type,
          has_face: !!queryDNA.face_embedding,
          has_text: !!queryDNA.ocr_text,
          detected_objects: queryDNA.detected_labels,
          quality_score: queryDNA.quality_score,
        },
        search_metadata: {
          processing_time_ms: searchResult.metadata.processing_time_ms,
          candidates_scanned: searchResult.metadata.total_scanned,
          algorithm_version: searchResult.metadata.algorithm_version,
        },
      },
    });
  } catch (error) {
    logger.error('Smart search failed:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Get Visual DNA for a specific case
 * GET /api/v1/cases/:id/visual-dna
 */
const getCaseVisualDNA = async (req, res) => {
  try {
    const { id: caseId } = req.params;

    // Verify case exists
    const caseRecord = await Case.findByPk(caseId);
    if (!caseRecord) {
      return res.status(404).json({
        success: false,
        message: 'Case not found',
      });
    }

    // Get Visual DNA records
    const visualDNARecords = await visualDNAService.getVisualDNAForCase(caseId);

    // Format response with DNA v2.0 fields
    const formattedRecords = visualDNARecords.map(record => ({
      id: record.id,
      photo_id: record.photo_id,
      entity_type: record.entity_type,
      entity_confidence: record.entity_confidence,
      quality_score: record.quality_score,
      quality_tier: record.quality_tier,
      has_face: !!record.face_embedding,
      has_ocr: !!record.ocr_text,
      detected_objects: record.detected_labels,
      dominant_colors: record.dominant_colors,
      processing_status: record.processing_status,
      created_at: record.createdAt,
      // DNA v2.0 fields (human-readable)
      dna_v2_id: record.dna_v2_id,
      color_code: record.color_code,
      shape_code: record.shape_code,
      searchable_colors: record.searchable_colors,
      neural_embedding_hash: record.neural_embedding_hash,
      algorithm_version: record.algorithm_version,
    }));

    res.json({
      success: true,
      data: {
        case_id: caseId,
        visual_dna_count: formattedRecords.length,
        records: formattedRecords,
      },
    });
  } catch (error) {
    logger.error('Get case Visual DNA failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve Visual DNA',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Compare two photos directly
 * POST /api/v1/visual-dna/compare
 */
const comparePhotos = async (req, res) => {
  try {
    const { photo_id_1, photo_id_2 } = req.body;

    if (!photo_id_1 || !photo_id_2) {
      return res.status(400).json({
        success: false,
        message: 'Both photo_id_1 and photo_id_2 are required',
      });
    }

    // Get Visual DNA for both photos
    const [dna1, dna2] = await Promise.all([
      VisualDNA.findOne({ where: { photo_id: photo_id_1, processing_status: 'completed' } }),
      VisualDNA.findOne({ where: { photo_id: photo_id_2, processing_status: 'completed' } }),
    ]);

    if (!dna1 || !dna2) {
      return res.status(404).json({
        success: false,
        message: 'Visual DNA not found for one or both photos',
        details: {
          photo_1_found: !!dna1,
          photo_2_found: !!dna2,
        },
      });
    }

    // Quick compare
    const comparison = await visualDNAMatchingService.quickCompare(dna1, dna2);

    // Generate detailed comparison
    const matchReasons = [];

    if (comparison.hash > 80) {
      matchReasons.push(`Visual similarity: ${comparison.hash}%`);
    }
    if (comparison.face > 60) {
      matchReasons.push(`Face similarity: ${comparison.face}%`);
    }
    if (comparison.color > 70) {
      matchReasons.push(`Color match: ${comparison.color}%`);
    }
    if (comparison.entityMatch) {
      matchReasons.push(`Same entity type: ${dna1.entity_type}`);
    }

    res.json({
      success: true,
      data: {
        overall_similarity: comparison.overall,
        is_likely_match: comparison.overall >= 70,
        detailed_scores: {
          hash_similarity: comparison.hash,
          face_similarity: comparison.face,
          color_similarity: comparison.color,
          entity_match: comparison.entityMatch,
        },
        match_reasons: matchReasons,
        photos: {
          photo_1: {
            id: photo_id_1,
            entity_type: dna1.entity_type,
            quality_score: dna1.quality_score,
          },
          photo_2: {
            id: photo_id_2,
            entity_type: dna2.entity_type,
            quality_score: dna2.quality_score,
          },
        },
      },
    });
  } catch (error) {
    logger.error('Photo comparison failed:', error);
    res.status(500).json({
      success: false,
      message: 'Comparison failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Trigger Visual DNA extraction for a photo
 * POST /api/v1/visual-dna/extract
 */
const extractVisualDNA = async (req, res) => {
  try {
    const { photo_id, case_id, image_path } = req.body;

    if (!photo_id || !case_id) {
      return res.status(400).json({
        success: false,
        message: 'photo_id and case_id are required',
      });
    }

    // Verify photo exists
    const photo = await Photo.findByPk(photo_id);
    if (!photo) {
      return res.status(404).json({
        success: false,
        message: 'Photo not found',
      });
    }

    // Use provided path or construct from photo data
    const imagePath = image_path || photo.aws_s3_key || photo.image_url;

    if (!imagePath) {
      return res.status(400).json({
        success: false,
        message: 'No image path available for this photo',
      });
    }

    // Extract Visual DNA (async)
    const result = await visualDNAService.processAndSaveVisualDNA(photo_id, case_id, imagePath);

    res.json({
      success: true,
      message: 'Visual DNA extracted successfully',
      data: {
        id: result.id,
        photo_id: result.photo_id,
        entity_type: result.entity_type,
        processing_status: result.processing_status,
        processing_time_ms: result.processing_time_ms,
      },
    });
  } catch (error) {
    logger.error('Visual DNA extraction failed:', error);
    res.status(500).json({
      success: false,
      message: 'Extraction failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};

/**
 * Get Visual DNA statistics
 * GET /api/v1/visual-dna/stats
 */
const getStats = async (req, res) => {
  try {
    const stats = await VisualDNA.findAll({
      attributes: [
        'entity_type',
        'processing_status',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
        [require('sequelize').fn('AVG', require('sequelize').col('quality_score')), 'avg_quality'],
        [require('sequelize').fn('AVG', require('sequelize').col('processing_time_ms')), 'avg_processing_time'],
      ],
      group: ['entity_type', 'processing_status'],
    });

    const totalCount = await VisualDNA.count();
    const completedCount = await VisualDNA.count({ where: { processing_status: 'completed' } });

    const entityCounts = {};
    const statusCounts = {};

    for (const row of stats) {
      const data = row.toJSON();
      entityCounts[data.entity_type] = (entityCounts[data.entity_type] || 0) + parseInt(data.count);
      statusCounts[data.processing_status] = (statusCounts[data.processing_status] || 0) + parseInt(data.count);
    }

    res.json({
      success: true,
      data: {
        total: totalCount,
        completed: completedCount,
        completion_rate: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
        by_entity_type: entityCounts,
        by_status: statusCounts,
        algorithm_version: visualDNAService.ALGORITHM_VERSION,
      },
    });
  } catch (error) {
    logger.error('Get Visual DNA stats failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve statistics',
    });
  }
};

module.exports = {
  smartSearch,
  getCaseVisualDNA,
  comparePhotos,
  extractVisualDNA,
  getStats,
};
