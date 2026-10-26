const catalogService = require('./catalog.service');
const { db } = require('../../common/utils');

async function getItems(req, res) {
  // Store search query in user's search history sub-collection
  if (req.query.q && req.user) {
    await db
      .collection('users')
      .doc(req.user.id)
      .collection('searches')
      .add({ q: req.query.q, at: new Date().toISOString() });
  }
  const result = await catalogService.discover(req.query, req.user);
  res.json(result);
}

async function getRecommendations(req, res) {
  const result = await catalogService.discover(req.body || {}, req.user);
  res.json({
    ...result,
    items: result.items.slice(0, 12).map(({ id, title, score, reasons, components }) => ({
      id,
      title,
      score,
      reasons,
      components
    })),
    full: result.items.slice(0, 12)
  });
}

async function getItem(req, res) {
  const context = {
    lat: req.query.lat != null ? Number(req.query.lat) : null,
    lng: req.query.lng != null ? Number(req.query.lng) : null
  };
  const result = await catalogService.getItemDetails(req.params.id, context, req.user);
  res.json(result);
}

async function createItem(req, res) {
  const result = await catalogService.createItem(req.body, req.user);
  res.status(201).json(result);
}

async function updateItem(req, res) {
  const result = await catalogService.updateItem(req.params.id, req.body, req.user);
  res.json(result);
}

async function deleteItem(req, res) {
  const result = await catalogService.deleteItem(req.params.id, req.user);
  res.json(result);
}

async function getMyItems(req, res) {
  const items = await catalogService.getMyItems(req.user.id);
  res.json({ items });
}

async function getSaved(req, res) {
  const ids = await catalogService.getSavedItemIds(req.user.id);
  res.json({ ids });
}

async function toggleSaved(req, res) {
  const result = await catalogService.toggleSaveItem(req.user.id, req.params.id);
  res.json(result);
}

const mlClient = require('../../common/mlClient');

async function predictPrice(req, res) {
  const prediction = await mlClient.predictPricing(req.body);
  res.json(prediction);
}

async function getMLOpsStats(req, res) {
  const stats = await mlClient.getMLOpsStats();
  res.json(stats);
}

module.exports = {
  getItems,
  getRecommendations,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  getMyItems,
  getSaved,
  toggleSaved,
  predictPrice,
  getMLOpsStats
};
