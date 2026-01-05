/**
 * Escrow Service
 *
 * Handles escrow operations for bounty payments including:
 * - Holding funds when a case is created
 * - Releasing funds to finders when claims are verified
 * - Refunding funds when cases expire or are cancelled
 * - Dispute management
 */

const { Transaction, Case, User, Claim } = require('../models');
const { Op } = require('sequelize');
const logger = require('../config/logger');
const businessRules = require('../config/businessRules');

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

/**
 * Create an escrow hold for a case bounty
 * @param {Object} caseData - The case object
 * @param {string} posterId - The poster's user ID
 * @returns {Object} Payment intent and transaction
 */
async function createEscrowHold(caseData, posterId) {
  if (!stripe) {
    logger.warn('Stripe not configured - escrow hold simulated');
    return simulateEscrowHold(caseData, posterId);
  }

  const poster = await User.findByPk(posterId);
  if (!poster) {
    throw new Error('Poster not found');
  }

  const amount = Math.round(caseData.bounty_amount * 100); // Convert to cents
  const platformFee = Math.round(amount * businessRules.bounty.platformFee);

  // Create payment intent with automatic capture disabled (for manual capture later)
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: businessRules.bounty.currency.toLowerCase(),
    customer: poster.stripe_customer_id,
    capture_method: 'manual', // Hold the funds without capturing
    metadata: {
      case_id: caseData.id,
      poster_id: posterId,
      type: 'bounty_escrow',
    },
    description: `Bounty escrow for case: ${caseData.title}`,
  });

  // Create transaction record
  const transaction = await Transaction.create({
    case_id: caseData.id,
    poster_id: posterId,
    transaction_type: 'bounty_payment',
    amount: caseData.bounty_amount,
    platform_commission: platformFee / 100,
    net_amount: (amount - platformFee) / 100,
    currency: businessRules.bounty.currency,
    status: 'pending',
    stripe_payment_intent_id: paymentIntent.id,
    metadata: {
      escrow_type: 'bounty',
      created_at: new Date().toISOString(),
    },
  });

  logger.info('Escrow hold created', {
    transactionId: transaction.id,
    caseId: caseData.id,
    amount: caseData.bounty_amount,
  });

  return { paymentIntent, transaction };
}

/**
 * Simulate escrow hold for development/testing
 */
async function simulateEscrowHold(caseData, posterId) {
  const platformFee = caseData.bounty_amount * businessRules.bounty.platformFee;

  const transaction = await Transaction.create({
    case_id: caseData.id,
    poster_id: posterId,
    transaction_type: 'bounty_payment',
    amount: caseData.bounty_amount,
    platform_commission: platformFee,
    net_amount: caseData.bounty_amount - platformFee,
    currency: businessRules.bounty.currency,
    status: 'escrow', // Simulated as already in escrow
    stripe_payment_intent_id: `sim_${Date.now()}`,
    metadata: {
      escrow_type: 'bounty',
      simulated: true,
      created_at: new Date().toISOString(),
      escrow_release_date: new Date(
        Date.now() + businessRules.escrow.holdDuration * 24 * 60 * 60 * 1000
      ).toISOString(),
    },
  });

  logger.info('Simulated escrow hold created', {
    transactionId: transaction.id,
    caseId: caseData.id,
  });

  return {
    paymentIntent: { id: transaction.stripe_payment_intent_id, status: 'simulated' },
    transaction,
  };
}

/**
 * Release escrow funds to the finder
 * @param {string} transactionId - The transaction ID
 * @param {string} finderId - The finder's user ID
 * @param {string} claimId - The claim ID (optional)
 * @returns {Object} Transfer details
 */
