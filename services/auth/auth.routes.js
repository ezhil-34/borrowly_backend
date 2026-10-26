const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { asyncHandler } = require('../../common/middleware/error.middleware');
const { requireAuth } = require('../../common/middleware/auth.middleware');

// Public auth endpoints
router.post('/auth/signup', asyncHandler(authController.signup));
router.post('/auth/login', asyncHandler(authController.login));
router.post('/auth/reset', asyncHandler(authController.resetPassword));
router.post('/auth/reset/confirm', asyncHandler(authController.confirmReset));

// Protected profile endpoints
router.get('/me', requireAuth, asyncHandler(authController.getMe));
router.patch('/me', requireAuth, asyncHandler(authController.updateMe));

module.exports = router;
