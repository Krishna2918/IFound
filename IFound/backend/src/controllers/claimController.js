/**
 * Claim Controller
 *
 * Handles all claim-related operations for the "Finder posted first" scenario.
 */

const { Claim, Case, User, Photo, Transaction, Message } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const { Op } = require('sequelize');
const { validateClaimContent } = require('../services/contentModerationService');
const { sendInitialMessages } = require('./messageController');
const escrowService = require('../services/escrowService');
const notificationService = require('../services/notificationService');

// Platform service fee rate (2.5% from claimant's bounty)
const PLATFORM_COMMISSION_RATE = 0.025;

/**
 * @desc    Create a claim on a found item
 * @route   POST /api/v1/claims
 * @access  Private
 */
const createClaim = asyncHandler(async (req, res) => {
  const {
    found_case_id,
    verification_description,
    bounty_offered,
    proof_photo_url,
    lost_case_id, // Optional: link to existing lost case
  } = req.body;

  const claimant_id = req.userId;

  // Validate required fields
  if (!found_case_id || !verification_description) {
    return res.status(400).json({
      success: false,
      message: 'Found case ID and verification description are required',
    });
  }

  // Check if the found case exists and is a found_item
  const foundCase = await Case.findByPk(found_case_id, {
    include: [
      { model: User, as: 'poster' },
      { model: Photo, as: 'photos' },
    ],
  });

  if (!foundCase) {
    return res.status(404).json({
      success: false,
      message: 'Found item case not found',
    });
  }

  if (foundCase.case_type !== 'found_item') {
    return res.status(400).json({
      success: false,
      message: 'Can only claim found items',
    });
  }

  if (foundCase.status !== 'active') {
    return res.status(400).json({
      success: false,
      message: 'This item is no longer available for claims',
    });
  }

  // Prevent claiming your own found item
  if (foundCase.poster_id === claimant_id) {
    return res.status(400).json({
      success: false,
      message: 'You cannot claim your own found item',
    });
  }

  // Check if user already has a pending claim on this item
  const existingClaim = await Claim.findOne({
    where: {
      found_case_id,
      claimant_id,
      status: { [Op.notIn]: ['rejected', 'cancelled'] },
    },
  });

  if (existingClaim) {
    return res.status(400).json({
      success: false,
      message: 'You already have an active claim on this item',
    });
  }

  // Content moderation - prevent buying/selling language in claims
  const contentValidation = validateClaimContent({
    verification_description,
    bounty_offered: parseFloat(bounty_offered) || 0,
  });
  if (!contentValidation.isValid) {
    return res.status(400).json({
      success: false,
      message: contentValidation.message || 'Your claim contains inappropriate content.',
      suggestions: contentValidation.suggestions,
    });
  }

  // Validate bounty amount
  const bounty = parseFloat(bounty_offered) || 0;
  if (bounty < 0 || bounty > 50) {
    return res.status(400).json({
      success: false,
      message: 'Bounty must be between $0 and $50 CAD',
    });
  }

  // Create the claim
  const claim = await Claim.create({
    found_case_id,
    claimant_id,
    lost_case_id: lost_case_id || null,
    verification_description,
    proof_photo_url: proof_photo_url || null,
    bounty_offered: bounty,
    status: 'pending',
  });

  // Fetch the created claim with associations
  const createdClaim = await Claim.findByPk(claim.id, {
    include: [
      { model: Case, as: 'foundCase', include: [{ model: Photo, as: 'photos' }] },
      { model: User, as: 'claimant', attributes: ['id', 'first_name', 'last_name', 'profile_photo_url'] },
    ],
  });

  logger.info(`Claim created: ${claim.id} by user ${claimant_id} on case ${found_case_id}`);

  // Send notification to the finder about the new claim
  try {
    await notificationService.notifyClaimReceived(
      foundCase.poster_id,
      claim,
      foundCase
    );
  } catch (notifError) {
    logger.error('Failed to send claim notification:', notifError);
  }

  res.status(201).json({
    success: true,
    message: 'Claim submitted successfully. The finder will review your claim.',
    data: { claim: createdClaim },
  });
});

/**
 * @desc    Get claims on a found item (for finder)
 * @route   GET /api/v1/claims/case/:caseId
 * @access  Private (finder only)
 */
