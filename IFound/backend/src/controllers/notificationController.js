/**
 * Notification Controller
 *
 * Handles notification-related API endpoints.
 */

const notificationService = require('../services/notificationService');
const geofenceService = require('../services/geofenceService');
const { NotificationPreference } = require('../models');
const logger = require('../config/logger');

/**
 * Get user notifications
 */
async function getNotifications(req, res) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, unread_only = false } = req.query;

    const result = await notificationService.getUserNotifications(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unread_only === 'true',
    });

    const unreadCount = await notificationService.getUnreadCount(userId);

    res.json({
      success: true,
      data: {
        notifications: result.rows,
        unreadCount,
        pagination: {
          total: result.count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(result.count / limit),
        },
      },
    });
  } catch (error) {
    logger.error('Get notifications failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
    });
  }
}

/**
 * Get unread notification count
 */
async function getUnreadCount(req, res) {
  try {
    const userId = req.user.id;
    const count = await notificationService.getUnreadCount(userId);

    res.json({
      success: true,
      data: { unreadCount: count },
    });
  } catch (error) {
    logger.error('Get unread count failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unread count',
    });
  }
}

/**
 * Mark notifications as read
 */
async function markAsRead(req, res) {
  try {
    const userId = req.user.id;
    const { notification_ids } = req.body;

    await notificationService.markAsRead(userId, notification_ids);

    res.json({
      success: true,
      message: 'Notifications marked as read',
    });
  } catch (error) {
    logger.error('Mark as read failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notifications as read',
    });
  }
}

/**
 * Mark all notifications as read
 */
async function markAllAsRead(req, res) {
  try {
    const userId = req.user.id;
    await notificationService.markAsRead(userId);

    res.json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    logger.error('Mark all as read failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read',
    });
  }
}

/**
 * Get notification preferences
 */
async function getPreferences(req, res) {
  try {
    const userId = req.user.id;
    const preferences = await notificationService.getUserPreferences(userId);

    res.json({
      success: true,
      data: { preferences },
    });
  } catch (error) {
    logger.error('Get preferences failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch preferences',
    });
  }
}

/**
 * Update notification preferences
 */
async function updatePreferences(req, res) {
  try {
    const userId = req.user.id;
    const updates = req.body;

    // Validate allowed fields
    const allowedFields = [
      'push_enabled',
      'push_nearby_cases',
      'push_claim_updates',
      'push_payment_updates',
      'push_messages',
      'push_matches',
      'email_enabled',
      'email_nearby_cases',
      'email_claim_updates',
      'email_payment_updates',
      'email_messages',
      'email_weekly_digest',
      'sms_enabled',
      'sms_payment_updates',
      'sms_urgent_only',
      'quiet_hours_enabled',
      'quiet_hours_start',
      'quiet_hours_end',
      'timezone',
      'location_alerts_enabled',
      'location_alert_radius_km',
      'max_alerts_per_day',
      'subscribed_categories',
    ];

    const filteredUpdates = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }

    let preferences = await NotificationPreference.findOne({
      where: { user_id: userId },
    });

    if (preferences) {
      await preferences.update(filteredUpdates);
    } else {
      preferences = await NotificationPreference.create({
        user_id: userId,
        ...filteredUpdates,
      });
    }

    res.json({
      success: true,
      message: 'Preferences updated',
      data: { preferences },
    });
  } catch (error) {
    logger.error('Update preferences failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update preferences',
    });
  }
}

/**
 * Register device token for push notifications
 */
async function registerDevice(req, res) {
  try {
    const userId = req.user.id;
    const { token, device_type, device_name, device_model, os_version, app_version } = req.body;

    if (!token || !device_type) {
      return res.status(400).json({
        success: false,
        error: 'Token and device_type are required',
      });
    }

    const validTypes = ['ios', 'android', 'web'];
    if (!validTypes.includes(device_type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid device_type. Must be ios, android, or web',
      });
    }

    const device = await notificationService.registerDeviceToken(userId, {
      token,
      deviceType: device_type,
      deviceName: device_name,
      deviceModel: device_model,
      osVersion: os_version,
      appVersion: app_version,
    });

    res.json({
      success: true,
      message: 'Device registered',
      data: { deviceId: device.id },
    });
  } catch (error) {
    logger.error('Register device failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register device',
    });
  }
}

/**
 * Unregister device token
 */
async function unregisterDevice(req, res) {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required',
      });
    }

    await notificationService.unregisterDeviceToken(token);

    res.json({
      success: true,
      message: 'Device unregistered',
    });
  } catch (error) {
    logger.error('Unregister device failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unregister device',
    });
  }
}

/**
 * Update device location
 */
async function updateLocation(req, res) {
  try {
    const userId = req.user.id;
    const { latitude, longitude, token } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required',
      });
    }

    // Update device location if token provided
    if (token) {
      await notificationService.updateDeviceLocation(token, latitude, longitude);
    }

    // Process location for nearby case alerts
    const result = await geofenceService.processLocationUpdate(userId, latitude, longitude, token);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Update location failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update location',
    });
  }
}

/**
 * Get nearby cases
 */
async function getNearbyCases(req, res) {
  try {
    const { latitude, longitude, radius_km = 10 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required',
      });
    }

    const cases = await geofenceService.getCasesNearLocation(
      parseFloat(latitude),
      parseFloat(longitude),
      parseFloat(radius_km)
    );

    res.json({
      success: true,
      data: {
        cases,
        count: cases.length,
        radius_km: parseFloat(radius_km),
      },
    });
  } catch (error) {
    logger.error('Get nearby cases failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch nearby cases',
    });
  }
}

/**
 * Get cases in map bounds
 */
async function getCasesInBounds(req, res) {
  try {
    const { ne_lat, ne_lng, sw_lat, sw_lng, categories, limit = 100 } = req.query;

    if (!ne_lat || !ne_lng || !sw_lat || !sw_lng) {
      return res.status(400).json({
        success: false,
        error: 'Map bounds are required (ne_lat, ne_lng, sw_lat, sw_lng)',
      });
    }

    const cases = await geofenceService.getCasesInBounds(
      { lat: parseFloat(ne_lat), lng: parseFloat(ne_lng) },
      { lat: parseFloat(sw_lat), lng: parseFloat(sw_lng) },
      {
        categories: categories ? categories.split(',') : undefined,
        limit: parseInt(limit),
      }
    );

    res.json({
      success: true,
      data: { cases },
    });
  } catch (error) {
    logger.error('Get cases in bounds failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cases in bounds',
    });
  }
}

/**
 * Subscribe to location alerts
 */
async function subscribeToLocation(req, res) {
  try {
    const userId = req.user.id;
    const { latitude, longitude, radius_km, name, categories } = req.body;

    const result = await geofenceService.createLocationSubscription(userId, {
      latitude,
      longitude,
      radiusKm: radius_km,
      name,
      categories,
    });

    res.json({
      success: true,
      message: 'Subscribed to location alerts',
      data: result.subscription,
    });
  } catch (error) {
    logger.error('Subscribe to location failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to subscribe to location alerts',
    });
  }
}

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  getPreferences,
  updatePreferences,
  registerDevice,
  unregisterDevice,
  updateLocation,
  getNearbyCases,
  getCasesInBounds,
  subscribeToLocation,
};
