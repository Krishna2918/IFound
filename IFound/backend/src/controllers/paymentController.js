const paymentService = require('../services/paymentService');
const { Transaction, Case, User, Claim } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { Op } = require('sequelize');
const logger = require('../config/logger');
const businessRules = require('../config/businessRules');

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

// @desc    Create bounty payment intent
// @route   POST /api/v1/payments/bounty
// @access  Private
const createBountyPayment = asyncHandler(async (req, res) => {
  const { case_id } = req.body;

  const caseData = await Case.findByPk(case_id);

  if (!caseData) {
    return res.status(404).json({
      success: false,
      message: 'Case not found',
    });
  }

  // Check if user is the poster
  if (caseData.poster_id !== req.userId) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized',
    });
  }

  const paymentIntent = await paymentService.createBountyPayment(caseData, req.userId);

  // Create transaction record
  const transaction = await Transaction.create({
    case_id: caseData.id,
    poster_id: req.userId,
    transaction_type: 'bounty_payment',
    amount: caseData.bounty_amount,
    platform_commission: caseData.platform_commission,
    status: 'pending',
    stripe_payment_intent_id: paymentIntent.id,
  });

  res.status(201).json({
    success: true,
    message: 'Payment intent created',
    data: {
      payment_intent: paymentIntent,
      transaction,
    },
  });
});

// @desc    Release bounty to finder
// @route   POST /api/v1/payments/release/:transactionId
// @access  Private (poster or admin)
const releaseBounty = asyncHandler(async (req, res) => {
  const { transactionId } = req.params;

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
      message: 'Not authorized',
    });
  }

  const transfer = await paymentService.releaseBountyToFinder(transactionId, req.userId);

  res.status(200).json({
    success: true,
    message: 'Bounty released to finder',
    data: { transfer },
  });
});

// @desc    Refund payment
// @route   POST /api/v1/payments/refund/:transactionId
// @access  Private (poster or admin)
const refundPayment = asyncHandler(async (req, res) => {
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
      message: 'Not authorized',
    });
  }

  const refund = await paymentService.refundPayment(transactionId, reason, req.userId);

  res.status(200).json({
    success: true,
    message: 'Payment refunded',
    data: { refund },
  });
});

// @desc    Get transaction history
// @route   GET /api/v1/payments/history
// @access  Private
const getTransactionHistory = asyncHandler(async (req, res) => {
  const { page, limit, type } = req.query;

  const result = await paymentService.getTransactionHistory(req.userId, {
    page,
    limit,
    type,
  });

  res.status(200).json({
    success: true,
    data: result,
  });
});

// @desc    Get user balance
// @route   GET /api/v1/payments/balance
// @access  Private
const getUserBalance = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.userId);

  // Calculate pending earnings
  const pendingTransactions = await Transaction.findAll({
    where: {
      finder_id: req.userId,
      status: 'escrow',
    },
  });

  const pendingEarnings = pendingTransactions.reduce(
    (sum, t) => sum + parseFloat(t.net_amount),
    0
  );

  res.status(200).json({
    success: true,
    data: {
      totalEarnings: parseFloat(user.total_earnings),
      pendingEarnings,
      availableBalance: parseFloat(user.total_earnings) - pendingEarnings,
    },
  });
});

// @desc    Get earnings summary for finder
// @route   GET /api/v1/payments/earnings
// @access  Private
const getEarningsSummary = asyncHandler(async (req, res) => {
  const userId = req.userId;

  // Get all completed bounty payments where user is the finder
  const earnings = await Transaction.findAll({
    where: {
      finder_id: userId,
      transaction_type: 'bounty_payment',
      status: 'completed',
    },
    include: [
      { model: Case, as: 'case', attributes: ['id', 'title'] },
    ],
    order: [['completed_at', 'DESC']],
  });

  // Get all withdrawals
  const withdrawals = await Transaction.findAll({
    where: {
      finder_id: userId,
      transaction_type: 'withdrawal',
      status: { [Op.in]: ['completed', 'processing', 'pending'] },
    },
    order: [['created_at', 'DESC']],
  });

  // Calculate totals
  const totalEarned = earnings.reduce((sum, t) => sum + parseFloat(t.net_amount), 0);
  const completedWithdrawals = withdrawals
    .filter(w => w.status === 'completed')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const pendingWithdrawals = withdrawals
    .filter(w => w.status === 'pending' || w.status === 'processing')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const availableBalance = totalEarned - completedWithdrawals - pendingWithdrawals;

  res.status(200).json({
    success: true,
    data: {
      summary: {
        total_earned: totalEarned.toFixed(2),
        available_balance: availableBalance.toFixed(2),
        pending_withdrawals: pendingWithdrawals.toFixed(2),
        completed_withdrawals: completedWithdrawals.toFixed(2),
        currency: 'CAD',
      },
      recent_earnings: earnings.slice(0, 10).map(e => ({
        id: e.id,
        amount: parseFloat(e.net_amount).toFixed(2),
        gross_amount: parseFloat(e.amount).toFixed(2),
        platform_fee: parseFloat(e.platform_commission).toFixed(2),
        item_title: e.metadata?.item_title || e.case?.title || 'Item',
        completed_at: e.completed_at,
      })),
      recent_withdrawals: withdrawals.slice(0, 5).map(w => ({
        id: w.id,
        amount: parseFloat(w.amount).toFixed(2),
        status: w.status,
        created_at: w.createdAt,
        completed_at: w.completed_at,
      })),
    },
  });
});