const getClaimsForCase = asyncHandler(async (req, res) => {
  const { caseId } = req.params;
  const userId = req.userId;

  // Check if user is the poster of this case
  const foundCase = await Case.findByPk(caseId);

  if (!foundCase) {
    return res.status(404).json({
      success: false,
      message: 'Case not found',
    });
  }

  if (foundCase.poster_id !== userId && req.user?.user_type !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view claims for this case',
    });
  }

  const claims = await Claim.findAll({
    where: { found_case_id: caseId },
    include: [
      {
        model: User,
        as: 'claimant',
        attributes: ['id', 'first_name', 'last_name', 'profile_photo_url', 'created_at'],
      },
      {
        model: Case,
        as: 'foundCase',
        attributes: ['id', 'title', 'poster_id', 'case_number', 'status'],
      },
      {
        model: Case,
        as: 'lostCase',
        include: [{ model: Photo, as: 'photos' }],
      },
    ],
    order: [['created_at', 'DESC']],
  });

  res.status(200).json({
    success: true,
    data: {
      claims,
      count: claims.length,
    },
  });
});

/**
 * @desc    Get my claims (for claimant)
 * @route   GET /api/v1/claims/my-claims
 * @access  Private
 */
const getMyClaims = asyncHandler(async (req, res) => {
  const claimant_id = req.userId;

  const claims = await Claim.findAll({
    where: { claimant_id },
    include: [
      {
        model: Case,
        as: 'foundCase',
        include: [
          { model: Photo, as: 'photos' },
          { model: User, as: 'poster', attributes: ['id', 'first_name', 'last_name', 'profile_photo_url'] },
        ],
      },
    ],
    order: [['created_at', 'DESC']],
  });

  res.status(200).json({
    success: true,
    data: { claims },
  });
});

/**
 * @desc    Get a single claim by ID
 * @route   GET /api/v1/claims/:claimId
 * @access  Private (claimant or finder)
 */
const getClaimById = asyncHandler(async (req, res) => {
  const { claimId } = req.params;
  const userId = req.userId;

  const claim = await Claim.findByPk(claimId, {
    include: [
      {
        model: Case,
        as: 'foundCase',
        include: [
          { model: Photo, as: 'photos' },
          { model: User, as: 'poster', attributes: ['id', 'first_name', 'last_name', 'profile_photo_url'] },
        ],
      },
      {
        model: User,
        as: 'claimant',
        attributes: ['id', 'first_name', 'last_name', 'profile_photo_url'],
      },
      {
        model: Case,
        as: 'lostCase',
        include: [{ model: Photo, as: 'photos' }],
      },
    ],
  });

  if (!claim) {
    return res.status(404).json({
      success: false,
      message: 'Claim not found',
    });
  }

  // Check authorization
  const isClaimant = claim.claimant_id === userId;
  const isFinder = claim.foundCase?.poster_id === userId;
  const isAdmin = req.user?.user_type === 'admin';

  if (!isClaimant && !isFinder && !isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view this claim',
    });
  }

  res.status(200).json({
    success: true,
    data: { claim },
  });
});

/**
 * @desc    Accept a claim (by finder)
 * @route   PUT /api/v1/claims/:claimId/accept
 * @access  Private (finder only)
 */
