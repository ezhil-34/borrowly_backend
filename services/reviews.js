// Backward compatibility bridge for reviews summary
const { summarizeReviews } = require('./catalog/reviews.summary');

module.exports = {
  summarize: summarizeReviews
};
