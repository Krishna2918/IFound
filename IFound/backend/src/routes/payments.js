const express = require('express');
const router = express.Router();
const {
  createBountyPayment,
  releaseBounty,
  refundPayment,
  getTransactionHistory,
  getUserBalance,
  getEarningsSummary,
  requestWithdrawal,
  handleStripeWebhook,
} = require('../controllers/paymentController');
const { authenticateToken } = require('../middleware/auth');

/**
 * Stripe Webhook Handler
 * This is exported separately and mounted in server.js before body parsing
 * because Stripe webhooks require the raw body for signature verification
 */
const webhookHandler = async (req, res) => {
  try {
    await handleStripeWebhook(req, res);
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ error: error.message });
  }
};

// All payment routes require authentication
router.use(authenticateToken);

// Existing routes
router.post('/bounty', createBountyPayment);
router.post('/release/:transactionId', releaseBounty);
router.post('/refund/:transactionId', refundPayment);
router.get('/history', getTransactionHistory);
router.get('/balance', getUserBalance);

// Earnings and withdrawal routes
router.get('/earnings', getEarningsSummary);
router.post('/withdraw', requestWithdrawal);

// Export both router and webhook handler
module.exports = router;
module.exports.webhookHandler = webhookHandler;