const acceptClaim = asyncHandler(async (req, res) => {
  const { claimId } = req.params;
  const { finder_notes } = req.body;
  const userId = req.userId;

  const claim = await Claim.findByPk(claimId, {
    include: [
      { model: Case, as: 'foundCase' },
      { model: User, as: 'claimant', attributes: ['id', 'first_name', 'last_name', 'email'] },
    ],
  });

  if (!claim) {
    return res.status(404).json({
      success: false,
      message: 'Claim not found',
    });
  }

  // Check if user is the finder
  if (claim.foundCase.poster_id !== userId) {
    return res.status(403).json({
      success: false,
      message: 'Only the finder can accept claims',
    });
  }

  if (claim.status !== 'pending' && claim.status !== 'under_review') {
    return res.status(400).json({
      success: false,
      message: `Cannot accept a claim with status: ${claim.status}`,
    });
  }

  // Generate case number for tracking: IF-YYYYMMDD-XXXX
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const caseNumber = `IF-${dateStr}-${randomNum}`;

  // Update claim
  claim.status = 'accepted';
  claim.accepted_at = new Date();
  claim.finder_notes = finder_notes || null;
  claim.chat_enabled = true;

  // Create escrow hold for the bounty if offered
  const bountyAmount = parseFloat(claim.bounty_offered) || 0;
  if (bountyAmount > 0) {
    try {
      // Create a temporary case data object for escrow
      const escrowCaseData = {
        id: claim.found_case_id,
        title: claim.foundCase.title,
        bounty_amount: bountyAmount,
        platform_commission: bountyAmount * PLATFORM_COMMISSION_RATE,
      };

      const escrowResult = await escrowService.createEscrowHold(
        escrowCaseData,
        claim.claimant_id // Claimant pays the bounty
      );

      claim.payment_transaction_id = escrowResult.transaction.id;
      claim.payment_status = 'processing';

      logger.info(`Escrow hold created for claim ${claimId}, transaction ${escrowResult.transaction.id}`);
    } catch (escrowError) {
      logger.error(`Failed to create escrow for claim ${claimId}:`, escrowError);
      // Continue without escrow in test mode
      claim.payment_status = 'pending';
    }
  }

  await claim.save();

  // Update found case status to 'claimed' and assign case number
  await Case.update(
    {
      status: 'claimed',
      case_number: caseNumber,
      bounty_amount: bountyAmount,
      bounty_status: bountyAmount > 0 ? 'held' : 'pending',
    },
    { where: { id: claim.found_case_id } }
  );

  // Reject other pending claims on this case
  await Claim.update(
    {
      status: 'rejected',
      rejection_reason: 'Another claim was accepted',
      rejected_at: new Date(),
    },
    {
      where: {
        found_case_id: claim.found_case_id,
        id: { [Op.ne]: claimId },
        status: { [Op.in]: ['pending', 'under_review'] },
      },
    }
  );

  logger.info(`Claim ${claimId} accepted by finder ${userId}`);

  // Send initial chat messages
  await sendInitialMessages(
    claimId,
    userId, // finder
    claim.claimant_id,
    claim.foundCase.title
  );

  // Send notification to claimant about accepted claim
  try {
    await notificationService.sendNotification({
      userId: claim.claimant_id,
      type: 'claim_accepted',
      title: 'Your Claim Was Accepted!',
      body: `Good news! Your claim for "${claim.foundCase.title}" has been accepted. You can now chat with the finder.`,
      data: { claimId: claim.id, caseId: claim.found_case_id },
      actionUrl: `ifound://claim/${claim.id}`,
      entityType: 'Claim',
      entityId: claim.id,
      priority: 'high',
      channels: ['push', 'email', 'inapp'],
    });
  } catch (notifError) {
    logger.error('Failed to send claim accepted notification:', notifError);
  }

  res.status(200).json({
    success: true,
    message: 'Claim accepted! Chat is now enabled.',
    data: { claim },
  });
});

/**
 * @desc    Reject a claim (by finder)
 * @route   PUT /api/v1/claims/:claimId/reject
 * @access  Private (finder only)
 */
const rejectClaim = asyncHandler(async (req, res) => {
  const { claimId } = req.params;
  const { rejection_reason, finder_notes } = req.body;
  const userId = req.userId;

  const claim = await Claim.findByPk(claimId, {
    include: [{ model: Case, as: 'foundCase' }],
  });

  if (!claim) {
    return res.status(404).json({
      success: false,
      message: 'Claim not found',
    });
  }

  // Check if user is the finder
  if (claim.foundCase.poster_id !== userId) {
    return res.status(403).json({
      success: false,
      message: 'Only the finder can reject claims',
    });
  }

  if (claim.status !== 'pending' && claim.status !== 'under_review') {
    return res.status(400).json({
      success: false,
      message: `Cannot reject a claim with status: ${claim.status}`,
    });
  }

  claim.status = 'rejected';
  claim.rejected_at = new Date();
  claim.rejection_reason = rejection_reason || 'Verification failed';
  claim.finder_notes = finder_notes || null;
  await claim.save();

  logger.info(`Claim ${claimId} rejected by finder ${userId}`);

  // Send notification to claimant about rejected claim
  try {
    await notificationService.notifyClaimRejected(
      claim.claimant_id,
      claim,
      rejection_reason || 'The finder could not verify your ownership.'
    );
  } catch (notifError) {
    logger.error('Failed to send claim rejected notification:', notifError);
  }

  res.status(200).json({
    success: true,
    message: 'Claim rejected',
    data: { claim },
  });
});

/**
 * @desc    Confirm handover (by either party)
 * @route   PUT /api/v1/claims/:claimId/confirm-handover
 * @access  Private
 */
