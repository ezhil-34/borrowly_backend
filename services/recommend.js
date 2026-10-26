// Backward compatibility bridge for recommendations
const { rankItems, haversine, weights } = require('./catalog/recommender');

module.exports = {
  rank: rankItems,
  hav: haversine,
  W: weights
};
