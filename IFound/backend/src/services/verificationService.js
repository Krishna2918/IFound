/**
 * Verification Service
 *
 * Handles user verification including:
 * - Email verification
 * - Phone verification (Twilio)
 * - ID verification (Stripe Identity)
 * - Law enforcement verification
 */

const { User } = require('../models');
const auditService = require('./auditService');
const notificationService = require('./notificationService');
const logger = require('../config/logger');
const crypto = require('crypto');

// In-memory store for verification codes (use Redis in production)
const verificationCodes = new Map();

// Configuration
const CONFIG = {
  // Code expiry in minutes
  emailCodeExpiry: 60,
  phoneCodeExpiry: 10,

  // Code length
  codeLength: 6,

  // Max attempts
  maxAttempts: 5,

  // Cooldown between resends (seconds)
  resendCooldown: 60,

  // KYC threshold for ID verification
  kycThreshold: parseFloat(process.env.KYC_THRESHOLD) || 100,
};

/**
 * Generate a random verification code
 */
function generateCode(length = CONFIG.codeLength) {
  return crypto.randomInt(Math.pow(10, length - 1), Math.pow(10, length)).toString();
}

/**
 * Store verification code
 */
function storeCode(userId, type, code, expiryMinutes) {
  const key = `${userId}:${type}`;
  const existing = verificationCodes.get(key);

  // Check cooldown
  if (existing && Date.now() - existing.createdAt < CONFIG.resendCooldown * 1000) {
    const waitTime = Math.ceil((CONFIG.resendCooldown * 1000 - (Date.now() - existing.createdAt)) / 1000);
    throw new Error(`Please wait ${waitTime} seconds before requesting a new code`);
  }

  verificationCodes.set(key, {
    code,
    expiresAt: Date.now() + expiryMinutes * 60 * 1000,
    attempts: 0,
    createdAt: Date.now(),
  });

  // Cleanup after expiry
  setTimeout(() => verificationCodes.delete(key), expiryMinutes * 60 * 1000);

  return code;
}

/**
 * Verify a code
 */
function verifyCode(userId, type, inputCode) {
  const key = `${userId}:${type}`;
  const stored = verificationCodes.get(key);

  if (!stored) {
    return { valid: false, error: 'No verification code found. Please request a new one.' };
  }

  if (Date.now() > stored.expiresAt) {
    verificationCodes.delete(key);
    return { valid: false, error: 'Verification code has expired. Please request a new one.' };
  }

  if (stored.attempts >= CONFIG.maxAttempts) {
    verificationCodes.delete(key);
    return { valid: false, error: 'Too many failed attempts. Please request a new code.' };
  }

  if (stored.code !== inputCode) {
    stored.attempts++;
    return { valid: false, error: `Invalid code. ${CONFIG.maxAttempts - stored.attempts} attempts remaining.` };
  }

  // Success - delete the code
  verificationCodes.delete(key);
  return { valid: true };
}

// ============================================
// Email Verification
// ============================================

/**
 * Send email verification code
 */