async function releaseEscrow(transactionId, finderId, claimId = null) {
  const transaction = await Transaction.findByPk(transactionId, {
    include: [{ model: Case, as: 'case' }],
  });

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  if (transaction.status !== 'escrow') {
    throw new Error(`Cannot release escrow - transaction status is ${transaction.status}`);
  }

  const finder = await User.findByPk(finderId);
  if (!finder) {
    throw new Error('Finder not found');
  }

  // Check if finder has Stripe account for payout
  if (!stripe) {
    return simulateEscrowRelease(transaction, finderId, claimId);
  }

  // Capture the held payment
  if (transaction.stripe_payment_intent_id && !transaction.stripe_payment_intent_id.startsWith('sim_')) {
    await stripe.paymentIntents.capture(transaction.stripe_payment_intent_id);
  }

  // Create transfer to finder (if they have connected account)
  let transfer = null;
  if (finder.stripe_connect_id) {
    transfer = await stripe.transfers.create({
      amount: Math.round(transaction.net_amount * 100),
      currency: transaction.currency.toLowerCase(),
      destination: finder.stripe_connect_id,
      metadata: {
        transaction_id: transaction.id,
        case_id: transaction.case_id,
        finder_id: finderId,
      },
    });
  }

  // Update transaction
  await transaction.update({
    finder_id: finderId,
    status: 'completed',
    completed_at: new Date(),
    stripe_transfer_id: transfer?.id,
    metadata: {
      ...transaction.metadata,
      released_at: new Date().toISOString(),
      claim_id: claimId,
    },
  });

  // Update finder's earnings
  await User.increment('total_earnings', {
    by: parseFloat(transaction.net_amount),
    where: { id: finderId },
  });

  // Update case status
  if (transaction.case) {
    await transaction.case.update({
      bounty_status: 'paid',
      status: 'resolved',
    });
  }

  // Update claim if provided
  if (claimId) {
    await Claim.update(
      { status: 'completed', transaction_id: transaction.id },
      { where: { id: claimId } }
    );
  }

  logger.info('Escrow released to finder', {
    transactionId: transaction.id,
    finderId,
    amount: transaction.net_amount,
  });

  return { transaction, transfer };
}

/**
 * Simulate escrow release for development/testing
 */
async function simulateEscrowRelease(transaction, finderId, claimId) {
  await transaction.update({
    finder_id: finderId,
    status: 'completed',
    completed_at: new Date(),
    stripe_transfer_id: `sim_transfer_${Date.now()}`,
    metadata: {
      ...transaction.metadata,
      released_at: new Date().toISOString(),
      claim_id: claimId,
      simulated: true,
    },
  });

  // Update finder's earnings
  await User.increment('total_earnings', {
    by: parseFloat(transaction.net_amount),
    where: { id: finderId },
  });

  // Update case status
  if (transaction.case_id) {
    await Case.update(
      { bounty_status: 'paid', status: 'resolved' },
      { where: { id: transaction.case_id } }
    );
  }

  logger.info('Simulated escrow release', {
    transactionId: transaction.id,
    finderId,
  });

  return { transaction, transfer: { id: transaction.metadata.stripe_transfer_id } };
}

/**
 * Refund escrow to poster
 * @param {string} transactionId - The transaction ID
 * @param {string} reason - Reason for refund
 * @returns {Object} Refund details
 */
async function refundEscrow(transactionId, reason = 'Case expired or cancelled') {
  const transaction = await Transaction.findByPk(transactionId, {
    include: [{ model: Case, as: 'case' }],
  });

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  if (!['escrow', 'pending'].includes(transaction.status)) {
    throw new Error(`Cannot refund - transaction status is ${transaction.status}`);
  }

  if (!stripe || transaction.stripe_payment_intent_id?.startsWith('sim_')) {
    return simulateRefund(transaction, reason);
  }

  // Cancel the payment intent (releases the hold)
  const paymentIntent = await stripe.paymentIntents.cancel(
    transaction.stripe_payment_intent_id,
    { cancellation_reason: 'requested_by_customer' }
  );

  // Update transaction
  await transaction.update({
    status: 'refunded',
    refund_reason: reason,
    refunded_at: new Date(),
    metadata: {
      ...transaction.metadata,
      refunded_at: new Date().toISOString(),
      refund_reason: reason,
    },
  });

  // Update case
  if (transaction.case) {
    await transaction.case.update({
      bounty_status: 'refunded',
    });
  }

  logger.info('Escrow refunded to poster', {
    transactionId: transaction.id,
    reason,
  });

  return { transaction, refund: paymentIntent };
}

/**
 * Simulate refund for development/testing
 */
async function simulateRefund(transaction, reason) {
  await transaction.update({
    status: 'refunded',
    refund_reason: reason,
    refunded_at: new Date(),
    metadata: {
      ...transaction.metadata,
      refunded_at: new Date().toISOString(),
      refund_reason: reason,
      simulated: true,
    },
  });

  if (transaction.case_id) {
    await Case.update(
      { bounty_status: 'refunded' },
      { where: { id: transaction.case_id } }
    );
  }

  logger.info('Simulated escrow refund', { transactionId: transaction.id });

  return { transaction, refund: { id: `sim_refund_${Date.now()}` } };
}

/**
 * Open a dispute on an escrow transaction
 * @param {string} transactionId - The transaction ID
 * @param {string} userId - The user opening the dispute
 * @param {string} reason - Reason for dispute
 * @returns {Object} Updated transaction
 */
