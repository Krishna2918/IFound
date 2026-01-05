/**
 * Notification Routes
 *
 * API endpoints for notifications, device registration, and location alerts.
 */

const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/notificationController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// Notifications
router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.post('/mark-read', markAsRead);
router.post('/mark-all-read', markAllAsRead);

// Preferences
router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);

// Device Management
router.post('/devices/register', registerDevice);
router.post('/devices/unregister', unregisterDevice);

// Location & Geofencing
router.post('/location', updateLocation);
router.get('/nearby', getNearbyCases);
router.get('/map/cases', getCasesInBounds);
router.post('/location/subscribe', subscribeToLocation);

module.exports = router;
