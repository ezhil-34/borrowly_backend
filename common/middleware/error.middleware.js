/**
 * Async handler to wrap route controllers and catch unhandled promise rejections
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * 404 handler for unmatched routes
 */
function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

/**
 * Global error handler
 */
function errorHandler(err, req, res, next) {
  console.error('[Error]', err.stack || err.message || err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'An unexpected server error occurred';
  res.status(status).json({ error: message });
}

module.exports = {
  asyncHandler,
  notFoundHandler,
  errorHandler
};
