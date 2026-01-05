const { Case, Photo, User, Submission } = require('../models');
const PhotoMatch = require('../models/PhotoMatch');
const { asyncHandler } = require('../middleware/errorHandler');
const { Op } = require('sequelize');
const { validateCaseContent } = require('../services/contentModerationService');

// @desc    Create new case
// @route   POST /api/v1/cases
// @access  Private (verified users only)
const createCase = asyncHandler(async (req, res) => {
  const {
    case_type,
    title,
    description,
    bounty_amount,
    priority_level,
    case_number,
    subject_name,
    subject_aliases,
    subject_age,
    subject_dob,
    physical_description,
    last_seen_location,
    last_seen_date,
    found_date_time, // For found items - when the item was found
    search_radius,
    charges,
    danger_level,
    item_category,
    item_value,
    serial_numbers,
    medical_conditions,
    special_circumstances,
    contact_info,
  } = req.body;

  // Validate required fields
  if (!case_type || !title || !description || bounty_amount === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Case type, title, description, and bounty amount are required',
    });
  }

  // Content moderation - prevent selling/buying language
  const contentValidation = validateCaseContent({ title, description });
  if (!contentValidation.isValid) {
    return res.status(400).json({
      success: false,
      message: contentValidation.message || 'Your post contains inappropriate content for a lost & found platform.',
      suggestions: contentValidation.suggestions,
      flags: contentValidation.flags,
    });
  }

  // Validate bounty amount (found_item has $0 bounty, lost_item max $50)
  const maxBounty = parseFloat(process.env.MAX_BOUNTY_AMOUNT) || 50;
  if (case_type === 'lost_item' && parseFloat(bounty_amount) > maxBounty) {
    return res.status(400).json({
      success: false,
      message: `Finder's Fee cannot exceed $${maxBounty} CAD`,
    });
  }

  // Calculate platform commission (2.5%)
  const commissionRate = parseFloat(process.env.PLATFORM_COMMISSION_PERCENTAGE) || 2.5;
  const platformCommission = (parseFloat(bounty_amount) * commissionRate) / 100;

  // Calculate expiry date based on case type
  let expiresAt = null;
  if (case_type === 'lost_item') {
    const expiryDays = parseInt(process.env.CASE_EXPIRY_DAYS_BASIC) || 30;
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);
  }

  // Create case
  // Use found_date_time for found items, last_seen_date for lost items
  const effectiveDate = case_type === 'found_item' ? found_date_time : last_seen_date;

  const newCase = await Case.create({
    poster_id: req.userId,
    case_type,
    title,
    description,
    bounty_amount,
    platform_commission: platformCommission,
    priority_level: priority_level || 'medium',
    case_number,
    subject_name,
    subject_aliases,
    subject_age,
    subject_dob,
    physical_description,
    last_seen_location,
    last_seen_date: effectiveDate,
    search_radius: search_radius || 50,
    charges,
    danger_level,
    item_category,
    item_value,
    serial_numbers,
    medical_conditions,
    special_circumstances,
    contact_info,
    expires_at: expiresAt,
  });

  res.status(201).json({
    success: true,
    message: 'Case created successfully',
    data: { case: newCase },
  });
});