async function sendEmailVerification(userId) {
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.verification_status !== 'unverified') {
      throw new Error('Email already verified');
    }

    const code = generateCode();
    storeCode(userId, 'email', code, CONFIG.emailCodeExpiry);

    // Send email
    await notificationService.sendEmail({
      to: user.email,
      subject: 'Verify Your Email - I Found!!',
      html: `
        <h1>Email Verification</h1>
        <p>Hi ${user.first_name || 'there'},</p>
        <p>Your verification code is:</p>
        <h2 style="font-size: 32px; letter-spacing: 5px; color: #667eea;">${code}</h2>
        <p>This code expires in ${CONFIG.emailCodeExpiry} minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
      text: `Your I Found!! verification code is: ${code}. Expires in ${CONFIG.emailCodeExpiry} minutes.`,
    });

    await auditService.logVerificationStarted(userId, 'email');

    return { success: true, message: 'Verification code sent to your email' };
  } catch (error) {
    logger.error('Send email verification failed:', error);
    throw error;
  }
}

/**
 * Verify email code
 */
async function verifyEmail(userId, code) {
  try {
    const result = verifyCode(userId, 'email', code);

    if (!result.valid) {
      await auditService.logVerificationFailed(userId, 'email', result.error);
      return { success: false, error: result.error };
    }

    // Update user verification status
    await User.update(
      { verification_status: 'email_verified' },
      { where: { id: userId } }
    );

    await auditService.logVerificationCompleted(userId, 'email', 'verified');

    // Send confirmation notification
    await notificationService.sendNotification({
      userId,
      type: 'verification_update',
      title: 'Email Verified!',
      body: 'Your email has been verified successfully.',
      channels: ['push', 'inapp'],
    });

    return { success: true, message: 'Email verified successfully' };
  } catch (error) {
    logger.error('Verify email failed:', error);
    throw error;
  }
}

// ============================================
// Phone Verification (Twilio)
// ============================================

/**
 * Initialize Twilio client
 */
function getTwilioClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio not configured');
  }

  const twilio = require('twilio');
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

/**
 * Send phone verification code via SMS
 */
async function sendPhoneVerification(userId, phoneNumber) {
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    const code = generateCode();
    storeCode(userId, 'phone', code, CONFIG.phoneCodeExpiry);

    // Store the phone number being verified
    verificationCodes.get(`${userId}:phone`).phoneNumber = normalizedPhone;

    try {
      const client = getTwilioClient();
      await client.messages.create({
        body: `Your I Found!! verification code is: ${code}. Expires in ${CONFIG.phoneCodeExpiry} minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: normalizedPhone,
      });
    } catch (twilioError) {
      // If Twilio fails, log and continue (for development)
      logger.warn('Twilio SMS failed, code stored for manual verification:', twilioError.message);
      logger.info(`[DEV] Phone verification code for ${phoneNumber}: ${code}`);
    }

    await auditService.logVerificationStarted(userId, 'phone');

    return { success: true, message: 'Verification code sent to your phone' };
  } catch (error) {
    logger.error('Send phone verification failed:', error);
    throw error;
  }
}

/**
 * Verify phone code
 */
async function verifyPhone(userId, code) {
  try {
    const key = `${userId}:phone`;
    const stored = verificationCodes.get(key);

    const result = verifyCode(userId, 'phone', code);

    if (!result.valid) {
      await auditService.logVerificationFailed(userId, 'phone', result.error);
      return { success: false, error: result.error };
    }

    // Update user with verified phone
    const phoneNumber = stored?.phoneNumber;
    const updateData = { phone_number: phoneNumber };

    // Upgrade verification status if currently only email verified
    const user = await User.findByPk(userId);
    if (user.verification_status === 'email_verified') {
      updateData.verification_documents = {
        ...user.verification_documents,
        phone_verified: true,
        phone_verified_at: new Date().toISOString(),
      };
    }

    await User.update(updateData, { where: { id: userId } });

    await auditService.logVerificationCompleted(userId, 'phone', 'verified');

    return { success: true, message: 'Phone number verified successfully' };
  } catch (error) {
    logger.error('Verify phone failed:', error);
    throw error;
  }
}

/**
 * Normalize phone number to E.164 format
 */
function normalizePhoneNumber(phone) {
  // Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '');

  // Add country code if missing (assume US)
  if (cleaned.length === 10) {
    cleaned = '1' + cleaned;
  }

  return '+' + cleaned;
}

// ============================================
// ID Verification (Stripe Identity)
// ============================================

/**
 * Create Stripe Identity verification session
 */
