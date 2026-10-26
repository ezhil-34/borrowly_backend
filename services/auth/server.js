const express = require('express');
const config = require('../../common/config');
const corsMiddleware = require('../../common/middleware/cors.middleware');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { errorHandler, notFoundHandler } = require('../../common/middleware/error.middleware');
const authRoutes = require('./auth.routes');

const app = express();
app.use(corsMiddleware);
app.use(express.json({ limit: '2mb' }));
app.use(authenticate);

// Mount under both root and /api for versatility
app.use('/api', authRoutes);
app.use('/', authRoutes);

app.get('/health', (req, res) => res.json({ service: 'auth', status: 'healthy', uptime: process.uptime() }));

app.use(notFoundHandler);
app.use(errorHandler);

if (require.main === module) {
  const PORT = config.ports.auth;
  app.listen(PORT, () => {
    console.log(`[Auth Microservice] Running on http://localhost:${PORT}`);
  });
}

module.exports = app;
