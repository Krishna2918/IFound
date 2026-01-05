/**
 * Message Routes
 *
 * Routes for chat messaging between finder and claimant.
 */

const express = require('express');
const router = express.Router();
const {
  getMessages,
  sendMessage,
  getUnreadCount,
  getMyChats,
  uploadChatFile,
  chatUpload,
} = require('../controllers/messageController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// Get all chats for user
router.get('/chats', getMyChats);

// Get unread message count
router.get('/unread-count', getUnreadCount);

// Get messages for a claim
router.get('/claim/:claimId', getMessages);

// Send a message
router.post('/claim/:claimId', sendMessage);

// Upload a file/document in chat
router.post('/claim/:claimId/upload', chatUpload.single('file'), uploadChatFile);

module.exports = router;
