/**
 * Notification Service
 *
 * Unified notification service supporting:
 * - Push notifications (Firebase Cloud Messaging)
 * - Email notifications (Nodemailer)
 * - SMS notifications (Twilio)
 * - In-app notifications (Database)
 */

const nodemailer = require('nodemailer');
const { Notification, NotificationPreference, DeviceToken, User } = require('../models');
const logger = require('../config/logger');
const { Op } = require('sequelize');

class NotificationService {
  constructor() {
    this.transporter = null;
    this.fcmAdmin = null;
    this.twilioClient = null;
    this.initializeServices();
  }

  async initializeServices() {
    await this.initializeEmail();
    await this.initializeFCM();
    await this.initializeTwilio();
  }

  // ============================================
  // Email Service
  // ============================================

  async initializeEmail() {
    try {
      if (process.env.SMTP_HOST && process.env.SMTP_USER) {
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          },
        });
        logger.info('Email transporter initialized with SMTP');
      } else {
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
        logger.info(`Email using Ethereal test account: ${testAccount.user}`);
      }
    } catch (error) {
      logger.error('Failed to initialize email transporter:', error);
    }
  }

  // ============================================
  // Firebase Cloud Messaging
  // ============================================

  async initializeFCM() {
    try {
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // Dynamic import for firebase-admin
        const admin = require('firebase-admin');

        let serviceAccount;
        if (process.env.FIREBASE_SERVICE_ACCOUNT.startsWith('{')) {
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } else {
          serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT);
        }

        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          });
        }

        this.fcmAdmin = admin;
        logger.info('Firebase Cloud Messaging initialized');
      } else {
        logger.warn('Firebase not configured - push notifications disabled');
      }
    } catch (error) {
      logger.warn('Firebase initialization failed:', error.message);
    }
  }

  // ============================================
  // Twilio SMS
  // ============================================

  async initializeTwilio() {
    try {
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        const twilio = require('twilio');
        this.twilioClient = twilio(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );
        logger.info('Twilio SMS initialized');
      } else {
        logger.warn('Twilio not configured - SMS notifications disabled');
      }
    } catch (error) {
      logger.warn('Twilio initialization failed:', error.message);
    }
  }

  // ============================================
  // Core Notification Methods
  // ============================================

  /**
   * Send a notification through all appropriate channels
   */
  async sendNotification({
    userId,
    type,
    title,
    body,
    data = {},
    imageUrl = null,
    actionUrl = null,
    entityType = null,
    entityId = null,
    priority = 'normal',
    expiresAt = null,
    channels = ['push', 'inapp'], // Default channels
  }) {
    try {
      // Get user preferences
      const preferences = await this.getUserPreferences(userId);
      const user = await User.findByPk(userId);

      if (!user) {
        logger.warn(`Notification failed: User ${userId} not found`);
        return null;
      }

      // Check quiet hours
      if (this.isQuietHours(preferences)) {
        // Store for later delivery, don't send push/sms
        channels = channels.filter(c => c === 'inapp' || c === 'email');
      }

      // Create in-app notification record
      const notification = await Notification.create({
        user_id: userId,
        type,
        title,
        body,
        image_url: imageUrl,
        action_url: actionUrl,
        entity_type: entityType,
        entity_id: entityId,
        data,
        priority,
        expires_at: expiresAt,
      });

      // Send through each channel
      const results = {
        notification_id: notification.id,
        channels: {},
      };

      if (channels.includes('push') && this.shouldSendPush(preferences, type)) {
        results.channels.push = await this.sendPush(userId, { title, body, data, imageUrl });
        if (results.channels.push.success) {
          await notification.update({ push_sent: true, push_sent_at: new Date() });
        }
      }

      if (channels.includes('email') && this.shouldSendEmail(preferences, type)) {
        results.channels.email = await this.sendEmail({
          to: user.email,
          subject: title,
          html: this.generateEmailHtml(type, { title, body, data, actionUrl }),
          text: body,
        });
        if (results.channels.email.success) {
          await notification.update({ email_sent: true, email_sent_at: new Date() });
        }
      }

      if (channels.includes('sms') && this.shouldSendSMS(preferences, type) && user.phone) {
        results.channels.sms = await this.sendSMS(user.phone, body);
        if (results.channels.sms.success) {
          await notification.update({ sms_sent: true, sms_sent_at: new Date() });
        }
      }

      return results;
    } catch (error) {
      logger.error('Send notification failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send push notification via FCM
   */
  async sendPush(userId, { title, body, data = {}, imageUrl = null }) {
    if (!this.fcmAdmin) {
      return { success: false, error: 'FCM not configured' };
    }

    try {
      // Get user's active device tokens
      const tokens = await DeviceToken.findAll({
        where: {
          user_id: userId,
          is_active: true,
        },
      });

      if (tokens.length === 0) {
        return { success: false, error: 'No active devices' };
      }

      const message = {
        notification: {
          title,
          body,
          ...(imageUrl && { imageUrl }),
        },
        data: {
          ...data,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'ifound_notifications',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const results = await Promise.all(
        tokens.map(async (deviceToken) => {
          try {
            await this.fcmAdmin.messaging().send({
              ...message,
              token: deviceToken.token,
            });

            await deviceToken.update({
              last_used_at: new Date(),
              failed_count: 0,
            });

            return { token: deviceToken.id, success: true };
          } catch (error) {
            // Handle invalid tokens
            if (
              error.code === 'messaging/invalid-registration-token' ||
              error.code === 'messaging/registration-token-not-registered'
            ) {
              await deviceToken.update({ is_active: false });
            } else {
              await deviceToken.increment('failed_count');
              // Deactivate after 5 failures
              if (deviceToken.failed_count >= 5) {
                await deviceToken.update({ is_active: false });
              }
            }
            return { token: deviceToken.id, success: false, error: error.message };
          }
        })
      );

      const successCount = results.filter(r => r.success).length;
      return {
        success: successCount > 0,
        sent: successCount,
        failed: results.length - successCount,
        results,
      };
    } catch (error) {
      logger.error('FCM send failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send email notification
   */
  async sendEmail({ to, subject, html, text }) {
    if (!this.transporter) {
      await this.initializeEmail();
    }

    try {
      const info = await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || '"I Found!!" <noreply@ifound.app>',
        to,
        subject,
        text,
        html,
      });

      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        logger.info(`Email preview: ${previewUrl}`);
      }

      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error('Email send failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send SMS notification
   */
  async sendSMS(phoneNumber, message) {
    if (!this.twilioClient) {
      return { success: false, error: 'Twilio not configured' };
    }

    try {
      const result = await this.twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber,
      });

      return { success: true, sid: result.sid };
    } catch (error) {
      logger.error('SMS send failed:', error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // Preference Helpers
  // ============================================

  async getUserPreferences(userId) {
    let preferences = await NotificationPreference.findOne({
      where: { user_id: userId },
    });

    if (!preferences) {
      // Create default preferences
      preferences = await NotificationPreference.create({ user_id: userId });
    }

    return preferences;
  }

  shouldSendPush(preferences, type) {
    if (!preferences.push_enabled) return false;

    const typeMap = {
      nearby_case: preferences.push_nearby_cases,
      claim_received: preferences.push_claim_updates,
      claim_approved: preferences.push_claim_updates,
      claim_rejected: preferences.push_claim_updates,
      payment_received: preferences.push_payment_updates,
      payment_sent: preferences.push_payment_updates,
      new_message: preferences.push_messages,
      match_found: preferences.push_matches,
    };

    return typeMap[type] !== false;
  }

  shouldSendEmail(preferences, type) {
    if (!preferences.email_enabled) return false;

    const typeMap = {
      nearby_case: preferences.email_nearby_cases,
      claim_received: preferences.email_claim_updates,
      claim_approved: preferences.email_claim_updates,
      claim_rejected: preferences.email_claim_updates,
      payment_received: preferences.email_payment_updates,
      payment_sent: preferences.email_payment_updates,
      new_message: preferences.email_messages,
    };

    return typeMap[type] !== false;
  }

  shouldSendSMS(preferences, type) {
    if (!preferences.sms_enabled) return false;
    if (preferences.sms_urgent_only) {
      return ['payment_received', 'claim_approved'].includes(type);
    }
    return preferences.sms_payment_updates && type.includes('payment');
  }

  isQuietHours(preferences) {
    if (!preferences.quiet_hours_enabled) return false;

    const now = new Date();
    const userTime = new Date(now.toLocaleString('en-US', { timeZone: preferences.timezone }));
    const currentTime = userTime.getHours() * 100 + userTime.getMinutes();

    const startParts = preferences.quiet_hours_start.split(':');
    const endParts = preferences.quiet_hours_end.split(':');
    const startTime = parseInt(startParts[0]) * 100 + parseInt(startParts[1]);
    const endTime = parseInt(endParts[0]) * 100 + parseInt(endParts[1]);

    if (startTime > endTime) {
      // Quiet hours span midnight
      return currentTime >= startTime || currentTime < endTime;
    }
    return currentTime >= startTime && currentTime < endTime;
  }

  // ============================================
  // Email Templates
  // ============================================

  generateEmailHtml(type, { title, body, data, actionUrl }) {
    const baseUrl = process.env.APP_URL || 'https://ifound.app';
    const buttonUrl = actionUrl || baseUrl;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">I Found!!</h1>
        </div>
        <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">${title}</h2>
          <p style="color: #666; font-size: 16px;">${body}</p>
          ${actionUrl ? `
            <div style="text-align: center; margin-top: 30px;">
              <a href="${buttonUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">
                View Details
              </a>
            </div>
          ` : ''}
        </div>
        <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
          <p>You received this email because you have notifications enabled for I Found!!</p>
          <p><a href="${baseUrl}/settings/notifications" style="color: #667eea;">Manage notification preferences</a></p>
        </div>
      </body>
      </html>
    `;
  }

  // ============================================
  // Specific Notification Types
  // ============================================

  async notifyNearbyCases(userId, cases) {
    for (const caseData of cases) {
      await this.sendNotification({
        userId,
        type: 'nearby_case',
        title: 'New Case Near You!',
        body: `${caseData.title} - $${caseData.bounty_amount} bounty`,
        data: { caseId: caseData.id },
        actionUrl: `ifound://case/${caseData.id}`,
        entityType: 'Case',
        entityId: caseData.id,
      });
    }
  }

  async notifyClaimReceived(posterId, claim, caseData) {
    return this.sendNotification({
      userId: posterId,
      type: 'claim_received',
      title: 'New Claim Received!',
      body: `Someone found your item: ${caseData.title}`,
      data: { claimId: claim.id, caseId: caseData.id },
      actionUrl: `ifound://claim/${claim.id}`,
      entityType: 'Claim',
      entityId: claim.id,
      priority: 'high',
      channels: ['push', 'email', 'inapp'],
    });
  }

  async notifyClaimApproved(finderId, claim, bountyAmount) {
    return this.sendNotification({
      userId: finderId,
      type: 'claim_approved',
      title: 'Claim Approved!',
      body: `Your claim was approved! You earned $${bountyAmount}`,
      data: { claimId: claim.id },
      actionUrl: `ifound://claim/${claim.id}`,
      entityType: 'Claim',
      entityId: claim.id,
      priority: 'high',
      channels: ['push', 'email', 'sms', 'inapp'],
    });
  }

  async notifyClaimRejected(finderId, claim, reason) {
    return this.sendNotification({
      userId: finderId,
      type: 'claim_rejected',
      title: 'Claim Not Approved',
      body: reason || 'Your claim was not approved. Please review the details.',
      data: { claimId: claim.id },
      actionUrl: `ifound://claim/${claim.id}`,
      entityType: 'Claim',
      entityId: claim.id,
      channels: ['push', 'email', 'inapp'],
    });
  }

  async notifyPaymentReceived(userId, amount, transactionId) {
    return this.sendNotification({
      userId,
      type: 'payment_received',
      title: 'Payment Received!',
      body: `$${amount} has been added to your account`,
      data: { transactionId, amount },
      actionUrl: `ifound://wallet`,
      entityType: 'Transaction',
      entityId: transactionId,
      priority: 'high',
      channels: ['push', 'email', 'sms', 'inapp'],
    });
  }

  async notifyNewMessage(userId, senderId, senderName, preview, claimId) {
    return this.sendNotification({
      userId,
      type: 'new_message',
      title: `Message from ${senderName}`,
      body: preview.length > 100 ? preview.substring(0, 97) + '...' : preview,
      data: { claimId, senderId },
      actionUrl: `ifound://chat/${claimId}`,
      entityType: 'Claim',
      entityId: claimId,
      channels: ['push', 'inapp'],
    });
  }

  async notifyMatchFound(userId, matchId, sourceCase, targetCase, confidence) {
    return this.sendNotification({
      userId,
      type: 'match_found',
      title: 'Potential Match Found!',
      body: `We found a ${Math.round(confidence)}% match for "${sourceCase.title}"`,
      data: { matchId, sourceCaseId: sourceCase.id, targetCaseId: targetCase.id },
      actionUrl: `ifound://match/${matchId}`,
      entityType: 'PhotoMatch',
      entityId: matchId,
      priority: 'high',
      channels: ['push', 'email', 'inapp'],
    });
  }

  async notifyCaseExpiring(userId, caseData, daysLeft) {
    return this.sendNotification({
      userId,
      type: 'case_expiring',
      title: 'Case Expiring Soon',
      body: `Your case "${caseData.title}" expires in ${daysLeft} days`,
      data: { caseId: caseData.id, daysLeft },
      actionUrl: `ifound://case/${caseData.id}`,
      entityType: 'Case',
      entityId: caseData.id,
      channels: ['push', 'email', 'inapp'],
    });
  }

  // ============================================
  // Bulk Operations
  // ============================================

  /**
   * Send notification to multiple users
   */
  async sendBulkNotification(userIds, notificationData) {
    const results = await Promise.allSettled(
      userIds.map(userId => this.sendNotification({ userId, ...notificationData }))
    );

    return {
      total: userIds.length,
      success: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
    };
  }

  /**
   * Get unread notification count for user
   */
  async getUnreadCount(userId) {
    return Notification.count({
      where: {
        user_id: userId,
        is_read: false,
        [Op.or]: [
          { expires_at: null },
          { expires_at: { [Op.gt]: new Date() } },
        ],
      },
    });
  }

  /**
   * Mark notifications as read
   */
  async markAsRead(userId, notificationIds = null) {
    const where = { user_id: userId };
    if (notificationIds) {
      where.id = notificationIds;
    }

    return Notification.update(
      { is_read: true, read_at: new Date() },
      { where }
    );
  }

  /**
   * Get user notifications with pagination
   */
  async getUserNotifications(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
    const where = {
      user_id: userId,
      [Op.or]: [
        { expires_at: null },
        { expires_at: { [Op.gt]: new Date() } },
      ],
    };

    if (unreadOnly) {
      where.is_read = false;
    }

    return Notification.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
  }

  // ============================================
  // Device Token Management
  // ============================================

  async registerDeviceToken(userId, { token, deviceType, deviceName, deviceModel, osVersion, appVersion }) {
    // Check if token already exists
    const existing = await DeviceToken.findOne({ where: { token } });

    if (existing) {
      // Update existing token
      await existing.update({
        user_id: userId,
        device_type: deviceType,
        device_name: deviceName,
        device_model: deviceModel,
        os_version: osVersion,
        app_version: appVersion,
        is_active: true,
        failed_count: 0,
      });
      return existing;
    }

    // Create new token
    return DeviceToken.create({
      user_id: userId,
      token,
      device_type: deviceType,
      device_name: deviceName,
      device_model: deviceModel,
      os_version: osVersion,
      app_version: appVersion,
    });
  }

  async unregisterDeviceToken(token) {
    return DeviceToken.update(
      { is_active: false },
      { where: { token } }
    );
  }

  async updateDeviceLocation(token, latitude, longitude) {
    return DeviceToken.update(
      {
        last_latitude: latitude,
        last_longitude: longitude,
        last_location_update: new Date(),
      },
      { where: { token, is_active: true } }
    );
  }
}

module.exports = new NotificationService();
