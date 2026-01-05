const { PhotoMatch, Photo, Case, User } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const matchingService = require('../services/universalMatchingService');
const { Op } = require('sequelize');

// @desc    Get matches for a specific case
// @route   GET /api/v1/matches/case/:caseId
// @access  Private (case poster only)
const getMatchesForCase = asyncHandler(async (req, res) => {
  const { caseId } = req.params;

  // Get the case to verify ownership
  const caseData = await Case.findByPk(caseId);

  if (!caseData) {
    return res.status(404).json({
      success: false,
      message: 'Case not found',
    });
  }

  // Check if user owns this case
  if (caseData.poster_id !== req.userId && req.user.user_type !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view matches for this case',
    });
  }

  // Get matches where this case is either source or target
  const matches = await PhotoMatch.findAll({
    where: {
      [Op.or]: [
        { source_case_id: caseId },
        { target_case_id: caseId },
      ],
      overall_score: { [Op.gte]: matchingService.THRESHOLDS.OVERALL_MATCH_MIN },
    },
    order: [['overall_score', 'DESC'], ['created_at', 'DESC']],
    include: [
      {
        model: Photo,
        as: 'sourcePhoto',
        attributes: ['id', 'image_url', 'case_id', 'ai_metadata'],
      },
      {
        model: Photo,
        as: 'targetPhoto',
        attributes: ['id', 'image_url', 'case_id', 'ai_metadata'],
      },
      {
        model: Case,
        as: 'sourceCase',
        attributes: ['id', 'title', 'case_type', 'status', 'poster_id'],
        include: [
          {
            model: User,
            as: 'poster',
            attributes: ['id', 'first_name', 'last_name'],
          },
        ],
      },
      {
        model: Case,
        as: 'targetCase',
        attributes: ['id', 'title', 'case_type', 'status', 'poster_id'],
        include: [
          {
            model: User,
            as: 'poster',
            attributes: ['id', 'first_name', 'last_name'],
          },
        ],
      },
    ],
  });

  // Transform matches to show the "other" case
  const transformedMatches = matches.map(match => {
    const isSourceCase = match.source_case_id === caseId;
    const matchedCase = isSourceCase ? match.targetCase : match.sourceCase;
    const matchedPhoto = isSourceCase ? match.targetPhoto : match.sourcePhoto;
    const ownPhoto = isSourceCase ? match.sourcePhoto : match.targetPhoto;

    return {
      id: match.id,
      overall_score: match.overall_score,
      hash_score: match.hash_score,
      ocr_score: match.ocr_score,
      match_type: match.match_type,
      matched_identifiers: match.matched_identifiers,
      match_details: match.match_details,
      status: match.status,
      created_at: match.created_at,
      // The matched case/photo
      matched_case: {
        id: matchedCase.id,
        title: matchedCase.title,
        case_type: matchedCase.case_type,
        status: matchedCase.status,
        poster: matchedCase.poster,
      },
      matched_photo: {
        id: matchedPhoto.id,
        image_url: matchedPhoto.image_url,
        ocr_text: matchedPhoto.ai_metadata?.ocr?.text,
      },
      // Own photo that matched
      own_photo: {
        id: ownPhoto.id,
        image_url: ownPhoto.image_url,
      },
    };
  });

  res.status(200).json({
    success: true,
    data: {
      matches: transformedMatches,
      count: transformedMatches.length,
    },
  });
});

