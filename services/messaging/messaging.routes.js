const express = require('express');
const router = express.Router();
const messagingController = require('./messaging.controller');
const { asyncHandler } = require('../../common/middleware/error.middleware');
const { requireAuth } = require('../../common/middleware/auth.middleware');

// Booking-based chat messages
router.get('/chat/:id', requireAuth, asyncHandler(messagingController.getChat));
router.post('/chat/:id', requireAuth, asyncHandler(messagingController.sendMessage));

// In-app notifications
router.get('/notifications', requireAuth, asyncHandler(messagingController.getNotifications));
router.post('/notifications/read', requireAuth, asyncHandler(messagingController.markNotificationsRead));

// Reports and safety disputes
router.post('/reports', requireAuth, asyncHandler(messagingController.submitReport));

module.exports = router;
