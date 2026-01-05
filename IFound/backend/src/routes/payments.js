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
} = require('../controllers/paymentController');
const { authenticateToken } = require('../middleware/auth');

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

module.exports = router;