// @desc    Get all matches for the current user (across all their cases)
// @route   GET /api/v1/matches/my-matches
// @access  Private
const getMyMatches = asyncHandler(async (req, res) => {
  const { status, min_score = 0, page = 1, limit = 20 } = req.query;

  // Get user's cases
  const userCases = await Case.findAll({
    where: { poster_id: req.userId },
    attributes: ['id'],
  });

  const caseIds = userCases.map(c => c.id);

  if (caseIds.length === 0) {
    return res.status(200).json({
      success: true,
      data: {
        matches: [],
        pagination: { total: 0, page: 1, pages: 0, limit: parseInt(limit) },
      },
    });
  }

  const where = {
    [Op.or]: [
      { source_case_id: { [Op.in]: caseIds } },
      { target_case_id: { [Op.in]: caseIds } },
    ],
    overall_score: { [Op.gte]: parseInt(min_score) || matchingService.THRESHOLDS.OVERALL_MATCH_MIN },
  };

  if (status) {
    where.status = status;
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows: matches } = await PhotoMatch.findAndCountAll({
    where,
    order: [['overall_score', 'DESC'], ['created_at', 'DESC']],
    limit: parseInt(limit),
    offset,
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
      {
        model: Case,
        as: 'sourceCase',
        attributes: ['id', 'title', 'case_type', 'status'],
      },
      {
        model: Case,
        as: 'targetCase',
        attributes: ['id', 'title', 'case_type', 'status'],
      },
    ],
  });

  // Transform matches to show which is user's case and which is the match
  const transformedMatches = matches.map(match => {
    const isSourceOwner = caseIds.includes(match.source_case_id);
    const ownCase = isSourceOwner ? match.sourceCase : match.targetCase;
    const matchedCase = isSourceOwner ? match.targetCase : match.sourceCase;
    const ownPhoto = isSourceOwner ? match.sourcePhoto : match.targetPhoto;
    const matchedPhoto = isSourceOwner ? match.targetPhoto : match.sourcePhoto;

    return {
      id: match.id,
      overall_score: match.overall_score,
      match_type: match.match_type,
      matched_identifiers: match.matched_identifiers,
      status: match.status,
      created_at: match.created_at,
      own_case: {
        id: ownCase.id,
        title: ownCase.title,
        case_type: ownCase.case_type,
      },
      own_photo: {
        id: ownPhoto.id,
        image_url: ownPhoto.image_url,
      },
      matched_case: {
        id: matchedCase.id,
        title: matchedCase.title,
        case_type: matchedCase.case_type,
        status: matchedCase.status,
      },
      matched_photo: {
        id: matchedPhoto.id,
        image_url: matchedPhoto.image_url,
      },
    };
  });

  res.status(200).json({
    success: true,
    data: {
      matches: transformedMatches,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / parseInt(limit)),
        limit: parseInt(limit),
      },
    },
  });
});

// @desc    Get a single match by ID
// @route   GET /api/v1/matches/:id
// @access  Private (involved users only)
const getMatchById = asyncHandler(async (req, res) => {
  const match = await PhotoMatch.findByPk(req.params.id, {
    include: [
      {
        model: Photo,
        as: 'sourcePhoto',
        attributes: ['id', 'image_url', 'case_id', 'ai_metadata'],
      },
      {
        model: Photo,
        as: 'targetPhoto',
        attributes: ['id', 'image_url', 'case_id', 'ai_metadata'],
      },
      {
        model: Case,
        as: 'sourceCase',
        attributes: ['id', 'title', 'description', 'case_type', 'status', 'poster_id', 'last_seen_location', 'last_seen_date'],
        include: [
          {
            model: User,
            as: 'poster',
            attributes: ['id', 'first_name', 'last_name', 'profile_photo_url'],
          },
        ],
      },
      {
        model: Case,
        as: 'targetCase',
        attributes: ['id', 'title', 'description', 'case_type', 'status', 'poster_id', 'last_seen_location', 'last_seen_date'],
        include: [
          {
            model: User,
            as: 'poster',
            attributes: ['id', 'first_name', 'last_name', 'profile_photo_url'],
          },
        ],
      },
    ],
  });

  if (!match) {
    return res.status(404).json({
      success: false,
      message: 'Match not found',
    });
  }

  // Check if user is involved in this match
  const isSourceOwner = match.sourceCase.poster_id === req.userId;
  const isTargetOwner = match.targetCase.poster_id === req.userId;
  const isAdmin = req.user.user_type === 'admin';

  if (!isSourceOwner && !isTargetOwner && !isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view this match',
    });
  }

  // Mark as viewed if not already
  if (match.status === 'pending' || match.status === 'notified') {
    match.status = 'viewed';
    match.viewed_at = new Date();
    await match.save();
  }

  res.status(200).json({
    success: true,
    data: { match },
  });
});