async function createIdVerificationSession(userId) {
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.verification_status === 'id_verified') {
      throw new Error('ID already verified');
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('Stripe not configured');
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    // Create verification session
    const verificationSession = await stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: {
        user_id: userId,
      },
      options: {
        document: {
          allowed_types: ['driving_license', 'passport', 'id_card'],
          require_id_number: false,
          require_matching_selfie: true,
        },
      },
      return_url: `${process.env.APP_URL || 'https://ifound.app'}/verification/complete`,
    });

    // Store session ID
    await User.update(
      {
        verification_documents: {
          ...user.verification_documents,
          stripe_verification_session_id: verificationSession.id,
          verification_started_at: new Date().toISOString(),
        },
      },
      { where: { id: userId } }
    );

    await auditService.logVerificationStarted(userId, 'id_document');

    return {
      success: true,
      sessionId: verificationSession.id,
      url: verificationSession.url,
    };
  } catch (error) {
    logger.error('Create ID verification session failed:', error);
    throw error;
  }
}

/**
 * Handle Stripe Identity webhook
 */
async function handleIdVerificationWebhook(event) {
  try {
    const session = event.data.object;
    const userId = session.metadata?.user_id;

    if (!userId) {
      logger.warn('ID verification webhook missing user_id');
      return;
    }

    const user = await User.findByPk(userId);
    if (!user) {
      logger.warn(`ID verification webhook: user ${userId} not found`);
      return;
    }

    switch (event.type) {
      case 'identity.verification_session.verified':
        // Verification successful
        await User.update(
          {
            verification_status: 'id_verified',
            verification_documents: {
              ...user.verification_documents,
              id_verified: true,
              id_verified_at: new Date().toISOString(),
              stripe_verification_status: 'verified',
            },
          },
          { where: { id: userId } }
        );

        await auditService.logVerificationCompleted(userId, 'id_document', 'verified');

        await notificationService.sendNotification({
          userId,
          type: 'verification_update',
          title: 'ID Verified!',
          body: 'Your identity has been verified. You can now access all features.',
          priority: 'high',
          channels: ['push', 'email', 'inapp'],
        });
        break;

      case 'identity.verification_session.requires_input':
        // Additional input needed
        await User.update(
          {
            verification_documents: {
              ...user.verification_documents,
              stripe_verification_status: 'requires_input',
              last_error: session.last_error?.reason,
            },
          },
          { where: { id: userId } }
        );

        await notificationService.sendNotification({
          userId,
          type: 'verification_update',
          title: 'Verification Needs Attention',
          body: 'Your ID verification requires additional information. Please check and try again.',
          channels: ['push', 'email', 'inapp'],
        });
        break;

      case 'identity.verification_session.canceled':
        await User.update(
          {
            verification_documents: {
              ...user.verification_documents,
              stripe_verification_status: 'canceled',
            },
          },
          { where: { id: userId } }
        );

        await auditService.logVerificationFailed(userId, 'id_document', 'canceled');
        break;
    }
  } catch (error) {
    logger.error('Handle ID verification webhook failed:', error);
    throw error;
  }
}

/**
 * Check if user needs ID verification for an amount
 */
function requiresIdVerification(user, amount) {
  if (user.verification_status === 'id_verified') {
    return false;
  }
  return amount >= CONFIG.kycThreshold;
}

// ============================================
// Law Enforcement Verification
// ============================================

/**
 * Submit law enforcement verification request
 */
async function submitLawEnforcementVerification(userId, documents) {
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Store documents for manual review
    await User.update(
      {
        verification_documents: {
          ...user.verification_documents,
          le_verification_requested: true,
          le_verification_requested_at: new Date().toISOString(),
          le_documents: documents, // { badgeNumber, department, supervisorEmail, documentUrls }
          le_verification_status: 'pending_review',
        },
      },
      { where: { id: userId } }
    );

    await auditService.logVerificationStarted(userId, 'law_enforcement');

    // Notify admins
    // TODO: Send email to admin review queue

    return {
      success: true,
      message: 'Verification request submitted. An admin will review your documents.',
    };
  } catch (error) {
    logger.error('Submit LE verification failed:', error);
    throw error;
  }
}

/**
 * Admin: Approve law enforcement verification
 */
