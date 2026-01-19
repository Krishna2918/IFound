/**
 * Geofence Service
 *
 * Handles location-based alerts for nearby cases.
 * When a user enters an area with active cases, they receive notifications.
 */

const { Case, User, DeviceToken, NotificationPreference } = require('../models');
const notificationService = require('./notificationService');
const { calculateDistance } = require('../utils/geoUtils');
const logger = require('../config/logger');
const { Op } = require('sequelize');

// Configuration
const CONFIG = {
  // Default radius in kilometers
  defaultRadiusKm: 10,

  // Maximum alerts per user per day
  maxAlertsPerDay: 10,

  // Minimum time between alerts for same case (hours)
  minAlertIntervalHours: 24,

  // Batch size for processing
  batchSize: 100,

  // Case freshness (don't alert for old cases)
  maxCaseAgeDays: 30,
};

// In-memory cache for alert tracking (use Redis in production)
const alertCache = new Map();

/**
 * Calculate haversine distance between two points
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Get cases near a location
 */
async function getCasesNearLocation(latitude, longitude, radiusKm = CONFIG.defaultRadiusKm) {
  // Calculate bounding box for initial filter
  const latDelta = radiusKm / 111; // 1 degree latitude ≈ 111 km
  const lonDelta = radiusKm / (111 * Math.cos(toRad(latitude)));

  const minAge = new Date();
  minAge.setDate(minAge.getDate() - CONFIG.maxCaseAgeDays);

  const cases = await Case.findAll({
    where: {
      status: 'active',
      latitude: {
        [Op.between]: [latitude - latDelta, latitude + latDelta],
      },
      longitude: {
        [Op.between]: [longitude - lonDelta, longitude + lonDelta],
      },
      createdAt: {
        [Op.gte]: minAge,
      },
    },
    include: [
      {
        model: User,
        as: 'poster',
        attributes: ['id', 'first_name', 'last_name'],
      },
    ],
    order: [['bounty_amount', 'DESC']],
    limit: 50,
  });

  // Filter by exact distance
  return cases.filter(c => {
    const distance = haversineDistance(latitude, longitude, c.latitude, c.longitude);
    c.distance = distance;
    return distance <= radiusKm;
  }).sort((a, b) => a.distance - b.distance);
}

/**
 * Check if user should receive alert for case
 */
function shouldAlertUser(userId, caseId) {
  const cacheKey = `${userId}:${caseId}`;
  const lastAlert = alertCache.get(cacheKey);

  if (lastAlert) {
    const hoursSinceAlert = (Date.now() - lastAlert) / (1000 * 60 * 60);
    if (hoursSinceAlert < CONFIG.minAlertIntervalHours) {
      return false;
    }
  }

  // Check daily limit
  const dailyKey = `${userId}:daily:${new Date().toDateString()}`;
  const dailyCount = alertCache.get(dailyKey) || 0;

  if (dailyCount >= CONFIG.maxAlertsPerDay) {
    return false;
  }

  return true;
}

/**
 * Record that an alert was sent
 */
function recordAlert(userId, caseId) {
  const cacheKey = `${userId}:${caseId}`;
  alertCache.set(cacheKey, Date.now());

  const dailyKey = `${userId}:daily:${new Date().toDateString()}`;
  const dailyCount = alertCache.get(dailyKey) || 0;
  alertCache.set(dailyKey, dailyCount + 1);
}

/**
 * Process location update and send alerts if needed
 */