// @desc    Get all cases with filters
// @route   GET /api/v1/cases
// @access  Public
const getCases = asyncHandler(async (req, res) => {
  const {
    case_type,
    status,
    priority_level,
    search,
    latitude,
    longitude,
    radius,
    min_bounty,
    max_bounty,
    page = 1,
    limit = 20,
    sort = 'created_at',
    order = 'DESC',
  } = req.query;

  const where = {};

  // Apply filters
  if (case_type) where.case_type = case_type;
  if (status) where.status = status;
  else where.status = 'active'; // Default to active cases
  if (priority_level) where.priority_level = priority_level;

  // Search in title and description
  if (search) {
    where[Op.or] = [
      { title: { [Op.iLike]: `%${search}%` } },
      { description: { [Op.iLike]: `%${search}%` } },
      { subject_name: { [Op.iLike]: `%${search}%` } },
    ];
  }

  // Bounty range filter
  if (min_bounty || max_bounty) {
    where.bounty_amount = {};
    if (min_bounty) where.bounty_amount[Op.gte] = parseFloat(min_bounty);
    if (max_bounty) where.bounty_amount[Op.lte] = parseFloat(max_bounty);
  }

  // Location-based filter (simplified - would use PostGIS in production)
  if (latitude && longitude && radius) {
    // This is a simplified version - production should use PostGIS
    // For now, we'll just filter by search_radius in the case
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows: cases } = await Case.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order: [[sort, order.toUpperCase()]],
    include: [
      {
        model: Photo,
        as: 'photos',
        where: { is_primary: true },
        required: false,
        limit: 1,
      },
      {
        model: User,
        as: 'poster',
        attributes: ['id', 'first_name', 'last_name', 'user_type', 'verification_status'],
      },
    ],
  });

  res.status(200).json({
    success: true,
    data: {
      cases,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / parseInt(limit)),
        limit: parseInt(limit),
      },
    },
  });
});

// @desc    Get single case by ID
// @route   GET /api/v1/cases/:id
// @access  Public
const getCaseById = asyncHandler(async (req, res) => {
  const caseData = await Case.findByPk(req.params.id, {
    include: [
      {
        model: Photo,
        as: 'photos',
      },
      {
        model: User,
        as: 'poster',
        attributes: ['id', 'first_name', 'last_name', 'user_type', 'verification_status', 'profile_photo_url'],
      },
      {
        model: Submission,
        as: 'submissions',
        where: { verification_status: 'verified' },
        required: false,
        limit: 5,
        order: [['created_at', 'DESC']],
      },
    ],
  });

  if (!caseData) {
    return res.status(404).json({
      success: false,
      message: 'Case not found',
    });
  }

  // Increment view count
  caseData.view_count += 1;
  await caseData.save();

  res.status(200).json({
    success: true,
    data: { case: caseData },
  });
});

// @desc    Update case
// @route   PUT /api/v1/cases/:id
// @access  Private (poster only)
const updateCase = asyncHandler(async (req, res) => {
  const caseData = await Case.findByPk(req.params.id);

  if (!caseData) {
    return res.status(404).json({
      success: false,
      message: 'Case not found',
    });
  }

  // Check if user is the poster
  if (caseData.poster_id !== req.userId && req.user?.user_type !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this case',
    });
  }

  // Don't allow updating resolved cases
  if (caseData.status === 'resolved') {
    return res.status(400).json({
      success: false,
      message: 'Cannot update resolved cases',
    });
  }

  const allowedUpdates = [
    'title',
    'description',
    'bounty_amount',
    'priority_level',
    'physical_description',
    'last_seen_location',
    'last_seen_date',
    'search_radius',
    'medical_conditions',
    'special_circumstances',
    'contact_info',
  ];

  allowedUpdates.forEach(field => {
    if (req.body[field] !== undefined) {
      caseData[field] = req.body[field];
    }
  });

  // Recalculate commission if bounty changed
  if (req.body.bounty_amount !== undefined) {
    const commissionRate = parseFloat(process.env.PLATFORM_COMMISSION_PERCENTAGE) || 2.5;
    caseData.platform_commission = (parseFloat(req.body.bounty_amount) * commissionRate) / 100;
  }

  await caseData.save();

  res.status(200).json({
    success: true,
    message: 'Case updated successfully',
    data: { case: caseData },
  });
});

// @desc    Delete case
// @route   DELETE /api/v1/cases/:id
// @access  Private (poster only)
const deleteCase = asyncHandler(async (req, res) => {
  const caseData = await Case.findByPk(req.params.id);

  if (!caseData) {
    return res.status(404).json({
      success: false,
      message: 'Case not found',
    });
  }

  // Check if user is the poster
  if (caseData.poster_id !== req.userId && req.user?.user_type !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to delete this case',
    });
  }

  // Don't allow deleting resolved cases with payments
  if (caseData.status === 'resolved') {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete resolved cases',
    });
  }

  await caseData.destroy();

  res.status(200).json({
    success: true,
    message: 'Case deleted successfully',
  });
});