const confirmHandover = asyncHandler(async (req, res) => {
  const { claimId } = req.params;
  const userId = req.userId;

  const claim = await Claim.findByPk(claimId, {
    include: [
      { model: Case, as: 'foundCase' },
      { model: User, as: 'claimant' },
    ],
  });

  if (!claim) {
    return res.status(404).json({
      success: false,
      message: 'Claim not found',
    });
  }

  if (claim.status !== 'accepted') {
    return res.status(400).json({
      success: false,
      message: 'Claim must be accepted before confirming handover',
    });
  }

  const isClaimant = claim.claimant_id === userId;
  const isFinder = claim.foundCase.poster_id === userId;

  if (!isClaimant && !isFinder) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to confirm handover',
    });
  }

  // Update confirmation status
  if (isClaimant) {
    claim.handover_confirmed_by_claimant = true;
  }
  if (isFinder) {
    claim.handover_confirmed_by_finder = true;
  }

  // Check if both parties confirmed
  if (claim.handover_confirmed_by_claimant && claim.handover_confirmed_by_finder) {
    claim.status = 'completed';
    claim.handover_completed_at = new Date();

    // Archive the found case - remove from browsing
    await Case.update(
      {
        status: 'archived',
        resolved_at: new Date(),
        resolved_by: claim.claimant_id,
        bounty_status: 'paid',
      },
      { where: { id: claim.found_case_id } }
    );

    // Process bounty payment - release escrow to finder
    const bountyAmount = parseFloat(claim.bounty_offered) || 0;
    if (bountyAmount > 0) {
      const finderId = claim.foundCase.poster_id; // Finder is the one who posted the found item

      // Check if there's an existing escrow transaction to release
      if (claim.payment_transaction_id) {
        try {
          const releaseResult = await escrowService.releaseEscrow(
            claim.payment_transaction_id,
            finderId,
            claim.id
          );

          claim.payment_status = 'completed';

          const netAmount = parseFloat(releaseResult.transaction.net_amount);

          // Send system message about payment
          await Message.create({
            claim_id: claim.id,
            sender_id: finderId,
            content: `Transaction completed! $${netAmount.toFixed(2)} CAD has been added to your earnings (after platform fee).`,
            message_type: 'system',
          });

          logger.info(`Escrow released to finder for claim ${claimId}, amount: $${netAmount.toFixed(2)}`);

          // Send payment notification to finder
          try {
            await notificationService.notifyPaymentReceived(
              finderId,
              netAmount.toFixed(2),
              releaseResult.transaction.id
            );
          } catch (notifError) {
            logger.error('Failed to send payment notification:', notifError);
          }
        } catch (escrowError) {
          logger.error(`Failed to release escrow for claim ${claimId}:`, escrowError);
          // Fallback: create a direct transaction if escrow release fails
          const platformCommission = bountyAmount * PLATFORM_COMMISSION_RATE;
          const netAmount = bountyAmount - platformCommission;

          const transaction = await Transaction.create({
            case_id: claim.found_case_id,
            finder_id: finderId,
            poster_id: claim.claimant_id,
            transaction_type: 'bounty_payment',
            amount: bountyAmount,
            platform_commission: platformCommission,
            net_amount: netAmount,
            currency: 'CAD',
            status: 'completed',
            payment_method: 'stripe',
            completed_at: new Date(),
            metadata: {
              claim_id: claim.id,
              item_title: claim.foundCase.title,
              fallback: true,
              original_transaction_id: claim.payment_transaction_id,
            },
          });

          claim.payment_transaction_id = transaction.id;
          claim.payment_status = 'completed';

          await Message.create({
            claim_id: claim.id,
            sender_id: finderId,
            content: `Transaction completed! $${netAmount.toFixed(2)} CAD has been added to your earnings (after ${(PLATFORM_COMMISSION_RATE * 100).toFixed(1)}% platform fee).`,
            message_type: 'system',
          });

          logger.info(`Fallback payment of $${netAmount.toFixed(2)} CAD created for finder on claim ${claimId}`);

          // Send payment notification to finder
          try {
            await notificationService.notifyPaymentReceived(
              finderId,
              netAmount.toFixed(2),
              transaction.id
            );
          } catch (notifError) {
            logger.error('Failed to send payment notification:', notifError);
          }
        }
      } else {
        // No escrow was created (test mode or failed), create direct transaction
        const platformCommission = bountyAmount * PLATFORM_COMMISSION_RATE;
        const netAmount = bountyAmount - platformCommission;

        const transaction = await Transaction.create({
          case_id: claim.found_case_id,
          finder_id: finderId,
          poster_id: claim.claimant_id,
          transaction_type: 'bounty_payment',
          amount: bountyAmount,
          platform_commission: platformCommission,
          net_amount: netAmount,
          currency: 'CAD',
          status: 'completed',
          payment_method: 'stripe',
          completed_at: new Date(),
          metadata: {
            claim_id: claim.id,
            item_title: claim.foundCase.title,
          },
        });

        claim.payment_transaction_id = transaction.id;
        claim.payment_status = 'completed';

        await Message.create({
          claim_id: claim.id,
          sender_id: finderId,
          content: `Transaction completed! $${netAmount.toFixed(2)} CAD has been added to your earnings (after ${(PLATFORM_COMMISSION_RATE * 100).toFixed(1)}% platform fee).`,
          message_type: 'system',
        });

        logger.info(`Direct payment of $${netAmount.toFixed(2)} CAD created for finder on claim ${claimId}`);

        // Send payment notification to finder
        try {
          await notificationService.notifyPaymentReceived(
            finderId,
            netAmount.toFixed(2),
            transaction.id
          );
        } catch (notifError) {
          logger.error('Failed to send payment notification:', notifError);
        }
      }
    }

    logger.info(`Claim ${claimId} completed - handover confirmed by both parties`);
  }

  await claim.save();

  res.status(200).json({
    success: true,
    message: claim.status === 'completed'
      ? 'Handover complete! The case has been resolved.'
      : 'Your confirmation has been recorded. Waiting for the other party.',
    data: { claim },
  });
});