async function approveLawEnforcementVerification(adminId, userId, notes) {
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    await User.update(
      {
        user_type: 'law_enforcement',
        verification_status: 'law_enforcement_verified',
        verification_documents: {
          ...user.verification_documents,
          le_verification_status: 'approved',
          le_verified_at: new Date().toISOString(),
          le_verified_by: adminId,
          le_admin_notes: notes,
        },
      },
      { where: { id: userId } }
    );

    await auditService.logVerificationCompleted(userId, 'law_enforcement', 'approved');
    await auditService.logAdminAction(adminId, 'approve_le_verification', 'User', userId, { notes });

    await notificationService.sendNotification({
      userId,
      type: 'verification_update',
      title: 'Law Enforcement Verified!',
      body: 'Your law enforcement credentials have been verified. You now have access to additional features.',
      priority: 'high',
      channels: ['push', 'email', 'inapp'],
    });

    return { success: true };
  } catch (error) {
    logger.error('Approve LE verification failed:', error);
    throw error;
  }
}

/**
 * Admin: Reject law enforcement verification
 */
async function rejectLawEnforcementVerification(adminId, userId, reason) {
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    await User.update(
      {
        verification_documents: {
          ...user.verification_documents,
          le_verification_status: 'rejected',
          le_rejected_at: new Date().toISOString(),
          le_rejected_by: adminId,
          le_rejection_reason: reason,
        },
      },
      { where: { id: userId } }
    );

    await auditService.logVerificationFailed(userId, 'law_enforcement', reason);
    await auditService.logAdminAction(adminId, 'reject_le_verification', 'User', userId, { reason });

    await notificationService.sendNotification({
      userId,
      type: 'verification_update',
      title: 'Verification Not Approved',
      body: `Your law enforcement verification was not approved: ${reason}`,
      channels: ['push', 'email', 'inapp'],
    });

    return { success: true };
  } catch (error) {
    logger.error('Reject LE verification failed:', error);
    throw error;
  }
}

// ============================================
// Verification Status Helpers
// ============================================

/**
 * Get user's verification status summary
 */
async function getVerificationStatus(userId) {
  const user = await User.findByPk(userId, {
    attributes: ['id', 'email', 'phone_number', 'verification_status', 'verification_documents'],
  });

  if (!user) {
    throw new Error('User not found');
  }

  const docs = user.verification_documents || {};

  return {
    overall_status: user.verification_status,
    email: {
      verified: user.verification_status !== 'unverified',
      email: user.email,
    },
    phone: {
      verified: !!docs.phone_verified,
      phone_number: user.phone_number,
    },
    id_document: {
      verified: user.verification_status === 'id_verified',
      status: docs.stripe_verification_status || 'not_started',
    },
    law_enforcement: {
      verified: user.verification_status === 'law_enforcement_verified',
      status: docs.le_verification_status || 'not_started',
    },
    can_post_cases: user.verification_status !== 'unverified',
    can_receive_high_value_payouts: user.verification_status === 'id_verified',
    kyc_threshold: CONFIG.kycThreshold,
  };
}

/**
 * Check if user can perform an action based on verification level
 */
function canPerformAction(user, action) {
  const requirements = {
    post_case: ['email_verified', 'id_verified', 'law_enforcement_verified'],
    submit_claim: ['email_verified', 'id_verified', 'law_enforcement_verified'],
    receive_payout_low: ['email_verified', 'id_verified', 'law_enforcement_verified'],
    receive_payout_high: ['id_verified', 'law_enforcement_verified'],
    view_sensitive_cases: ['law_enforcement_verified'],
  };

  const allowedStatuses = requirements[action];
  if (!allowedStatuses) {
    return true; // Unknown action, allow by default
  }

  return allowedStatuses.includes(user.verification_status);
}

module.exports = {
  // Email verification
  sendEmailVerification,
  verifyEmail,

  // Phone verification
  sendPhoneVerification,
  verifyPhone,
  normalizePhoneNumber,

  // ID verification
  createIdVerificationSession,
  handleIdVerificationWebhook,
  requiresIdVerification,

  // Law enforcement verification
  submitLawEnforcementVerification,
  approveLawEnforcementVerification,
  rejectLawEnforcementVerification,

  // Helpers
  getVerificationStatus,
  canPerformAction,

  CONFIG,
};
