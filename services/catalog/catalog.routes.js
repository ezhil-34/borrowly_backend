const express = require('express');
const router = express.Router();
const catalogController = require('./catalog.controller');
const { asyncHandler } = require('../../common/middleware/error.middleware');
const { requireAuth } = require('../../common/middleware/auth.middleware');

// Public catalog and discovery
router.get('/items', asyncHandler(catalogController.getItems));
router.post('/recommendations', asyncHandler(catalogController.getRecommendations));
router.get('/items/:id', asyncHandler(catalogController.getItem));

// ML Serving & MLOps Monitoring
router.post('/predict-price', asyncHandler(catalogController.predictPrice));
router.get('/mlops/stats', asyncHandler(catalogController.getMLOpsStats));

// Authenticated item management
router.post('/items', requireAuth, asyncHandler(catalogController.createItem));
router.patch('/items/:id', requireAuth, asyncHandler(catalogController.updateItem));
router.delete('/items/:id', requireAuth, asyncHandler(catalogController.deleteItem));
router.get('/my/items', requireAuth, asyncHandler(catalogController.getMyItems));

// Saved / Bookmarked items
router.get('/saved', requireAuth, asyncHandler(catalogController.getSaved));
router.post('/saved/:id', requireAuth, asyncHandler(catalogController.toggleSaved));

module.exports = router;
