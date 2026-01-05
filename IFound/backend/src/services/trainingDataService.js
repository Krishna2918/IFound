/**
 * Training Data Service
 *
 * Handles creation and management of training data for ML models.
 * Creates training pairs from user feedback on matches.
 */

const { MatchFeedback, TrainingPair, PhotoMatch, VisualDNA, Photo } = require('../models');
const logger = require('../config/logger');

/**
 * Create a training pair from match feedback
 * When a user confirms or rejects a match, we create a training pair
 *
 * @param {string} matchId - The PhotoMatch ID
 * @param {string} userId - The user who gave feedback
 * @param {string} feedback - 'confirmed', 'rejected', or 'unsure'
 * @param {boolean} isSourceUser - Whether user is the source case owner
 * @param {Array} rejectionReasons - Array of rejection reason codes
 * @param {string} rejectionDetails - Free text explanation
 * @returns {Object} Created MatchFeedback and TrainingPair (if applicable)
 */
const createTrainingPairFromFeedback = async (
  matchId,
  userId,
  feedback,
  isSourceUser,
  rejectionReasons = null,
  rejectionDetails = null
) => {
  try {
    // Get the match with full details
    const match = await PhotoMatch.findByPk(matchId, {
      include: [
        { model: Photo, as: 'sourcePhoto' },
        { model: Photo, as: 'targetPhoto' },
      ],
    });

    if (!match) {
      logger.warn(`[TrainingData] Match not found: ${matchId}`);
      return null;
    }

    // Get VisualDNA for both photos
    const [sourceVisualDNA, targetVisualDNA] = await Promise.all([
      VisualDNA.findOne({ where: { photo_id: match.source_photo_id } }),
      VisualDNA.findOne({ where: { photo_id: match.target_photo_id } }),
    ]);

    if (!sourceVisualDNA || !targetVisualDNA) {
      logger.warn(`[TrainingData] Missing VisualDNA for match ${matchId}`);
      return null;
    }

    // Create feedback record with scores snapshot
    const matchFeedback = await MatchFeedback.create({
      photo_match_id: matchId,
      user_id: userId,
      is_source_user: isSourceUser,
      feedback_type: feedback,
      rejection_reasons: rejectionReasons,
      rejection_explanation: rejectionDetails,
      match_scores_snapshot: {
        overall_score: match.overall_score,
        dna_score: match.dna_score,
        hash_score: match.hash_score,
        ocr_score: match.ocr_score,
        color_score: match.color_score,
        visual_score: match.visual_score,
        shape_score: match.shape_score,
        location_score: match.location_score,
        distance_miles: match.distance_miles,
      },
      weights_used_snapshot: match.match_details?.weightsUsed || null,
    });

    logger.info(`[TrainingData] Created MatchFeedback: ${matchFeedback.id} (${feedback})`);

    // Only create training pair for definitive feedback
    if (feedback === 'unsure') {
      return { matchFeedback, trainingPair: null };
    }

    // Determine verdict
    const verdict = feedback === 'confirmed' ? 'match' : 'no_match';

    // Check if training pair already exists
    const existingPair = await TrainingPair.findOne({
      where: {
        source_visual_dna_id: sourceVisualDNA.id,
        target_visual_dna_id: targetVisualDNA.id,
      },
    });

    if (existingPair) {
      // Update existing pair if new feedback is more certain
      if (existingPair.verdict === 'uncertain' && verdict !== 'uncertain') {
        await existingPair.update({
          verdict,
          rejection_reasons: rejectionReasons,
          export_status: 'pending',
        });
        logger.info(`[TrainingData] Updated TrainingPair ${existingPair.id} verdict to ${verdict}`);
      }
      return { matchFeedback, trainingPair: existingPair };
    }

    // Create new training pair
    const trainingPair = await TrainingPair.create({
      source_visual_dna_id: sourceVisualDNA.id,
      target_visual_dna_id: targetVisualDNA.id,
      original_match_id: matchId,
      verdict,
      verdict_confidence: feedback === 'confirmed' ? 0.9 : 0.85,
      rejection_reasons: rejectionReasons,
      original_scores: {
        overall_score: match.overall_score,
        dna_score: match.dna_score,
        hash_score: match.hash_score,
        color_score: match.color_score,
        shape_score: match.shape_score,
        visual_score: match.visual_score,
        ocr_score: match.ocr_score,
      },
      original_overall_score: match.overall_score,
      item_category: sourceVisualDNA.item_category || match.match_details?.autoDetectedCategory?.category,
      is_high_quality: true, // Could add quality detection
    });

    logger.info(`[TrainingData] Created TrainingPair: ${trainingPair.id} (${verdict})`);

    return { matchFeedback, trainingPair };
  } catch (error) {
    logger.error('[TrainingData] Error creating training pair:', error);
    throw error;
  }
};

/**
 * Get training statistics
 */
const getTrainingStats = async () => {
  const [totalPairs, matchPairs, noMatchPairs, pendingExport] = await Promise.all([
    TrainingPair.count(),
    TrainingPair.count({ where: { verdict: 'match' } }),
    TrainingPair.count({ where: { verdict: 'no_match' } }),
    TrainingPair.count({ where: { export_status: 'pending' } }),
  ]);

  return {
    totalPairs,
    matchPairs,
    noMatchPairs,
    pendingExport,
    readyForTraining: matchPairs >= 100 && noMatchPairs >= 100,
  };
};

/**
 * Check if we have enough data for a training run
 */
const canStartTraining = async (minConfirmed = 100, minRejected = 100) => {
  const stats = await getTrainingStats();
  return stats.matchPairs >= minConfirmed && stats.noMatchPairs >= minRejected;
};

/**
 * Get pending training pairs for export
 */
const getPendingTrainingPairs = async (limit = 1000) => {
  return await TrainingPair.findAll({
    where: { export_status: 'pending' },
    include: [
      { model: VisualDNA, as: 'sourceVisualDNA' },
      { model: VisualDNA, as: 'targetVisualDNA' },
    ],
    limit,
  });
};

/**
 * Mark pairs as exported
 */
const markPairsAsExported = async (pairIds, batchId) => {
  await TrainingPair.update(
    {
      export_status: 'exported',
      exported_at: new Date(),
      training_batch_id: batchId,
    },
    { where: { id: pairIds } }
  );
};

module.exports = {
  createTrainingPairFromFeedback,
  getTrainingStats,
  canStartTraining,
  getPendingTrainingPairs,
  markPairsAsExported,
};