// @desc    Request a withdrawal/payout
// @route   POST /api/v1/payments/withdraw
// @access  Private
const requestWithdrawal = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { amount, payout_method = 'bank_transfer' } = req.body;

  const withdrawAmount = parseFloat(amount);

  if (!withdrawAmount || withdrawAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Please enter a valid withdrawal amount',
    });
  }

  // Minimum withdrawal amount
  if (withdrawAmount < 5) {
    return res.status(400).json({
      success: false,
      message: 'Minimum withdrawal amount is $5.00 CAD',
    });
  }

  // Calculate available balance
  const earnings = await Transaction.findAll({
    where: {
      finder_id: userId,
      transaction_type: 'bounty_payment',
      status: 'completed',
    },
  });

  const withdrawals = await Transaction.findAll({
    where: {
      finder_id: userId,
      transaction_type: 'withdrawal',
      status: { [Op.in]: ['completed', 'processing', 'pending'] },
    },
  });

  const totalEarned = earnings.reduce((sum, t) => sum + parseFloat(t.net_amount), 0);
  const totalWithdrawn = withdrawals.reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const availableBalance = totalEarned - totalWithdrawn;

  if (withdrawAmount > availableBalance) {
    return res.status(400).json({
      success: false,
      message: `Insufficient balance. Available: $${availableBalance.toFixed(2)} CAD`,
    });
  }

  // Check for pending withdrawals
  const pendingWithdrawal = await Transaction.findOne({
    where: {
      finder_id: userId,
      transaction_type: 'withdrawal',
      status: 'pending',
    },
  });

  if (pendingWithdrawal) {
    return res.status(400).json({
      success: false,
      message: 'You already have a pending withdrawal request. Please wait for it to be processed.',
    });
  }

  // Create withdrawal request
  const withdrawal = await Transaction.create({
    case_id: earnings.length > 0 ? earnings[0].case_id : null, // Use first earning's case as reference if available
    finder_id: userId,
    poster_id: userId, // Self-payout
    transaction_type: 'withdrawal',
    amount: withdrawAmount,
    platform_commission: 0,
    net_amount: withdrawAmount,
    currency: 'CAD',
    status: 'pending',
    payment_method: payout_method,
    metadata: {
      requested_by: userId,
      payout_method: payout_method,
    },
  });

  logger.info(`Withdrawal request created: $${withdrawAmount} CAD for user ${userId}`);

  res.status(201).json({
    success: true,
    message: 'Withdrawal request submitted successfully. Processing typically takes 1-3 business days.',
    data: {
      withdrawal: {
        id: withdrawal.id,
        amount: withdrawAmount.toFixed(2),
        status: 'pending',
        currency: 'CAD',
      },
      new_balance: (availableBalance - withdrawAmount).toFixed(2),
    },
  });
});

