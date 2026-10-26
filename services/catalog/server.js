const express = require('express');
const config = require('../../common/config');
const corsMiddleware = require('../../common/middleware/cors.middleware');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { errorHandler, notFoundHandler } = require('../../common/middleware/error.middleware');
const catalogRoutes = require('./catalog.routes');

const app = express();
app.use(corsMiddleware);
app.use(express.json({ limit: '6mb' }));
app.use(authenticate);

app.use('/api', catalogRoutes);
app.use('/', catalogRoutes);

app.get('/health', (req, res) =>
  res.json({ service: 'catalog', status: 'healthy', uptime: process.uptime() })
);

app.use(notFoundHandler);
app.use(errorHandler);

if (require.main === module) {
  const PORT = config.ports.catalog;
  app.listen(PORT, () => {
    console.log(`[Catalog Microservice] Running on http://localhost:${PORT}`);
  });
}

module.exports = app;
