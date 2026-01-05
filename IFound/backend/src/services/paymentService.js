const logger = require('../config/logger');
const { Transaction, User, Case } = require('../models');
const { Op } = require('sequelize');

// Payment configuration
const PAYMENT_CONFIG = {
  MIN_BOUNTY_AMOUNT: 10, // Minimum $10 bounty
  MAX_BOUNTY_AMOUNT: 100000, // Maximum $100,000 bounty
  PLATFORM_FEE_PERCENT: 10, // 10% platform fee
  CURRENCY: 'usd',
};

// Initialize Stripe only if properly configured
const isStripeConfigured = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  return key && !key.includes('dummy') && !key.includes('test_dummy') && key.startsWith('sk_');
};

const getStripeClient = () => {
  if (!isStripeConfigured()) {
    return null;
  }
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
};

class PaymentService {
  constructor() {
    this.testMode = !isStripeConfigured();
    if (this.testMode) {
      logger.warn('PaymentService running in TEST MODE - no real payments will be processed');
    }
  }

  /**
   * Validate bounty amount
   */
  validateBountyAmount(amount) {
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount)) {
      throw new Error('Invalid bounty amount: must be a number');
    }

    if (parsedAmount < PAYMENT_CONFIG.MIN_BOUNTY_AMOUNT) {
      throw new Error(`Bounty amount must be at least $${PAYMENT_CONFIG.MIN_BOUNTY_AMOUNT}`);
    }

    if (parsedAmount > PAYMENT_CONFIG.MAX_BOUNTY_AMOUNT) {
      throw new Error(`Bounty amount cannot exceed $${PAYMENT_CONFIG.MAX_BOUNTY_AMOUNT}`);
    }

    // Check for reasonable precision (max 2 decimal places)
    if (Math.round(parsedAmount * 100) !== parsedAmount * 100) {
      throw new Error('Bounty amount cannot have more than 2 decimal places');
    }

    return parsedAmount;
  }

  /**
   * Create payment intent for bounty (escrow)
   */
  async createBountyPayment(caseData, posterId) {
    try {
      // Validate the bounty amount
      const validatedAmount = this.validateBountyAmount(caseData.bounty_amount);
      const amountInCents = Math.round(validatedAmount * 100);

      // Log payment attempt
      logger.audit('payment_attempt', posterId, {
        caseId: caseData.id,
        amount: validatedAmount,
        testMode: this.testMode,
      });

      // In test mode, create a mock payment intent
      if (this.testMode) {
        logger.info('Creating test payment intent', { amount: validatedAmount, posterId });
        return {
          id: `pi_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          amount: amountInCents,
          currency: PAYMENT_CONFIG.CURRENCY,
          status: 'succeeded',
          test_mode: true,
        };
      }

      const stripe = getStripeClient();

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: PAYMENT_CONFIG.CURRENCY,
        metadata: {
          case_id: caseData.id,
          poster_id: posterId,
          platform: 'ifound',
        },
        description: `Bounty for case: ${caseData.title}`,
      });

      logger.audit('payment_created', posterId, {
        paymentIntentId: paymentIntent.id,
        caseId: caseData.id,
        amount: validatedAmount,
      });

      return paymentIntent;
    } catch (error) {
      logger.errorWithContext(error, {
        action: 'createBountyPayment',
        posterId,
        caseId: caseData?.id,
      });
      throw new Error('Failed to create payment. Please try again.');
    }
  }

  /**
   * Release bounty payment to finder
   */
  async releaseBountyToFinder(transactionId, releasedBy) {
    try {
      const transaction = await Transaction.findByPk(transactionId);

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== 'escrow') {
        throw new Error('Transaction not in escrow status');
      }

      logger.audit('bounty_release_attempt', releasedBy, {
        transactionId,
        finderId: transaction.finder_id,
        amount: transaction.net_amount,
      });

      // In test mode, simulate transfer
      if (this.testMode) {
        transaction.status = 'completed';
        transaction.completed_at = new Date();
        await transaction.save();

        logger.info('Test mode: bounty released', { transactionId });
        return {
          id: `tr_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          amount: transaction.net_amount * 100,
          status: 'paid',
          test_mode: true,
        };
      }

      // Get finder's Stripe account
      const finder = await User.findByPk(transaction.finder_id);

      if (!finder.stripe_account_id) {
        throw new Error('Finder does not have a connected Stripe account');
      }

      const stripe = getStripeClient();

      // Create transfer to finder
      const transfer = await stripe.transfers.create({
        amount: Math.round(parseFloat(transaction.net_amount) * 100),
        currency: PAYMENT_CONFIG.CURRENCY,
        destination: finder.stripe_account_id,
        metadata: {
          transaction_id: transactionId,
          case_id: transaction.case_id,
          platform: 'ifound',
        },
      });

      // Update transaction
      transaction.stripe_transfer_id = transfer.id;
      transaction.status = 'completed';
      transaction.completed_at = new Date();
      await transaction.save();

      logger.audit('bounty_released', releasedBy, {
        transactionId,
        transferId: transfer.id,
        finderId: transaction.finder_id,
        amount: transaction.net_amount,
      });

      return transfer;
    } catch (error) {
      logger.errorWithContext(error, {
        action: 'releaseBountyToFinder',
        transactionId,
      });

      // Update transaction as failed
      try {
        const transaction = await Transaction.findByPk(transactionId);
        if (transaction) {
          transaction.status = 'failed';
          transaction.failed_at = new Date();
          transaction.failure_reason = error.message;
          await transaction.save();
        }
      } catch (updateError) {
        logger.error('Failed to update transaction status', { transactionId, error: updateError.message });
      }

      throw error;
    }
  }

  /**
   * Refund payment
   */
  async refundPayment(transactionId, reason, refundedBy) {
    try {
      const transaction = await Transaction.findByPk(transactionId);

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Validate reason
      if (!reason || reason.trim().length < 10) {
        throw new Error('Refund reason must be at least 10 characters');
      }

      logger.audit('refund_attempt', refundedBy, {
        transactionId,
        reason,
        amount: transaction.amount,
      });

      // In test mode, simulate refund
      if (this.testMode) {
        transaction.status = 'refunded';
        transaction.refunded_at = new Date();
        transaction.refund_reason = reason;
        await transaction.save();

        logger.info('Test mode: refund processed', { transactionId });
        return {
          id: `re_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          amount: transaction.amount * 100,
          status: 'succeeded',
          test_mode: true,
        };
      }

      if (!transaction.stripe_payment_intent_id) {
        throw new Error('No payment intent found for this transaction');
      }

      const stripe = getStripeClient();

      // Create refund
      const refund = await stripe.refunds.create({
        payment_intent: transaction.stripe_payment_intent_id,
        reason: 'requested_by_customer',
        metadata: {
          transaction_id: transactionId,
          custom_reason: reason,
          platform: 'ifound',
        },
      });

      // Update transaction
      transaction.status = 'refunded';
      transaction.refunded_at = new Date();
      transaction.refund_reason = reason;
      await transaction.save();

      logger.audit('refund_processed', refundedBy, {
        transactionId,
        refundId: refund.id,
        amount: transaction.amount,
      });

      return refund;
    } catch (error) {
      logger.errorWithContext(error, {
        action: 'refundPayment',
        transactionId,
      });
      throw error;
    }
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(userId, options = {}) {
    try {
      const { page = 1, limit = 20, type } = options;
      const parsedLimit = Math.min(parseInt(limit) || 20, 100); // Max 100 per page
      const parsedPage = Math.max(parseInt(page) || 1, 1);
      const offset = (parsedPage - 1) * parsedLimit;

      const where = {
        [Op.or]: [
          { finder_id: userId },
          { poster_id: userId },
        ],
      };

      if (type) {
        where.transaction_type = type;
      }

      const { count, rows: transactions } = await Transaction.findAndCountAll({
        where,
        limit: parsedLimit,
        offset,
        order: [['created_at', 'DESC']],
        include: [
          {
            model: Case,
            as: 'case',
            attributes: ['id', 'title', 'case_type'],
          },
        ],
      });

      return {
        transactions,
        pagination: {
          total: count,
          page: parsedPage,
          pages: Math.ceil(count / parsedLimit),
          limit: parsedLimit,
        },
      };
    } catch (error) {
      logger.errorWithContext(error, {
        action: 'getTransactionHistory',
        userId,
      });
      throw error;
    }
  }

  /**
   * Check if service is in test mode
   */
  isTestMode() {
    return this.testMode;
  }
}

module.exports = new PaymentService();