// @desc    Handle Stripe webhook events
// @route   POST /webhooks/stripe
// @access  Public (verified by Stripe signature)
const handleStripeWebhook = async (req, res) => {
  if (!stripe) {
    logger.warn('Stripe webhook received but Stripe is not configured');
    return res.status(200).json({ received: true, message: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed', { error: err.message });
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  logger.info('Stripe webhook received', { type: event.type, id: event.id });

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event.data.object);
      break;

    case 'payment_intent.payment_failed':
      await handlePaymentIntentFailed(event.data.object);
      break;

    case 'charge.refunded':
      await handleChargeRefunded(event.data.object);
      break;

    case 'transfer.created':
      await handleTransferCreated(event.data.object);
      break;

    case 'payout.paid':
      await handlePayoutPaid(event.data.object);
      break;

    case 'payout.failed':
      await handlePayoutFailed(event.data.object);
      break;

    default:
      logger.info(`Unhandled Stripe event type: ${event.type}`);
  }

  res.status(200).json({ received: true });
};

/**
 * Handle successful payment intent - move funds to escrow
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  const transaction = await Transaction.findOne({
    where: { stripe_payment_intent_id: paymentIntent.id },
    include: [{ model: Case, as: 'case' }],
  });

  if (!transaction) {
    logger.warn('Transaction not found for payment intent', { id: paymentIntent.id });
    return;
  }

  // Update transaction to escrow status
  await transaction.update({
    status: 'escrow',
    stripe_charge_id: paymentIntent.latest_charge,
    metadata: {
      ...transaction.metadata,
      escrow_started_at: new Date().toISOString(),
      escrow_release_date: new Date(
        Date.now() + businessRules.escrow.holdDuration * 24 * 60 * 60 * 1000
      ).toISOString(),
    },
  });

  // Update case status
  if (transaction.case) {
    await transaction.case.update({
      bounty_status: 'held',
    });
  }

  logger.info('Payment moved to escrow', {
    transactionId: transaction.id,
    amount: transaction.amount,
    caseId: transaction.case_id,
  });
}

/**
 * Handle failed payment intent
 */
async function handlePaymentIntentFailed(paymentIntent) {
  const transaction = await Transaction.findOne({
    where: { stripe_payment_intent_id: paymentIntent.id },
  });

  if (!transaction) {
    logger.warn('Transaction not found for failed payment', { id: paymentIntent.id });
    return;
  }

  await transaction.update({
    status: 'failed',
    failure_reason: paymentIntent.last_payment_error?.message || 'Payment failed',
    metadata: {
      ...transaction.metadata,
      failed_at: new Date().toISOString(),
      error_code: paymentIntent.last_payment_error?.code,
    },
  });

  logger.info('Payment intent failed', {
    transactionId: transaction.id,
    reason: paymentIntent.last_payment_error?.message,
  });
}

/**
 * Handle charge refunded
 */
async function handleChargeRefunded(charge) {
  const transaction = await Transaction.findOne({
    where: { stripe_charge_id: charge.id },
  });

  if (!transaction) {
    logger.warn('Transaction not found for refund', { chargeId: charge.id });
    return;
  }

  await transaction.update({
    status: 'refunded',
    refund_reason: charge.refunds?.data[0]?.reason || 'Refund processed',
    refunded_at: new Date(),
    metadata: {
      ...transaction.metadata,
      refund_id: charge.refunds?.data[0]?.id,
      refunded_at: new Date().toISOString(),
    },
  });

  // Update case if applicable
  if (transaction.case_id) {
    await Case.update(
      { bounty_status: 'refunded', status: 'active' },
      { where: { id: transaction.case_id } }
    );
  }

  logger.info('Charge refunded', {
    transactionId: transaction.id,
    chargeId: charge.id,
  });
}

/**
 * Handle transfer created (bounty released to finder)
 */
async function handleTransferCreated(transfer) {
  const transaction = await Transaction.findOne({
    where: { stripe_transfer_id: transfer.id },
  });

  if (!transaction) {
    // May be a transfer we don't track
    logger.info('Transfer not linked to transaction', { transferId: transfer.id });
    return;
  }

  await transaction.update({
    status: 'completed',
    completed_at: new Date(),
    metadata: {
      ...transaction.metadata,
      transfer_completed_at: new Date().toISOString(),
    },
  });

  // Update finder's total earnings
  if (transaction.finder_id) {
    await User.increment('total_earnings', {
      by: parseFloat(transaction.net_amount),
      where: { id: transaction.finder_id },
    });
  }

  // Update case status
  if (transaction.case_id) {
    await Case.update(
      { bounty_status: 'paid', status: 'resolved' },
      { where: { id: transaction.case_id } }
    );
  }

  logger.info('Transfer completed, bounty paid to finder', {
    transactionId: transaction.id,
    finderId: transaction.finder_id,
    amount: transaction.net_amount,
  });
}

/**
 * Handle payout paid (withdrawal to bank)
 */
async function handlePayoutPaid(payout) {
  const transaction = await Transaction.findOne({
    where: {
      stripe_payout_id: payout.id,
      transaction_type: 'withdrawal',
    },
  });

  if (!transaction) {
    logger.info('Payout not linked to withdrawal', { payoutId: payout.id });
    return;
  }

  await transaction.update({
    status: 'completed',
    completed_at: new Date(),
    metadata: {
      ...transaction.metadata,
      payout_completed_at: new Date().toISOString(),
    },
  });

  logger.info('Withdrawal payout completed', {
    transactionId: transaction.id,
    amount: transaction.amount,
  });
}

/**
 * Handle payout failed
 */
async function handlePayoutFailed(payout) {
  const transaction = await Transaction.findOne({
    where: {
      stripe_payout_id: payout.id,
      transaction_type: 'withdrawal',
    },
  });

  if (!transaction) {
    logger.info('Failed payout not linked to withdrawal', { payoutId: payout.id });
    return;
  }

  await transaction.update({
    status: 'failed',
    failure_reason: payout.failure_message || 'Payout failed',
    metadata: {
      ...transaction.metadata,
      payout_failed_at: new Date().toISOString(),
      failure_code: payout.failure_code,
    },
  });

  logger.info('Withdrawal payout failed', {
    transactionId: transaction.id,
    reason: payout.failure_message,
  });
}

module.exports = {
  createBountyPayment,
  releaseBounty,
  refundPayment,
  getTransactionHistory,
  getUserBalance,
  getEarningsSummary,
  requestWithdrawal,
  handleStripeWebhook,
};
