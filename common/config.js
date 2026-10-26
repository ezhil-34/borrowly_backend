require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-borrowly-2025',
  platformFeeRate: Number(process.env.PLATFORM_FEE_RATE) || 0.05,
  lateFeeMultiplier: Number(process.env.LATE_FEE_MULTIPLIER) || 1.5,
  seedOnBoot: process.env.SEED_ON_BOOT !== 'false',

  // Ports for standalone microservices & API gateway
  ports: {
    gateway: Number(process.env.PORT || 3000),
    auth: Number(process.env.AUTH_PORT || 3001),
    catalog: Number(process.env.CATALOG_PORT || 3002),
    bookings: Number(process.env.BOOKINGS_PORT || 3003),
    messaging: Number(process.env.MESSAGING_PORT || 3004)
  },

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'borrowly-app',
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    databaseURL: process.env.FIREBASE_DATABASE_URL
  }
};
