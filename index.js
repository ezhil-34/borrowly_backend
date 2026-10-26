require('dotenv').config();
const config = require('./common/config');
const { createGatewayApp } = require('./gateway/gateway');
const { seed } = require('./seed');

const app = createGatewayApp();
const PORT = config.ports.gateway;

(async () => {
  try {
    if (config.seedOnBoot) {
      await seed(false).catch((e) => console.error('[Seed Error]:', e.message));
    }
    app.listen(PORT, () => {
      console.log(`Borrowly API Gateway & Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