async function processLocationUpdate(userId, latitude, longitude, deviceToken = null) {
  try {
    // Get user preferences
    const preferences = await notificationService.getUserPreferences(userId);

    if (!preferences.location_alerts_enabled) {
      return { alertsSent: 0, reason: 'alerts_disabled' };
    }

    // Check if user is in quiet hours
    if (notificationService.isQuietHours(preferences)) {
      return { alertsSent: 0, reason: 'quiet_hours' };
    }

    // Get nearby cases
    const radiusKm = preferences.location_alert_radius_km || CONFIG.defaultRadiusKm;
    const nearbyCases = await getCasesNearLocation(latitude, longitude, radiusKm);

    // Filter by subscribed categories
    const subscribedCategories = preferences.subscribed_categories || ['lost_item', 'found_item', 'lost_pet'];
    const relevantCases = nearbyCases.filter(c =>
      subscribedCategories.includes(c.category) || subscribedCategories.includes(c.case_type)
    );

    // Filter cases the user hasn't been alerted about recently
    const casesToAlert = relevantCases.filter(c =>
      shouldAlertUser(userId, c.id) && c.poster_id !== userId
    );

    if (casesToAlert.length === 0) {
      return { alertsSent: 0, reason: 'no_new_cases' };
    }

    // Send notifications (limit to top 3)
    const topCases = casesToAlert.slice(0, 3);
    let alertsSent = 0;

    for (const caseData of topCases) {
      try {
        await notificationService.sendNotification({
          userId,
          type: 'nearby_case',
          title: `${caseData.case_type === 'lost_item' ? 'Lost Item' : 'Found Item'} Near You`,
          body: `${caseData.title} - $${caseData.bounty_amount} bounty (${caseData.distance.toFixed(1)} km away)`,
          data: {
            caseId: caseData.id,
            distance: caseData.distance,
            bounty: caseData.bounty_amount,
          },
          actionUrl: `ifound://case/${caseData.id}`,
          entityType: 'Case',
          entityId: caseData.id,
        });

        recordAlert(userId, caseData.id);
        alertsSent++;
      } catch (error) {
        logger.error(`Failed to send geofence alert for case ${caseData.id}:`, error);
      }
    }

    // Update device location if token provided
    if (deviceToken) {
      await notificationService.updateDeviceLocation(deviceToken, latitude, longitude);
    }

    return {
      alertsSent,
      casesNearby: relevantCases.length,
      radius: radiusKm,
    };
  } catch (error) {
    logger.error('Process location update failed:', error);
    return { alertsSent: 0, error: error.message };
  }
}

/**
 * Process batch location updates (for background job)
 */
async function processBatchLocationUpdates() {
  try {
    // Get all active device tokens with recent location updates
    const recentCutoff = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago

    const devices = await DeviceToken.findAll({
      where: {
        is_active: true,
        last_latitude: { [Op.ne]: null },
        last_longitude: { [Op.ne]: null },
        last_location_update: { [Op.gte]: recentCutoff },
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id'],
        },
      ],
      limit: CONFIG.batchSize,
    });

    logger.info(`Processing ${devices.length} device location updates`);

    const results = {
      processed: 0,
      alertsSent: 0,
      errors: 0,
    };

    for (const device of devices) {
      try {
        const result = await processLocationUpdate(
          device.user_id,
          device.last_latitude,
          device.last_longitude
        );

        results.processed++;
        results.alertsSent += result.alertsSent || 0;
      } catch (error) {
        results.errors++;
        logger.error(`Batch location update error for device ${device.id}:`, error);
      }
    }

    return results;
  } catch (error) {
    logger.error('Batch location update failed:', error);
    throw error;
  }
}

/**
 * Create geofence subscription for a location
 */
async function createLocationSubscription(userId, { latitude, longitude, radiusKm, name, categories }) {
  // This could be stored in a LocationSubscription model
  // For now, we'll update the user's preferences
  const preferences = await notificationService.getUserPreferences(userId);

  await preferences.update({
    location_alerts_enabled: true,
    location_alert_radius_km: radiusKm || CONFIG.defaultRadiusKm,
    subscribed_categories: categories || ['lost_item', 'found_item', 'lost_pet'],
  });

  return {
    success: true,
    subscription: {
      latitude,
      longitude,
      radiusKm: radiusKm || CONFIG.defaultRadiusKm,
      categories: categories || ['lost_item', 'found_item', 'lost_pet'],
    },
  };
}

/**
 * Get cases within a geographic bounding box (for map display)
 */
async function getCasesInBounds(northEast, southWest, options = {}) {
  const { limit = 100, categories, status = 'active' } = options;

  const where = {
    status,
    latitude: {
      [Op.between]: [southWest.lat, northEast.lat],
    },
    longitude: {
      [Op.between]: [southWest.lng, northEast.lng],
    },
  };

  if (categories && categories.length > 0) {
    where[Op.or] = [
      { category: { [Op.in]: categories } },
      { case_type: { [Op.in]: categories } },
    ];
  }

  return Case.findAll({
    where,
    attributes: ['id', 'title', 'case_type', 'category', 'bounty_amount', 'latitude', 'longitude', 'priority_level', 'createdAt'],
    order: [['bounty_amount', 'DESC']],
    limit,
  });
}