/**
 * @desc    Cancel a claim (by claimant)
 * @route   PUT /api/v1/claims/:claimId/cancel
 * @access  Private (claimant only)
 */
const cancelClaim = asyncHandler(async (req, res) => {
  const { claimId } = req.params;
  const userId = req.userId;

  const claim = await Claim.findByPk(claimId);

  if (!claim) {
    return res.status(404).json({
      success: false,
      message: 'Claim not found',
    });
  }

  if (claim.claimant_id !== userId) {
    return res.status(403).json({
      success: false,
      message: 'Only the claimant can cancel their claim',
    });
  }

  if (claim.status === 'completed' || claim.status === 'cancelled') {
    return res.status(400).json({
      success: false,
      message: `Cannot cancel a claim with status: ${claim.status}`,
    });
  }

  // Refund escrow if there was one
  if (claim.payment_transaction_id && claim.payment_status === 'processing') {
    try {
      await escrowService.refundEscrow(
        claim.payment_transaction_id,
        'Claim cancelled by claimant'
      );
      claim.payment_status = 'refunded';
      logger.info(`Escrow refunded for cancelled claim ${claimId}`);
    } catch (refundError) {
      logger.error(`Failed to refund escrow for claim ${claimId}:`, refundError);
    }
  }

  claim.status = 'cancelled';
  await claim.save();

  // Update case status back to active if it was claimed
  if (claim.found_case_id) {
    await Case.update(
      { status: 'active', bounty_status: 'pending' },
      { where: { id: claim.found_case_id, status: 'claimed' } }
    );
  }

  logger.info(`Claim ${claimId} cancelled by claimant ${userId}`);

  res.status(200).json({
    success: true,
    message: 'Claim cancelled',
    data: { claim },
  });
});

/**
 * @desc    Add verification question (by finder)
 * @route   POST /api/v1/claims/:claimId/questions
 * @access  Private (finder only)
 */