// @desc    Get my posted cases
// @route   GET /api/v1/cases/my-cases
// @access  Private
const getMyCases = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const where = { poster_id: req.userId };
  if (status) where.status = status;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows: cases } = await Case.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order: [['created_at', 'DESC']],
    include: [
      {
        model: Photo,
        as: 'photos',
        where: { is_primary: true },
        required: false,
        limit: 1,
      },
    ],
  });

  res.status(200).json({
    success: true,
    data: {
      cases,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / parseInt(limit)),
        limit: parseInt(limit),
      },
    },
  });
});

// @desc    Browse cases with match enrichment for swipe feed
// @route   GET /api/v1/cases/browse
// @access  Private (authenticated users)
const browseCases = asyncHandler(async (req, res) => {
  const {
    case_type, // 'lost_item' or 'found_item'
    matches_only, // If true, only show cases with matches
    page = 1,
    limit = 20,
  } = req.query;

  const userId = req.userId;

  // Build where clause for cases
  const where = {
    status: 'active',
    poster_id: { [Op.ne]: userId }, // Don't show user's own cases
  };

  // Filter by case type if specified
  if (case_type) {
    where.case_type = case_type;
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Get cases with photos
  const { count, rows: cases } = await Case.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order: [['created_at', 'DESC']],
    include: [
      {
        model: Photo,
        as: 'photos',
        required: false,
      },
      {
        model: User,
        as: 'poster',
        attributes: ['id', 'first_name', 'last_name', 'user_type', 'verification_status'],
      },
    ],
  });

  // Get user's case IDs to check for matches
  const userCases = await Case.findAll({
    where: { poster_id: userId },
    attributes: ['id'],
  });
  const userCaseIds = userCases.map(c => c.id);

  // Enrich each case with match data
  const enrichedCases = await Promise.all(cases.map(async (caseItem) => {
    const caseData = caseItem.toJSON();

    // Find if any of user's cases have matches with this case
    const matches = await PhotoMatch.findAll({
      where: {
        [Op.or]: [
          // User's case is the source, this case is the target
          {
            source_case_id: { [Op.in]: userCaseIds },
            target_case_id: caseData.id,
          },
          // This case is the source, user's case is the target
          {
            source_case_id: caseData.id,
            target_case_id: { [Op.in]: userCaseIds },
          },
        ],
      },
      order: [['overall_score', 'DESC']],
      limit: 1,
    });

    if (matches.length > 0) {
      const bestMatch = matches[0];
      caseData.isMatch = true;
      caseData.matchScore = bestMatch.overall_score;
      caseData.matchType = bestMatch.match_type;
      caseData.matchReasons = bestMatch.match_details?.matchReasons || [];
      caseData.matchId = bestMatch.id;
      caseData.matchedIdentifiers = bestMatch.matched_identifiers || {};
    } else {
      caseData.isMatch = false;
      caseData.matchScore = 0;
      caseData.matchType = null;
      caseData.matchReasons = [];
      caseData.matchId = null;
      caseData.matchedIdentifiers = {};
    }

    return caseData;
  }));

  // Filter to only matches if requested
  let finalCases = enrichedCases;
  if (matches_only === 'true') {
    finalCases = enrichedCases.filter(c => c.isMatch);
  }

  res.status(200).json({
    success: true,
    data: {
      cases: finalCases,
      pagination: {
        total: matches_only === 'true' ? finalCases.length : count,
        page: parseInt(page),
        pages: Math.ceil((matches_only === 'true' ? finalCases.length : count) / parseInt(limit)),
        limit: parseInt(limit),
      },
    },
  });
});

module.exports = {
  createCase,
  getCases,
  getCaseById,
  updateCase,
  deleteCase,
  getMyCases,
  browseCases,
};
