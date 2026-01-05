const { User, Case, Submission, Transaction, PhotoMatch, Photo, VisualDNA, sequelize } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { Op } = require('sequelize');

// @desc    Get dashboard analytics
// @route   GET /api/v1/admin/analytics
// @access  Private (admin only)
const getDashboardAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const dateFilter = {};
  if (startDate) dateFilter[Op.gte] = new Date(startDate);
  if (endDate) dateFilter[Op.lte] = new Date(endDate);

  // Total counts
  const totalUsers = await User.count();
  const totalCases = await Case.count();
  const activeCases = await Case.count({ where: { status: 'active' } });
  const resolvedCases = await Case.count({ where: { status: 'resolved' } });

  // Financial stats
  const financialStats = await Transaction.findOne({
    attributes: [
      [sequelize.fn('SUM', sequelize.col('amount')), 'total_bounties'],
      [sequelize.fn('SUM', sequelize.col('platform_commission')), 'total_commission'],
    ],
    where: { status: 'completed' },
  });

  // Cases by type
  const casesByType = await Case.findAll({
    attributes: [
      'case_type',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    ],
    group: ['case_type'],
  });

  // Recent activity
  const recentCases = await Case.findAll({
    limit: 5,
    order: [['created_at', 'DESC']],
    attributes: ['id', 'title', 'case_type', 'bounty_amount', 'status', 'created_at'],
  });

  const recentSubmissions = await Submission.findAll({
    limit: 5,
    order: [['created_at', 'DESC']],
    attributes: ['id', 'case_id', 'submission_type', 'verification_status', 'created_at'],
    include: [
      {
        model: Case,
        as: 'case',
        attributes: ['title'],
      },
    ],
  });

  res.status(200).json({
    success: true,
    data: {
      totals: {
        users: totalUsers,
        cases: totalCases,
        activeCases,
        resolvedCases,
      },
      financial: {
        totalBounties: financialStats?.dataValues.total_bounties || 0,
        totalCommission: financialStats?.dataValues.total_commission || 0,
      },
      casesByType,
      recentActivity: {
        cases: recentCases,
        submissions: recentSubmissions,
      },
    },
  });
});

// @desc    Get all users with filters
// @route   GET /api/v1/admin/users
// @access  Private (admin only)
const getAllUsers = asyncHandler(async (req, res) => {
  const { user_type, verification_status, is_suspended, search, page = 1, limit = 20 } = req.query;

  const where = {};
  if (user_type) where.user_type = user_type;
  if (verification_status) where.verification_status = verification_status;
  if (is_suspended !== undefined) where.is_suspended = is_suspended === 'true';

  if (search) {
    where[Op.or] = [
      { email: { [Op.iLike]: `%${search}%` } },
      { first_name: { [Op.iLike]: `%${search}%` } },
      { last_name: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows: users } = await User.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order: [['created_at', 'DESC']],
    attributes: { exclude: ['password_hash'] },
  });

  res.status(200).json({
    success: true,
    data: {
      users,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / parseInt(limit)),
        limit: parseInt(limit),
      },
    },
  });
});

// @desc    Update user verification status
// @route   PUT /api/v1/admin/users/:id/verify
// @access  Private (admin only)
const updateUserVerification = asyncHandler(async (req, res) => {
  const { verification_status } = req.body;

  const user = await User.findByPk(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  user.verification_status = verification_status;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'User verification status updated',
    data: { user: user.toPublicJSON() },
  });
});

// @desc    Suspend/unsuspend user
// @route   PUT /api/v1/admin/users/:id/suspend
// @access  Private (admin only)
const suspendUser = asyncHandler(async (req, res) => {
  const { is_suspended, reason } = req.body;

  const user = await User.findByPk(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  user.is_suspended = is_suspended;
  await user.save();

  res.status(200).json({
    success: true,
    message: `User ${is_suspended ? 'suspended' : 'unsuspended'} successfully`,
    data: { user: user.toPublicJSON() },
  });
});

// @desc    Get all cases for moderation
// @route   GET /api/v1/admin/cases
// @access  Private (admin only)
const getAllCasesForModeration = asyncHandler(async (req, res) => {
  const { status, case_type, priority_level, page = 1, limit = 20 } = req.query;

  const where = {};
  if (status) where.status = status;
  if (case_type) where.case_type = case_type;
  if (priority_level) where.priority_level = priority_level;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows: cases } = await Case.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order: [['created_at', 'DESC']],
    include: [
      {
        model: User,
        as: 'poster',
        attributes: ['id', 'first_name', 'last_name', 'email'],
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

// @desc    Suspend/activate case
// @route   PUT /api/v1/admin/cases/:id/suspend
// @access  Private (admin only)
const suspendCase = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;

  const caseData = await Case.findByPk(req.params.id);

  if (!caseData) {
    return res.status(404).json({
      success: false,
      message: 'Case not found',
    });
  }

  caseData.status = status; // 'suspended' or 'active'
  await caseData.save();

  res.status(200).json({
    success: true,
    message: `Case ${status} successfully`,
    data: { case: caseData },
  });
});

// @desc    Get all submissions for moderation
// @route   GET /api/v1/admin/submissions
// @access  Private (admin only)
const getAllSubmissions = asyncHandler(async (req, res) => {
  const { verification_status, page = 1, limit = 20 } = req.query;

  const where = {};
  if (verification_status) where.verification_status = verification_status;

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
        attributes: ['id', 'title'],
      },
      {
        model: User,
        as: 'finder',
        attributes: ['id', 'first_name', 'last_name', 'email'],
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

// @desc    Get all transactions
// @route   GET /api/v1/admin/transactions
// @access  Private (admin only)
const getAllTransactions = asyncHandler(async (req, res) => {
  const { status, transaction_type, page = 1, limit = 20 } = req.query;

  const where = {};
  if (status) where.status = status;
  if (transaction_type) where.transaction_type = transaction_type;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows: transactions } = await Transaction.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order: [['created_at', 'DESC']],
    include: [
      {
        model: Case,
        as: 'case',
        attributes: ['id', 'title'],
      },
      {
        model: User,
        as: 'finder',
        attributes: ['id', 'first_name', 'last_name'],
      },
      {
        model: User,
        as: 'poster',
        attributes: ['id', 'first_name', 'last_name'],
      },
    ],
  });

  res.status(200).json({
    success: true,
    data: {
      transactions,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / parseInt(limit)),
        limit: parseInt(limit),
      },
    },
  });
});