// Valid rejection reason codes
const VALID_REJECTION_REASONS = [
  'wrong_color',
  'wrong_size',
  'wrong_location',
  'wrong_brand',
  'different_item_type',
  'wrong_pattern',
  'wrong_shape',
  'other',
];

// @desc    Submit feedback on a match
// @route   POST /api/v1/matches/:id/feedback
// @access  Private (involved users only)
const submitFeedback = asyncHandler(async (req, res) => {
  const { feedback, rejection_reasons, rejection_details } = req.body;

  if (!['confirmed', 'rejected', 'unsure'].includes(feedback)) {
    return res.status(400).json({
      success: false,
      message: 'Feedback must be: confirmed, rejected, or unsure',
    });
  }

  // Validate rejection reasons if feedback is 'rejected'
  if (feedback === 'rejected') {
    if (!rejection_reasons || !Array.isArray(rejection_reasons) || rejection_reasons.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one rejection reason is required when rejecting a match',
      });
    }

    // Validate all reasons are valid
    const invalidReasons = rejection_reasons.filter(r => !VALID_REJECTION_REASONS.includes(r));
    if (invalidReasons.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid rejection reasons: ${invalidReasons.join(', ')}`,
      });
    }
  }

  const match = await PhotoMatch.findByPk(req.params.id, {
    include: [
      { model: Case, as: 'sourceCase', attributes: ['id', 'poster_id'] },
      { model: Case, as: 'targetCase', attributes: ['id', 'poster_id'] },
    ],
  });

  if (!match) {
    return res.status(404).json({
      success: false,
      message: 'Match not found',
    });
  }

  // Determine which user is providing feedback
  const isSourceOwner = match.sourceCase.poster_id === req.userId;
  const isTargetOwner = match.targetCase.poster_id === req.userId;

  if (!isSourceOwner && !isTargetOwner) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to provide feedback on this match',
    });
  }

  const updatedMatch = await matchingService.submitMatchFeedback(
    match.id,
    req.userId,
    feedback,
    isSourceOwner,
    feedback === 'rejected' ? rejection_reasons : null,
    feedback === 'rejected' ? rejection_details : null
  );

  res.status(200).json({
    success: true,
    message: 'Feedback submitted successfully',
    data: { match: updatedMatch },
  });
});

// @desc    Get match statistics for user
// @route   GET /api/v1/matches/stats
// @access  Private
const getMatchStats = asyncHandler(async (req, res) => {
  // Get user's cases
  const userCases = await Case.findAll({
    where: { poster_id: req.userId },
    attributes: ['id'],
  });

  const caseIds = userCases.map(c => c.id);

  if (caseIds.length === 0) {
    return res.status(200).json({
      success: true,
      data: {
        total_matches: 0,
        pending_matches: 0,
        confirmed_matches: 0,
        high_confidence_matches: 0,
      },
    });
  }

  const whereBase = {
    [Op.or]: [
      { source_case_id: { [Op.in]: caseIds } },
      { target_case_id: { [Op.in]: caseIds } },
    ],
  };

  const [total, pending, confirmed, highConfidence] = await Promise.all([
    PhotoMatch.count({ where: whereBase }),
    PhotoMatch.count({ where: { ...whereBase, status: 'pending' } }),
    PhotoMatch.count({ where: { ...whereBase, status: 'confirmed' } }),
    PhotoMatch.count({
      where: {
        ...whereBase,
        overall_score: { [Op.gte]: matchingService.THRESHOLDS.HIGH_CONFIDENCE },
      },
    }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      total_matches: total,
      pending_matches: pending,
      confirmed_matches: confirmed,
      high_confidence_matches: highConfidence,
    },
  });
});

module.exports = {
  getMatchesForCase,
  getMyMatches,
  getMatchById,
  submitFeedback,
  getMatchStats,
};
