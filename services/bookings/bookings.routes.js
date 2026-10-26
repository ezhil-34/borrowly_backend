const express = require('express');
const router = express.Router();
const bookingsController = require('./bookings.controller');
const { asyncHandler } = require('../../common/middleware/error.middleware');
const { requireAuth } = require('../../common/middleware/auth.middleware');

// Public price quote calculator
router.post('/quote', asyncHandler(bookingsController.getQuote));

// Authenticated booking endpoints
router.post('/bookings', requireAuth, asyncHandler(bookingsController.createBooking));
router.get('/bookings', requireAuth, asyncHandler(bookingsController.getBookings));
router.post('/bookings/:id/review', requireAuth, asyncHandler(bookingsController.submitReview));
router.post('/bookings/:id/:action', requireAuth, asyncHandler(bookingsController.performAction));

module.exports = router;
