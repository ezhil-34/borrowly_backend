const bookingsService = require('./bookings.service');

async function getQuote(req, res) {
  const { itemId, start, end } = req.body;
  if (!itemId) {
    return res.status(400).json({ error: 'itemId is required' });
  }
  const quote = await bookingsService.getQuote(itemId, start, end);
  res.json(quote);
}

async function createBooking(req, res) {
  const result = await bookingsService.createBooking(req.body, req.user);
  res.status(201).json({ booking: result });
}

async function getBookings(req, res) {
  const bookings = await bookingsService.getUserBookings(req.user.id);
  res.json({ bookings });
}

async function performAction(req, res) {
  const result = await bookingsService.performAction(
    req.params.id,
    req.params.action,
    req.body,
    req.user
  );
  res.json({ booking: result });
}

async function submitReview(req, res) {
  const result = await bookingsService.submitReview(req.params.id, req.body, req.user);
  res.json(result);
}

module.exports = {
  getQuote,
  createBooking,
  getBookings,
  performAction,
  submitReview
};
