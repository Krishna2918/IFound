const express = require('express');
const router = express.Router();
const escrowService = require('../services/escrowService');
const { Transaction, Case, Claim } = require('../models');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../config/logger');

// All routes require authentication
router.use(authenticateToken);

/**
 * @route   GET /api/v1/escrow/status/:caseId
 * @desc    Get escrow status for a case
 * @access  Private
 */
router.get('/status/:caseId', asyncHandler(async (req, res) => {
  const { caseId } = req.params;

  // Verify user has access to this case
  const caseData = await Case.findByPk(caseId);
  if (!caseData) {
    return res.status(404).json({
      success: false,
      message: 'Case not found',
    });
  }

  // Only poster can view escrow status, or admin
  if (caseData.poster_id !== req.userId && req.user?.user_type !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view escrow status',
    });
  }

  const escrowStatus = await escrowService.getEscrowStatus(caseId);

  res.json({
    success: true,
    data: escrowStatus,
  });
}));

/**
 * @route   POST /api/v1/escrow/create
 * @desc    Create escrow hold for a case bounty
 * @access  Private (poster only)
 */
router.post('/create', asyncHandler(async (req, res) => {
  const { case_id } = req.body;

  const caseData = await Case.findByPk(case_id);
  if (!caseData) {
    return res.status(404).json({
      success: false,
      message: 'Case not found',
    });
  }

  // Only poster can create escrow
  if (caseData.poster_id !== req.userId) {
    return res.status(403).json({
      success: false,
      message: 'Only the case poster can create escrow',
    });
  }

  // Check if bounty amount is valid
  if (!caseData.bounty_amount || caseData.bounty_amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Case must have a bounty amount to create escrow',
    });
  }

  // Check if escrow already exists
  const existingEscrow = await Transaction.findOne({
    where: {
      case_id,
      transaction_type: 'bounty_payment',
      status: ['pending', 'escrow'],
    },
  });

  if (existingEscrow) {
    return res.status(400).json({
      success: false,
      message: 'Escrow already exists for this case',
    });
  }

  const result = await escrowService.createEscrowHold(caseData, req.userId);

  logger.audit('escrow_created', req.userId, {
    caseId: case_id,
    transactionId: result.transaction.id,
    amount: caseData.bounty_amount,
  });

  res.status(201).json({
    success: true,
    message: 'Escrow hold created successfully',
    data: {
      transaction: {
        id: result.transaction.id,
        amount: result.transaction.amount,
        status: result.transaction.status,
      },
      paymentIntent: {
        id: result.paymentIntent.id,
        clientSecret: result.paymentIntent.client_secret,
      },
    },
  });
}));

/**
 * @route   POST /api/v1/escrow/release/:transactionId
 * @desc    Release escrow to finder
 * @access  Private (poster or admin)
 */
router.post('/release/:transactionId', asyncHandler(async (req, res) => {
  const { transactionId } = req.params;
  const { finder_id, claim_id } = req.body;

  const transaction = await Transaction.findByPk(transactionId, {
    include: [{ model: Case, as: 'case' }],
  });

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Transaction not found',
    });
  }

  // Check authorization
  if (transaction.poster_id !== req.userId && req.user?.user_type !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to release escrow',
    });
  }

  if (!finder_id) {
    return res.status(400).json({
      success: false,
      message: 'Finder ID is required',
    });
  }

  const result = await escrowService.releaseEscrow(transactionId, finder_id, claim_id);

  logger.audit('escrow_released', req.userId, {
    transactionId,
    finderId: finder_id,
    amount: transaction.net_amount,
  });

  res.json({
    success: true,
    message: 'Escrow released to finder',
    data: {
      transaction: {
        id: result.transaction.id,
        status: result.transaction.status,
        netAmount: result.transaction.net_amount,
      },
    },
  });
}));

/**
 * @route   POST /api/v1/escrow/refund/:transactionId
 * @desc    Refund escrow to poster
 * @access  Private (poster or admin)
 */
router.post('/refund/:transactionId', asyncHandler(async (req, res) => {
  const { transactionId } = req.params;
  const { reason } = req.body;

  const transaction = await Transaction.findByPk(transactionId);

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Transaction not found',
    });
  }

  // Check authorization
  if (transaction.poster_id !== req.userId && req.user?.user_type !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to refund escrow',
    });
  }

  const result = await escrowService.refundEscrow(transactionId, reason || 'Refund requested by poster');

  logger.audit('escrow_refunded', req.userId, {
    transactionId,
    reason,
    amount: transaction.amount,
  });

  res.json({
    success: true,
    message: 'Escrow refunded',
    data: {
      transaction: {
        id: result.transaction.id,
        status: result.transaction.status,
      },
    },
  });
}));

/**
 * @route   POST /api/v1/escrow/dispute/:transactionId
 * @desc    Open a dispute on an escrow transaction
 * @access  Private
 */
router.post('/dispute/:transactionId', asyncHandler(async (req, res) => {
  const { transactionId } = req.params;
  const { reason } = req.body;

  if (!reason || reason.trim().length < 10) {
    return res.status(400).json({
      success: false,
      message: 'Dispute reason must be at least 10 characters',
    });
  }

  const transaction = await Transaction.findByPk(transactionId);

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Transaction not found',
    });
  }

  // Only involved parties can dispute
  if (transaction.poster_id !== req.userId &&
      transaction.finder_id !== req.userId) {
    return res.status(403).json({
      success: false,
      message: 'Only involved parties can dispute',
    });
  }

  const result = await escrowService.openDispute(transactionId, req.userId, reason);

  logger.audit('escrow_disputed', req.userId, {
    transactionId,
    reason,
  });

  res.json({
    success: true,
    message: 'Dispute opened successfully. An admin will review your case.',
    data: {
      transaction: {
        id: result.id,
        status: result.status,
      },
    },
  });
}));

/**
 * @route   POST /api/v1/escrow/dispute/:transactionId/resolve
 * @desc    Resolve a dispute (admin only)
 * @access  Private (admin only)
 */
router.post('/dispute/:transactionId/resolve', requireAdmin, asyncHandler(async (req, res) => {
  const { transactionId } = req.params;
  const { resolution, finder_id } = req.body;

  if (!['release_to_finder', 'refund_to_poster'].includes(resolution)) {
    return res.status(400).json({
      success: false,
      message: 'Resolution must be either "release_to_finder" or "refund_to_poster"',
    });
  }

  if (resolution === 'release_to_finder' && !finder_id) {
    return res.status(400).json({
      success: false,
      message: 'Finder ID is required to release to finder',
    });
  }

  const result = await escrowService.resolveDispute(
    transactionId,
    resolution,
    req.userId,
    finder_id
  );

  logger.audit('dispute_resolved', req.userId, {
    transactionId,
    resolution,
    finderId: finder_id,
  });

  res.json({
    success: true,
    message: `Dispute resolved: ${resolution}`,
    data: result,
  });
}));

/**
 * @route   POST /api/v1/escrow/process-expired
 * @desc    Process expired escrows (admin only or cron job)
 * @access  Private (admin only)
 */
router.post('/process-expired', requireAdmin, asyncHandler(async (req, res) => {
  const result = await escrowService.processExpiredEscrows();

  logger.info('Expired escrows processed by admin', {
    adminId: req.userId,
    result,
  });

  res.json({
    success: true,
    message: `Processed ${result.processed} expired escrows`,
    data: result,
  });
}));

module.exports = router;
