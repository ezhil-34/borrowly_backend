const path = require('path');
const express = require('express');
const config = require('../common/config');
const corsMiddleware = require('../common/middleware/cors.middleware');
const { authenticate } = require('../common/middleware/auth.middleware');
const { errorHandler } = require('../common/middleware/error.middleware');

// Microservice Route Modules
const authRoutes = require('../services/auth/auth.routes');
const catalogRoutes = require('../services/catalog/catalog.routes');
const bookingsRoutes = require('../services/bookings/bookings.routes');
const messagingRoutes = require('../services/messaging/messaging.routes');

function createGatewayApp() {
  const app = express();

  // Basic Middleware
  app.use(corsMiddleware);
  app.use(express.json({ limit: '6mb' }));
  app.use(authenticate);

  // Serve static client bundle if built
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));

  // Mount Microservice API Routers
  app.use('/api', authRoutes);
  app.use('/api', catalogRoutes);
  app.use('/api', bookingsRoutes);
  app.use('/api', messagingRoutes);

  // Unified Health Check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      gateway: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      microservices: {
        auth: { status: 'active', port: config.ports.auth },
        catalog: { status: 'active', port: config.ports.catalog },
        bookings: { status: 'active', port: config.ports.bookings },
        messaging: { status: 'active', port: config.ports.messaging }
      }
    });
  });

  // Catch-all for undefined API routes
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  // SPA fallback to client/dist/index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) {
        res
          .status(200)
          .send(
            'Frontend not built yet. Run: npm --prefix client run dev (for Vite on :5173) or npm run build.'
          );
      }
    });
  });

  app.use(errorHandler);

  return app;
}

module.exports = { createGatewayApp };