// @desc    Get all matches for admin dashboard
// @route   GET /api/v1/admin/matches
// @access  Private (admin only)
const getAllMatches = asyncHandler(async (req, res) => {
  const { status, min_score, page = 1, limit = 20 } = req.query;

  const where = {};
  if (status) where.status = status;
  if (min_score) where.overall_score = { [Op.gte]: parseInt(min_score) };

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows: matches } = await PhotoMatch.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order: [['created_at', 'DESC']],
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
        include: [
          {
            model: User,
            as: 'poster',
            attributes: ['id', 'first_name', 'last_name', 'email'],
          },
        ],
      },
      {
        model: Case,
        as: 'targetCase',
        attributes: ['id', 'title', 'case_type', 'status'],
        include: [
          {
            model: User,
            as: 'poster',
            attributes: ['id', 'first_name', 'last_name', 'email'],
          },
        ],
      },
    ],
  });

  res.status(200).json({
    success: true,
    data: {
      matches,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / parseInt(limit)),
        limit: parseInt(limit),
      },
    },
  });
});

// @desc    Get match statistics for admin dashboard
// @route   GET /api/v1/admin/matches/stats
// @access  Private (admin only)
const getMatchStats = asyncHandler(async (req, res) => {
  const [
    totalMatches,
    pendingMatches,
    confirmedMatches,
    rejectedMatches,
    totalVisualDNA,
    completedVisualDNA,
    failedVisualDNA,
  ] = await Promise.all([
    PhotoMatch.count(),
    PhotoMatch.count({ where: { status: 'pending' } }),
    PhotoMatch.count({ where: { status: 'confirmed' } }),
    PhotoMatch.count({ where: { status: 'rejected' } }),
    VisualDNA.count(),
    VisualDNA.count({ where: { processing_status: 'completed' } }),
    VisualDNA.count({ where: { processing_status: 'failed' } }),
  ]);

  // Get matches by score range
  const highConfidence = await PhotoMatch.count({
    where: { overall_score: { [Op.gte]: 80 } },
  });
  const mediumConfidence = await PhotoMatch.count({
    where: { overall_score: { [Op.gte]: 50, [Op.lt]: 80 } },
  });
  const lowConfidence = await PhotoMatch.count({
    where: { overall_score: { [Op.lt]: 50 } },
  });

  // Recent matches (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentMatches = await PhotoMatch.count({
    where: { created_at: { [Op.gte]: sevenDaysAgo } },
  });

  // Get matches per day for chart
  const matchesPerDay = await PhotoMatch.findAll({
    attributes: [
      [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    ],
    where: { created_at: { [Op.gte]: sevenDaysAgo } },
    group: [sequelize.fn('DATE', sequelize.col('created_at'))],
    order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'ASC']],
    raw: true,
  });

  res.status(200).json({
    success: true,
    data: {
      totals: {
        matches: totalMatches,
        pending: pendingMatches,
        confirmed: confirmedMatches,
        rejected: rejectedMatches,
      },
      visualDNA: {
        total: totalVisualDNA,
        completed: completedVisualDNA,
        failed: failedVisualDNA,
        processingRate: totalVisualDNA > 0
          ? Math.round((completedVisualDNA / totalVisualDNA) * 100)
          : 0,
      },
      confidence: {
        high: highConfidence,
        medium: mediumConfidence,
        low: lowConfidence,
      },
      recent: {
        last7Days: recentMatches,
        matchesPerDay,
      },
    },
  });
});

// @desc    Get matches for a specific user (admin view)
// @route   GET /api/v1/admin/users/:id/matches
// @access  Private (admin only)
const getUserMatches = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;

  // Get user's cases
  const userCases = await Case.findAll({
    where: { poster_id: id },
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

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows: matches } = await PhotoMatch.findAndCountAll({
    where: {
      [Op.or]: [
        { source_case_id: { [Op.in]: caseIds } },
        { target_case_id: { [Op.in]: caseIds } },
      ],
    },
    limit: parseInt(limit),
    offset,
    order: [['created_at', 'DESC']],
    include: [
      {
        model: Photo,
        as: 'sourcePhoto',
        attributes: ['id', 'image_url'],
      },
      {
        model: Photo,
        as: 'targetPhoto',
        attributes: ['id', 'image_url'],
      },
      {
        model: Case,
        as: 'sourceCase',
        attributes: ['id', 'title', 'case_type'],
      },
      {
        model: Case,
        as: 'targetCase',
        attributes: ['id', 'title', 'case_type'],
      },
    ],
  });

  res.status(200).json({
    success: true,
    data: {
      matches,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / parseInt(limit)),
        limit: parseInt(limit),
      },
    },
  });
});

module.exports = {
  getDashboardAnalytics,
  getAllUsers,
  updateUserVerification,
  suspendUser,
  getAllCasesForModeration,
  suspendCase,
  getAllSubmissions,
  getAllTransactions,
  getAllMatches,
  getMatchStats,
  getUserMatches,
};