const addVerificationQuestion = asyncHandler(async (req, res) => {
  const { claimId } = req.params;
  const { question } = req.body;
  const userId = req.userId;

  if (!question) {
    return res.status(400).json({
      success: false,
      message: 'Question is required',
    });
  }

  const claim = await Claim.findByPk(claimId, {
    include: [{ model: Case, as: 'foundCase' }],
  });

  if (!claim) {
    return res.status(404).json({
      success: false,
      message: 'Claim not found',
    });
  }

  if (claim.foundCase.poster_id !== userId) {
    return res.status(403).json({
      success: false,
      message: 'Only the finder can ask verification questions',
    });
  }

  // Update status to under_review
  if (claim.status === 'pending') {
    claim.status = 'under_review';
  }

  // Add question
  const questions = claim.verification_questions || [];
  questions.push({
    question,
    answer: null,
    askedAt: new Date(),
    answeredAt: null,
  });
  claim.verification_questions = questions;
  await claim.save();

  // Send notification to claimant about verification question
  try {
    await notificationService.sendNotification({
      userId: claim.claimant_id,
      type: 'verification_question',
      title: 'Verification Question',
      body: `The finder has asked you a question about your claim for "${claim.foundCase.title}"`,
      data: { claimId: claim.id, questionIndex: questions.length - 1 },
      actionUrl: `ifound://claim/${claim.id}/verify`,
      entityType: 'Claim',
      entityId: claim.id,
      channels: ['push', 'email', 'inapp'],
    });
  } catch (notifError) {
    logger.error('Failed to send verification question notification:', notifError);
  }

  res.status(200).json({
    success: true,
    message: 'Question sent to claimant',
    data: { claim },
  });
});

/**
 * @desc    Answer verification question (by claimant)
 * @route   PUT /api/v1/claims/:claimId/questions/:questionIndex
 * @access  Private (claimant only)
 */
const answerVerificationQuestion = asyncHandler(async (req, res) => {
  const { claimId, questionIndex } = req.params;
  const { answer } = req.body;
  const userId = req.userId;

  if (!answer) {
    return res.status(400).json({
      success: false,
      message: 'Answer is required',
    });
  }

  const claim = await Claim.findByPk(claimId);

  if (!claim) {
    return res.status(404).json({
      success: false,
      message: 'Claim not found',
    });
  }

  if (claim.claimant_id !== userId) {
    return res.status(403).json({
      success: false,
      message: 'Only the claimant can answer questions',
    });
  }

  const questions = claim.verification_questions || [];
  const index = parseInt(questionIndex);

  if (index < 0 || index >= questions.length) {
    return res.status(400).json({
      success: false,
      message: 'Invalid question index',
    });
  }

  questions[index].answer = answer;
  questions[index].answeredAt = new Date();
  claim.verification_questions = questions;
  await claim.save();

  // Get the finder to notify them
  const foundCase = await Case.findByPk(claim.found_case_id);
  if (foundCase) {
    try {
      await notificationService.sendNotification({
        userId: foundCase.poster_id,
        type: 'verification_answer',
        title: 'Verification Answer Received',
        body: `The claimant has answered your verification question`,
        data: { claimId: claim.id, questionIndex: index },
        actionUrl: `ifound://claim/${claim.id}/review`,
        entityType: 'Claim',
        entityId: claim.id,
        channels: ['push', 'inapp'],
      });
    } catch (notifError) {
      logger.error('Failed to send verification answer notification:', notifError);
    }
  }

  res.status(200).json({
    success: true,
    message: 'Answer submitted',
    data: { claim },
  });
});

/**
 * @desc    Get claims stats for dashboard
 * @route   GET /api/v1/claims/stats
 * @access  Private
 */
const getClaimsStats = asyncHandler(async (req, res) => {
  const userId = req.userId;

  // Get counts for user's claims (as claimant)
  const myClaimsStats = await Claim.findAll({
    where: { claimant_id: userId },
    attributes: ['status'],
    raw: true,
  });

  // Get counts for claims on user's found items (as finder)
  const userCases = await Case.findAll({
    where: { poster_id: userId, case_type: 'found_item' },
    attributes: ['id'],
    raw: true,
  });
  const caseIds = userCases.map(c => c.id);

  const receivedClaimsStats = caseIds.length > 0
    ? await Claim.findAll({
        where: { found_case_id: { [Op.in]: caseIds } },
        attributes: ['status'],
        raw: true,
      })
    : [];

  // Count by status
  const countByStatus = (claims) => {
    return claims.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {});
  };

  res.status(200).json({
    success: true,
    data: {
      myClaims: {
        total: myClaimsStats.length,
        byStatus: countByStatus(myClaimsStats),
      },
      receivedClaims: {
        total: receivedClaimsStats.length,
        byStatus: countByStatus(receivedClaimsStats),
      },
    },
  });
});

module.exports = {
  createClaim,
  getClaimsForCase,
  getMyClaims,
  getClaimById,
  acceptClaim,
  rejectClaim,
  confirmHandover,
  cancelClaim,
  addVerificationQuestion,
  answerVerificationQuestion,
  getClaimsStats,
};
