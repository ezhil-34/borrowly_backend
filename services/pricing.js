// Backward compatibility bridge for pricing module
const pricing = require('./bookings/pricing');

module.exports = {
  quote: pricing.calculateQuote,
  lateFee: pricing.calculateLateFee,
  days: pricing.calculateDays,
  FEE: pricing.PLATFORM_FEE_RATE,
  LATE: pricing.LATE_FEE_MULTIPLIER
};