/**
 * Get nearby users for a case (for alerting when case is created)
 */
async function getNearbyUsersForCase(caseId) {
  const caseData = await Case.findByPk(caseId);
  if (!caseData || !caseData.latitude || !caseData.longitude) {
    return [];
  }

  // Get all active device tokens
  const devices = await DeviceToken.findAll({
    where: {
      is_active: true,
      last_latitude: { [Op.ne]: null },
      last_longitude: { [Op.ne]: null },
    },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id'],
        include: [
          {
            model: NotificationPreference,
            as: 'notificationPreferences',
          },
        ],
      },
    ],
  });

  // Filter by distance and preferences
  const nearbyUsers = [];

  for (const device of devices) {
    if (device.user_id === caseData.poster_id) continue; // Don't alert the poster

    const preferences = device.user?.notificationPreferences;
    if (!preferences?.location_alerts_enabled) continue;

    const radiusKm = preferences.location_alert_radius_km || CONFIG.defaultRadiusKm;
    const distance = haversineDistance(
      device.last_latitude,
      device.last_longitude,
      caseData.latitude,
      caseData.longitude
    );

    if (distance <= radiusKm) {
      nearbyUsers.push({
        userId: device.user_id,
        distance,
        deviceId: device.id,
      });
    }
  }

  return nearbyUsers;
}

/**
 * Alert nearby users when a new case is created
 */
async function alertNearbyUsersForNewCase(caseId) {
  try {
    const caseData = await Case.findByPk(caseId);
    if (!caseData) {
      return { error: 'Case not found' };
    }

    const nearbyUsers = await getNearbyUsersForCase(caseId);
    let alertsSent = 0;

    for (const { userId, distance } of nearbyUsers) {
      if (!shouldAlertUser(userId, caseId)) continue;

      try {
        await notificationService.sendNotification({
          userId,
          type: 'nearby_case',
          title: 'New Case Posted Near You!',
          body: `${caseData.title} - $${caseData.bounty_amount} bounty (${distance.toFixed(1)} km away)`,
          data: {
            caseId: caseData.id,
            distance,
            bounty: caseData.bounty_amount,
          },
          actionUrl: `ifound://case/${caseData.id}`,
          entityType: 'Case',
          entityId: caseData.id,
          priority: caseData.priority_level === 'urgent' ? 'high' : 'normal',
        });

        recordAlert(userId, caseId);
        alertsSent++;
      } catch (error) {
        logger.error(`Failed to alert user ${userId} for case ${caseId}:`, error);
      }
    }

    logger.info(`Alerted ${alertsSent}/${nearbyUsers.length} nearby users for case ${caseId}`);

    return {
      caseId,
      nearbyUsersFound: nearbyUsers.length,
      alertsSent,
    };
  } catch (error) {
    logger.error('Alert nearby users failed:', error);
    return { error: error.message };
  }
}

/**
 * Clean up old cache entries (call periodically)
 */
function cleanupCache() {
  const now = Date.now();
  const maxAge = CONFIG.minAlertIntervalHours * 60 * 60 * 1000;

  for (const [key, timestamp] of alertCache.entries()) {
    if (key.includes(':daily:')) {
      // Daily keys expire at midnight
      const keyDate = key.split(':daily:')[1];
      if (new Date(keyDate).toDateString() !== new Date().toDateString()) {
        alertCache.delete(key);
      }
    } else if (now - timestamp > maxAge) {
      alertCache.delete(key);
    }
  }
}

// Run cleanup every hour
setInterval(cleanupCache, 60 * 60 * 1000);

module.exports = {
  processLocationUpdate,
  processBatchLocationUpdates,
  getCasesNearLocation,
  getCasesInBounds,
  createLocationSubscription,
  getNearbyUsersForCase,
  alertNearbyUsersForNewCase,
  haversineDistance,
  CONFIG,
};