async function openDispute(transactionId, userId, reason) {
  const transaction = await Transaction.findByPk(transactionId);

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  if (transaction.status !== 'escrow') {
    throw new Error('Can only dispute transactions in escrow');
  }

  await transaction.update({
    status: 'disputed',
    metadata: {
      ...transaction.metadata,
      dispute: {
        opened_at: new Date().toISOString(),
        opened_by: userId,
        reason,
        status: 'open',
      },
    },
  });

  // Update case
  if (transaction.case_id) {
    await Case.update(
      { bounty_status: 'disputed', status: 'disputed' },
      { where: { id: transaction.case_id } }
    );
  }

  logger.info('Dispute opened on escrow', {
    transactionId: transaction.id,
    userId,
    reason,
  });

  return transaction;
}

/**
 * Resolve a dispute
 * @param {string} transactionId - The transaction ID
 * @param {string} resolution - 'release_to_finder' or 'refund_to_poster'
 * @param {string} adminId - Admin resolving the dispute
 * @param {string} finderId - Finder ID (if releasing to finder)
 * @returns {Object} Resolution result
 */
async function resolveDispute(transactionId, resolution, adminId, finderId = null) {
  const transaction = await Transaction.findByPk(transactionId);

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  if (transaction.status !== 'disputed') {
    throw new Error('Transaction is not in dispute');
  }

  let result;

  if (resolution === 'release_to_finder') {
    if (!finderId) {
      throw new Error('Finder ID required for release');
    }
    // Temporarily set status back to escrow for release
    await transaction.update({ status: 'escrow' });
    result = await releaseEscrow(transactionId, finderId);
  } else if (resolution === 'refund_to_poster') {
    // Temporarily set status back to escrow for refund
    await transaction.update({ status: 'escrow' });
    result = await refundEscrow(transactionId, 'Dispute resolved in favor of poster');
  } else {
    throw new Error('Invalid resolution type');
  }

  // Update dispute metadata
  await Transaction.update(
    {
      metadata: {
        ...transaction.metadata,
        dispute: {
          ...transaction.metadata?.dispute,
          resolved_at: new Date().toISOString(),
          resolved_by: adminId,
          resolution,
        },
      },
    },
    { where: { id: transactionId } }
  );

  logger.info('Dispute resolved', {
    transactionId,
    resolution,
    adminId,
  });

  return result;
}

/**
 * Process expired cases and refund escrow automatically
 */
async function processExpiredEscrows() {
  if (!businessRules.escrow.autoRefundOnExpiry) {
    logger.info('Auto-refund on expiry is disabled');
    return { processed: 0 };
  }

  // Find expired cases with escrow
  const expiredCases = await Case.findAll({
    where: {
      status: 'active',
      bounty_status: 'held',
      expires_at: { [Op.lt]: new Date() },
    },
    include: [
      {
        model: Transaction,
        as: 'transactions',
        where: { status: 'escrow', transaction_type: 'bounty_payment' },
      },
    ],
  });

  let processed = 0;
  const errors = [];

  for (const caseData of expiredCases) {
    try {
      for (const transaction of caseData.transactions) {
        await refundEscrow(transaction.id, 'Case expired - automatic refund');
        processed++;
      }

      // Update case status
      await caseData.update({
        status: 'expired',
        bounty_status: 'refunded',
      });
    } catch (error) {
      logger.error('Failed to process expired escrow', {
        caseId: caseData.id,
        error: error.message,
      });
      errors.push({ caseId: caseData.id, error: error.message });
    }
  }

  logger.info('Expired escrows processed', {
    found: expiredCases.length,
    processed,
    errors: errors.length,
  });

  return { processed, errors };
}

/**
 * Get escrow status for a case
 */
async function getEscrowStatus(caseId) {
  const transactions = await Transaction.findAll({
    where: {
      case_id: caseId,
      transaction_type: 'bounty_payment',
    },
    order: [['createdAt', 'DESC']],
  });

  if (transactions.length === 0) {
    return { status: 'none', transactions: [] };
  }

  const latest = transactions[0];
  const escrowReleaseDate = latest.metadata?.escrow_release_date
    ? new Date(latest.metadata.escrow_release_date)
    : null;

  return {
    status: latest.status,
    amount: parseFloat(latest.amount),
    netAmount: parseFloat(latest.net_amount),
    platformFee: parseFloat(latest.platform_commission),
    currency: latest.currency,
    escrowReleaseDate,
    canDispute: latest.status === 'escrow' &&
      (!escrowReleaseDate || new Date() < escrowReleaseDate),
    transactions: transactions.map(t => ({
      id: t.id,
      status: t.status,
      amount: parseFloat(t.amount),
      createdAt: t.createdAt,
    })),
  };
}

module.exports = {
  createEscrowHold,
  releaseEscrow,
  refundEscrow,
  openDispute,
  resolveDispute,
  processExpiredEscrows,
  getEscrowStatus,
};
