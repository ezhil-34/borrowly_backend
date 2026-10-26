/**
 * Client for communicating with the Python ML & MLOps Microservice
 */
const http = require('http');

const ML_SERVICE_HOST = process.env.ML_SERVICE_HOST || '127.0.0.1';
const ML_SERVICE_PORT = Number(process.env.ML_SERVICE_PORT || 8000);

function postJson(path, payload, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: ML_SERVICE_HOST,
        port: ML_SERVICE_PORT,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: timeoutMs
      },
      (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error(`ML service responded with status ${res.statusCode}: ${body}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('ML service request timed out'));
    });
    req.write(postData);
    req.end();
  });
}

function getJson(path, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: ML_SERVICE_HOST,
        port: ML_SERVICE_PORT,
        path,
        method: 'GET',
        timeout: timeoutMs
      },
      (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error(`ML service responded with status ${res.statusCode}: ${body}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('ML service request timed out'));
    });
    req.end();
  });
}

/**
 * Predict optimal rental price with confidence intervals using HistGradientBoosting
 */
async function predictPricing(listingData) {
  try {
    return await postJson('/predict/pricing', listingData);
  } catch (err) {
    // Fallback heuristic if ML service is temporarily unreachable
    const compMed = listingData.comparable_median_price || 350;
    return {
      suggested_price: compMed,
      price_low: Math.round(compMed * 0.85),
      price_high: Math.round(compMed * 1.25),
      comparable_median: compMed,
      model_confidence: 'heuristic fallback',
      model_version: 'fallback-heuristic'
    };
  }
}

/**
 * Rank candidate items with the 2-stage ML funnel model
 */
async function predictRecommendations(userId, candidates) {
  try {
    return await postJson('/predict/recommend', {
      user_id: userId || 'anonymous',
      candidates: candidates.map((c) => ({
        id: c.id,
        category: c.category,
        area: c.area,
        price: c.price,
        distance_km: c.distanceKm || 3.0,
        is_available: c.available ? 1 : 0
      }))
    });
  } catch (err) {
    return null;
  }
}

/**
 * Get MLOps statistics & system telemetry
 */
async function getMLOpsStats() {
  try {
    return await getJson('/mlops/stats');
  } catch (err) {
    return {
      service: 'Borrowly MLOps Monitoring Dashboard',
      status: 'offline',
      error: err.message
    };
  }
}

module.exports = {
  predictPricing,
  predictRecommendations,
  getMLOpsStats
};
