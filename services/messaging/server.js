const express = require('express');
const config = require('../../common/config');
const corsMiddleware = require('../../common/middleware/cors.middleware');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { errorHandler, notFoundHandler } = require('../../common/middleware/error.middleware');
const messagingRoutes = require('./messaging.routes');

const app = express();
app.use(corsMiddleware);
app.use(express.json({ limit: '2mb' }));
app.use(authenticate);

app.use('/api', messagingRoutes);
app.use('/', messagingRoutes);

app.get('/health', (req, res) =>
  res.json({ service: 'messaging', status: 'healthy', uptime: process.uptime() })
);

app.use(notFoundHandler);
app.use(errorHandler);

if (require.main === module) {
  const PORT = config.ports.messaging;
  app.listen(PORT, () => {
    console.log(`[Messaging Microservice] Running on http://localhost:${PORT}`);
  });
}

module.exports = app;
