const config = require('../../common/config');

const PLATFORM_FEE_RATE = config.platformFeeRate;
const LATE_FEE_MULTIPLIER = config.lateFeeMultiplier;

/**
 * Calculate rental days inclusive of start and end date
 */
function calculateDays(start, end) {
  return Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1;
}

/**
 * Single source of truth for pricing calculations
 */
function calculateQuote({ price, deposit = 0, start, end }) {
  const rentalDays = calculateDays(start, end);
  if (!(rentalDays >= 1)) {
    throw new Error('Return date must be on or after the start date');
  }

  const subtotal = price * rentalDays;
  const platformFee = Math.round(subtotal * PLATFORM_FEE_RATE);
  const total = subtotal + platformFee + deposit;
  const lateFeePerDay = Math.round(price * LATE_FEE_MULTIPLIER);

  return {
    days: rentalDays,
    price,
    subtotal,
    fee: platformFee,
    feeRate: PLATFORM_FEE_RATE,
    deposit,
    total,
    refundable: deposit,
    lateFeePerDay
  };
}

/**
 * Calculate late return penalty fee
 */
function calculateLateFee(dailyPrice, lateDays) {
  return Math.max(0, Math.round(dailyPrice * LATE_FEE_MULTIPLIER) * lateDays);
}

module.exports = {
  calculateDays,
  calculateQuote,
  calculateLateFee,
  PLATFORM_FEE_RATE,
  LATE_FEE_MULTIPLIER
};
