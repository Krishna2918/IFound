/**
 * Message Controller
 *
 * Handles chat messaging between finder and claimant for accepted claims.
 */

const { Message, Claim, User, Case } = require('../models');
const { Op } = require('sequelize');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for chat file uploads
const chatUploadDir = path.join(__dirname, '../../uploads/chat');
if (!fs.existsSync(chatUploadDir)) {
  fs.mkdirSync(chatUploadDir, { recursive: true });
}

const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, chatUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `chat-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const chatUpload = multer({
  storage: chatStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) ||
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/msword' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images (JPEG, PNG, GIF) and documents (PDF, DOC, DOCX) are allowed'));
  },
});

/**
 * Get messages for a claim
 * Both finder and claimant can access
 */
const getMessages = asyncHandler(async (req, res) => {
  const { claimId } = req.params;
  const userId = req.userId;
  const { limit = 50, before } = req.query;

  // Get claim with associations to verify access
  const claim = await Claim.findByPk(claimId, {
    include: [
      { model: Case, as: 'foundCase' },
    ],
  });

  if (!claim) {
    return res.status(404).json({
      success: false,
      message: 'Claim not found',
    });
  }

  // Check if user has access (is either finder or claimant)
  const isFinder = claim.foundCase.poster_id === userId;
  const isClaimant = claim.claimant_id === userId;

  if (!isFinder && !isClaimant) {
    return res.status(403).json({
      success: false,
      message: 'You do not have access to this chat',
    });
  }

  // Check if chat is enabled
  if (!claim.chat_enabled) {
    return res.status(400).json({
      success: false,
      message: 'Chat is not yet enabled for this claim',
    });
  }

  // Build query
  const where = { claim_id: claimId };
  if (before) {
    where.createdAt = { [Op.lt]: new Date(before) };
  }

  const messages = await Message.findAll({
    where,
    include: [
      { model: User, as: 'sender', attributes: ['id', 'first_name', 'last_name', 'profile_photo_url'] },
    ],
    order: [['createdAt', 'DESC']],
    limit: parseInt(limit),
  });

  // Mark unread messages as read
  await Message.update(
    { is_read: true, read_at: new Date() },
    {
      where: {
        claim_id: claimId,
        sender_id: { [Op.ne]: userId },
        is_read: false,
      },
    }
  );

  res.json({
    success: true,
    data: {
      messages: messages.reverse(), // Return in chronological order
      claim: {
        id: claim.id,
        status: claim.status,
        chat_enabled: claim.chat_enabled,
      },
    },
  });
});

/**
 * Send a message
 */
const sendMessage = asyncHandler(async (req, res) => {
  const { claimId } = req.params;
  const { content, message_type = 'text', metadata } = req.body;
  const userId = req.userId;

  if (!content || !content.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Message content is required',
    });
  }

  // Get claim to verify access
  const claim = await Claim.findByPk(claimId, {
    include: [
      { model: Case, as: 'foundCase' },
    ],
  });

  if (!claim) {
    return res.status(404).json({
      success: false,
      message: 'Claim not found',
    });
  }

  // Check if user has access
  const isFinder = claim.foundCase.poster_id === userId;
  const isClaimant = claim.claimant_id === userId;

  if (!isFinder && !isClaimant) {
    return res.status(403).json({
      success: false,
      message: 'You do not have access to this chat',
    });
  }

  // Check if chat is enabled
  if (!claim.chat_enabled) {
    return res.status(400).json({
      success: false,
      message: 'Chat is not yet enabled for this claim',
    });
  }

  // Create message
  const message = await Message.create({
    claim_id: claimId,
    sender_id: userId,
    content: content.trim(),
    message_type,
    metadata: metadata || null,
  });

  // Fetch with sender info
  const createdMessage = await Message.findByPk(message.id, {
    include: [
      { model: User, as: 'sender', attributes: ['id', 'first_name', 'last_name', 'profile_photo_url'] },
    ],
  });

  logger.info(`Message sent in claim ${claimId} by user ${userId}`);

  res.status(201).json({
    success: true,
    data: { message: createdMessage },
  });
});

/**
 * Get unread message count for user
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  const userId = req.userId;

  // Get all claims where user is finder or claimant
  const claims = await Claim.findAll({
    where: {
      chat_enabled: true,
      [Op.or]: [
        { claimant_id: userId },
      ],
    },
    include: [
      {
        model: Case,
        as: 'foundCase',
        where: {
          [Op.or]: [
            { poster_id: userId },
          ],
        },
        required: false,
      },
    ],
  });

  // Also get claims where user is the finder
  const finderClaims = await Claim.findAll({
    where: { chat_enabled: true },
    include: [
      {
        model: Case,
        as: 'foundCase',
        where: { poster_id: userId },
        required: true,
      },
    ],
  });

  const allClaimIds = [...new Set([
    ...claims.map(c => c.id),
    ...finderClaims.map(c => c.id),
  ])];

  if (allClaimIds.length === 0) {
    return res.json({ success: true, data: { unreadCount: 0 } });
  }

  const unreadCount = await Message.count({
    where: {
      claim_id: { [Op.in]: allClaimIds },
      sender_id: { [Op.ne]: userId },
      is_read: false,
    },
  });

  res.json({
    success: true,
    data: { unreadCount },
  });
});

/**
 * Get all chats for user (claims with chat enabled)
 */
const getMyChats = asyncHandler(async (req, res) => {
  const userId = req.userId;

  // Get claims where user is claimant
  const claimantClaims = await Claim.findAll({
    where: {
      claimant_id: userId,
      chat_enabled: true,
    },
    include: [
      {
        model: Case,
        as: 'foundCase',
        include: [{ model: User, as: 'poster', attributes: ['id', 'first_name', 'last_name', 'profile_photo_url'] }],
      },
      {
        model: Message,
        as: 'messages',
        limit: 1,
        order: [['createdAt', 'DESC']],
      },
    ],
    order: [['updatedAt', 'DESC']],
  });

  // Get claims where user is finder
  const finderClaims = await Claim.findAll({
    where: { chat_enabled: true },
    include: [
      {
        model: Case,
        as: 'foundCase',
        where: { poster_id: userId },
        required: true,
      },
      {
        model: User,
        as: 'claimant',
        attributes: ['id', 'first_name', 'last_name', 'profile_photo_url'],
      },
      {
        model: Message,
        as: 'messages',
        limit: 1,
        order: [['createdAt', 'DESC']],
      },
    ],
    order: [['updatedAt', 'DESC']],
  });

  // Combine and format
  const chats = [];

  for (const claim of claimantClaims) {
    const unreadCount = await Message.count({
      where: {
        claim_id: claim.id,
        sender_id: { [Op.ne]: userId },
        is_read: false,
      },
    });

    chats.push({
      claim_id: claim.id,
      role: 'claimant',
      other_party: claim.foundCase.poster,
      item_title: claim.foundCase.title,
      last_message: claim.messages[0] || null,
      unread_count: unreadCount,
      status: claim.status,
      updated_at: claim.updatedAt,
    });
  }

  for (const claim of finderClaims) {
    // Skip if already added (shouldn't happen, but safety check)
    if (chats.find(c => c.claim_id === claim.id)) continue;

    const unreadCount = await Message.count({
      where: {
        claim_id: claim.id,
        sender_id: { [Op.ne]: userId },
        is_read: false,
      },
    });

    chats.push({
      claim_id: claim.id,
      role: 'finder',
      other_party: claim.claimant,
      item_title: claim.foundCase.title,
      last_message: claim.messages[0] || null,
      unread_count: unreadCount,
      status: claim.status,
      updated_at: claim.updatedAt,
    });
  }

  // Sort by last activity
  chats.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  res.json({
    success: true,
    data: { chats },
  });
});

/**
 * Send initial greeting messages when chat is enabled
 * Called internally when a claim is accepted
 */
const sendInitialMessages = async (claimId, finderId, claimantId, itemTitle) => {
  try {
    // System greeting message
    await Message.create({
      claim_id: claimId,
      sender_id: finderId,
      content: `Chat has been enabled! You can now coordinate the handover of "${itemTitle}".`,
      message_type: 'system',
    });

    // Finder's auto greeting
    await Message.create({
      claim_id: claimId,
      sender_id: finderId,
      content: `Hi! I've accepted your claim for the ${itemTitle}. Let's arrange a safe time and place to meet for the handover. When and where works best for you?`,
      message_type: 'text',
    });

    logger.info(`Initial messages sent for claim ${claimId}`);
  } catch (error) {
    logger.error(`Error sending initial messages for claim ${claimId}:`, error);
  }
};

/**
 * Upload a file/document in chat
 */
const uploadChatFile = asyncHandler(async (req, res) => {
  const { claimId } = req.params;
  const userId = req.userId;

  // Get claim to verify access
  const claim = await Claim.findByPk(claimId, {
    include: [{ model: Case, as: 'foundCase' }],
  });

  if (!claim) {
    return res.status(404).json({
      success: false,
      message: 'Claim not found',
    });
  }

  // Check if user has access
  const isFinder = claim.foundCase.poster_id === userId;
  const isClaimant = claim.claimant_id === userId;

  if (!isFinder && !isClaimant) {
    return res.status(403).json({
      success: false,
      message: 'You do not have access to this chat',
    });
  }

  // Check if chat is enabled
  if (!claim.chat_enabled) {
    return res.status(400).json({
      success: false,
      message: 'Chat is not yet enabled for this claim',
    });
  }

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No file uploaded',
    });
  }

  // Determine message type based on file
  const ext = path.extname(req.file.originalname).toLowerCase();
  const isImage = ['.jpg', '.jpeg', '.png', '.gif'].includes(ext);
  const messageType = isImage ? 'image' : 'document';

  // Create message with file
  const fileUrl = `/uploads/chat/${req.file.filename}`;
  const message = await Message.create({
    claim_id: claimId,
    sender_id: userId,
    content: isImage ? 'Shared an image' : `Shared a document: ${req.file.originalname}`,
    message_type: messageType,
    metadata: {
      file_url: fileUrl,
      file_name: req.file.originalname,
      file_size: req.file.size,
      file_type: req.file.mimetype,
    },
  });

  // Fetch with sender info
  const createdMessage = await Message.findByPk(message.id, {
    include: [
      { model: User, as: 'sender', attributes: ['id', 'first_name', 'last_name', 'profile_photo_url'] },
    ],
  });

  logger.info(`File uploaded in claim ${claimId} by user ${userId}: ${req.file.originalname}`);

  res.status(201).json({
    success: true,
    data: { message: createdMessage },
  });
});

module.exports = {
  getMessages,
  sendMessage,
  getUnreadCount,
  getMyChats,
  sendInitialMessages,
  uploadChatFile,
  chatUpload,
};
