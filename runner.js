/**
 * Microservices Distributed Cluster Runner
 * Starts all 4 microservices on their dedicated ports + API Gateway on port 3000
 */
require('dotenv').config();
const config = require('./common/config');
const { seed } = require('./seed');

const authApp = require('./services/auth/server');
const catalogApp = require('./services/catalog/server');
const bookingsApp = require('./services/bookings/server');
const messagingApp = require('./services/messaging/server');
const { createGatewayApp } = require('./gateway/gateway');

async function startAll() {
  console.log('\n======================================================');
  console.log('  🚀 Starting Borrowly Microservices Architecture');
  console.log('======================================================\n');

  if (config.seedOnBoot) {
    try {
      await seed(false);
    } catch (err) {
      console.error('[Seed Error]', err.message);
    }
  }

  // 1. Auth Microservice
  authApp.listen(config.ports.auth, () => {
    console.log(`  🔐 Auth Microservice        -> http://localhost:${config.ports.auth}`);
  });

  // 2. Catalog Microservice
  catalogApp.listen(config.ports.catalog, () => {
    console.log(`  📦 Catalog Microservice     -> http://localhost:${config.ports.catalog}`);
  });

  // 3. Bookings Microservice
  bookingsApp.listen(config.ports.bookings, () => {
    console.log(`  📅 Bookings Microservice    -> http://localhost:${config.ports.bookings}`);
  });

  // 4. Messaging Microservice
  messagingApp.listen(config.ports.messaging, () => {
    console.log(`  💬 Messaging Microservice   -> http://localhost:${config.ports.messaging}`);
  });

  // 5. API Gateway
  const gatewayApp = createGatewayApp();
  gatewayApp.listen(config.ports.gateway, () => {
    console.log(`  🌐 API Gateway              -> http://localhost:${config.ports.gateway}`);
    console.log('\n======================================================');
    console.log(`  Ready! Client proxy: http://localhost:5173 -> :${config.ports.gateway}`);
    console.log('======================================================\n');
  });
}

if (require.main === module) {
  startAll().catch((err) => {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  });
}

module.exports = { startAll };
