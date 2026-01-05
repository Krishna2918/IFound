const { Submission, Case, User, Transaction } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { Op } = require('sequelize');

// @desc    Create submission/tip
// @route   POST /api/v1/submissions
// @access  Private or Public (anonymous)
const createSubmission = asyncHandler(async (req, res) => {
  const {
    case_id,
    submission_type,
    is_anonymous,
    content,
    media_urls,
    location_data,
  } = req.body;

  // Validate required fields
  if (!case_id || !submission_type) {
    return res.status(400).json({
      success: false,
      message: 'Case ID and submission type are required',
    });
  }

  // Check if case exists and is active
  const caseData = await Case.findByPk(case_id);
  if (!caseData) {
    return res.status(404).json({
      success: false,
      message: 'Case not found',
    });
  }

  if (caseData.status !== 'active') {
    return res.status(400).json({
      success: false,
      message: 'Cannot submit tips for inactive cases',
    });
  }

  // Get user ID (null if anonymous or not authenticated)
  const finder_id = is_anonymous ? null : req.userId;

  // Get IP address and user agent for tracking
  const ip_address = req.ip || req.connection.remoteAddress;
  const user_agent = req.get('user-agent');

  // Create submission
  const submission = await Submission.create({
    case_id,
    finder_id,
    submission_type,
    is_anonymous: is_anonymous || false,
    content,
    media_urls: media_urls || [],
    location_data,
    ip_address,
    user_agent,
    verification_status: 'pending',
    verification_level: 1,
  });

  // Update case submission count
  caseData.submission_count += 1;
  await caseData.save();

  res.status(201).json({
    success: true,
    message: 'Submission created successfully',
    data: { submission },
  });
});

// @desc    Get submissions for a case
// @route   GET /api/v1/submissions/case/:caseId
// @access  Public (verified submissions only) / Private (all if poster)
const getSubmissionsByCase = asyncHandler(async (req, res) => {
  const { caseId } = req.params;
  const { status, page = 1, limit = 20 } = req.query;

  const caseData = await Case.findByPk(caseId);
  if (!caseData) {
    return res.status(404).json({
      success: false,
      message: 'Case not found',
    });
  }

  const where = { case_id: caseId };

  // If not the case poster, only show verified submissions
  if (!req.userId || caseData.poster_id !== req.userId) {
    where.verification_status = 'verified';
  } else if (status) {
    where.verification_status = status;
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows: submissions } = await Submission.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order: [['created_at', 'DESC']],
    include: [
      {
        model: User,
        as: 'finder',
        attributes: ['id', 'first_name', 'last_name', 'reputation_score'],
      },
    ],
  });

  res.status(200).json({
    success: true,
    data: {
      submissions,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / parseInt(limit)),
        limit: parseInt(limit),
      },
    },
  });
});

// @desc    Get my submissions
// @route   GET /api/v1/submissions/my-submissions
// @access  Private
const getMySubmissions = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const where = { finder_id: req.userId };
  if (status) where.verification_status = status;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows: submissions } = await Submission.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order: [['created_at', 'DESC']],
    include: [
      {
        model: Case,
        as: 'case',
        attributes: ['id', 'title', 'case_type', 'bounty_amount', 'status'],
      },
    ],
  });

  res.status(200).json({
    success: true,
    data: {
      submissions,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / parseInt(limit)),
        limit: parseInt(limit),
      },
    },
  });
});

// @desc    Update submission status (poster only)
// @route   PUT /api/v1/submissions/:id/verify
// @access  Private (case poster only)
const verifySubmission = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { verification_status, verification_level, bounty_percentage, reviewer_notes } = req.body;

  const submission = await Submission.findByPk(id, {
    include: [{ model: Case, as: 'case' }],
  });

  if (!submission) {
    return res.status(404).json({
      success: false,
      message: 'Submission not found',
    });
  }

  // Check if user is the case poster or admin
  if (submission.case.poster_id !== req.userId && req.user.user_type !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to verify this submission',
    });
  }

  // Update submission
  if (verification_status) submission.verification_status = verification_status;
  if (verification_level) submission.verification_level = verification_level;
  if (bounty_percentage !== undefined) submission.bounty_percentage = bounty_percentage;
  if (reviewer_notes) submission.reviewer_notes = reviewer_notes;

  submission.reviewed_by = req.userId;
  submission.reviewed_at = new Date();

  await submission.save();

  // If verified and bounty percentage set, create transaction
  if (verification_status === 'verified' && bounty_percentage > 0 && submission.finder_id) {
    const bountyAmount = (parseFloat(submission.case.bounty_amount) * parseFloat(bounty_percentage)) / 100;
    const commissionRate = parseFloat(process.env.PLATFORM_COMMISSION_PERCENTAGE) || 10;
    const commission = (bountyAmount * commissionRate) / 100;

    await Transaction.create({
      case_id: submission.case_id,
      submission_id: submission.id,
      finder_id: submission.finder_id,
      poster_id: submission.case.poster_id,
      transaction_type: 'bounty_payment',
      amount: bountyAmount,
      platform_commission: commission,
      status: 'escrow',
    });

    // Update user stats
    const finder = await User.findByPk(submission.finder_id);
    if (finder) {
      finder.total_earnings = parseFloat(finder.total_earnings) + (bountyAmount - commission);
      finder.total_cases_found += 1;
      finder.reputation_score = Math.min(100, parseFloat(finder.reputation_score) + 5);
      await finder.save();
    }
  }

  res.status(200).json({
    success: true,
    message: 'Submission verified successfully',
    data: { submission },
  });
});

// @desc    Delete submission
// @route   DELETE /api/v1/submissions/:id
// @access  Private (submitter or admin only)
const deleteSubmission = asyncHandler(async (req, res) => {
  const submission = await Submission.findByPk(req.params.id);

  if (!submission) {
    return res.status(404).json({
      success: false,
      message: 'Submission not found',
    });
  }

  // Check if user is the submitter or admin
  if (submission.finder_id !== req.userId && req.user.user_type !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to delete this submission',
    });
  }

  await submission.destroy();

  res.status(200).json({
    success: true,
    message: 'Submission deleted successfully',
  });
});

// @desc    Get submission by ID
// @route   GET /api/v1/submissions/:id
// @access  Private (poster, finder, or admin)
const getSubmissionById = asyncHandler(async (req, res) => {
  const submission = await Submission.findByPk(req.params.id, {
    include: [
      {
        model: Case,
        as: 'case',
      },
      {
        model: User,
        as: 'finder',
        attributes: ['id', 'first_name', 'last_name', 'reputation_score'],
      },
      {
        model: User,
        as: 'reviewer',
        attributes: ['id', 'first_name', 'last_name'],
      },
    ],
  });

  if (!submission) {
    return res.status(404).json({
      success: false,
      message: 'Submission not found',
    });
  }

  // Check permissions
  const isAuthorized =
    submission.finder_id === req.userId ||
    submission.case.poster_id === req.userId ||
    req.user.user_type === 'admin';

  if (!isAuthorized) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view this submission',
    });
  }

  res.status(200).json({
    success: true,
    data: { submission },
  });
});

module.exports = {
  createSubmission,
  getSubmissionsByCase,
  getMySubmissions,
  verifySubmission,
  deleteSubmission,
  getSubmissionById,
};
