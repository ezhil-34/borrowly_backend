/**
 * Hybrid Recommender: TF-IDF Cosine Content Similarity + Multi-factor Contextual Ranker
 */
const DEFAULT_WEIGHTS = { sim: 0.30, loc: 0.20, price: 0.20, avail: 0.15, owner: 0.10, pop: 0.05 };

let weights = DEFAULT_WEIGHTS;
try {
  weights = { ...DEFAULT_WEIGHTS, ...JSON.parse(process.env.REC_WEIGHTS || '{}') };
} catch {}

const STOP_WORDS = new Set('the and for with this that you your from are have can has was not but all any use used set per into out one two'.split(' '));

function tokenize(text) {
  return (String(text).toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP_WORDS.has(w));
}

function itemToDocument(item) {
  return [item.title, item.title, item.category, item.brand, item.condition, item.description].join(' ');
}

/**
 * Haversine distance in kilometers between two geo-coordinates
 */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function tfidfSimilarity(documents, queryIntent) {
  const tokenizedDocs = documents.map(tokenize);
  const docCount = documents.length;
  const documentFrequency = {};

  tokenizedDocs.forEach((tokens) => {
    new Set(tokens).forEach((word) => {
      documentFrequency[word] = (documentFrequency[word] || 0) + 1;
    });
  });

  const vectorize = (tokens) => {
    const termFreq = {};
    tokens.forEach((w) => {
      termFreq[w] = (termFreq[w] || 0) + 1;
    });
    for (const w in termFreq) {
      termFreq[w] *= Math.log((docCount + 1) / ((documentFrequency[w] || 0) + 1)) + 1;
    }
    return termFreq;
  };

  const cosineSimilarity = (vecA, vecB) => {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (const w in vecA) {
      normA += vecA[w] ** 2;
      if (vecB[w]) dot += vecA[w] * vecB[w];
    }
    for (const w in vecB) normB += vecB[w] ** 2;
    return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
  };

  const queryVector = vectorize(tokenize(queryIntent));
  return tokenizedDocs.map((docTokens) => cosineSimilarity(queryVector, vectorize(docTokens)));
}

function rankItems(items, context = {}) {
  const { q = '', affinity = '', categories = [], maxPrice, lat, lng, start, end } = context;
  const intent = (q + ' ').repeat(3) + categories.join(' ') + ' ' + affinity;
  const hasIntent = tokenize(intent).length > 0;
  const documents = items.map(itemToDocument);

  const similarities = hasIntent ? tfidfSimilarity(documents, intent) : items.map(() => 0);
  const querySimilarities = q ? tfidfSimilarity(documents, q) : items.map(() => 0);

  const maxPopularity = Math.max(1, ...items.map((i) => i.popularity || 0));
  const activeWeights = { ...weights };

  if (!hasIntent) {
    activeWeights.loc += activeWeights.sim / 2;
    activeWeights.pop += activeWeights.sim / 2;
    activeWeights.sim = 0;
  }

  const scoredItems = items.map((item, idx) => {
    const simScore = Math.min(1, similarities[idx] * 1.5);
    const locScore = item.distanceKm == null ? 0.5 : Math.max(0, 1 - Math.min(item.distanceKm, 25) / 25);
    const priceScore = maxPrice
      ? item.price <= maxPrice
        ? 1 - (0.4 * item.price) / maxPrice
        : Math.max(0, 1 - (item.price - maxPrice) / maxPrice)
      : 0.5;
    const availScore = start && end ? 1 : item.available ? 0.7 : 0;
    const reviewCount = item.owner?.count || 0;
    const ownerScore = ((item.owner?.rating || 0) * reviewCount + 3.5 * 3) / (reviewCount + 3) / 5;
    const popScore = Math.log(1 + (item.popularity || 0)) / Math.log(1 + maxPopularity);

    const totalScore =
      activeWeights.sim * simScore +
      activeWeights.loc * locScore +
      activeWeights.price * priceScore +
      activeWeights.avail * availScore +
      activeWeights.owner * ownerScore +
      activeWeights.pop * popScore;

    const reasons = [];
    if (q && querySimilarities[idx] > 0.05) {
      reasons.push(`Matches your search “${q}”`);
    } else if (simScore > 0.12 && categories.includes(item.category)) {
      reasons.push(`Matches your interest in ${item.category.toLowerCase()}`);
    } else if (simScore > 0.12) {
      reasons.push('Similar to items you viewed or saved');
    }

    if (maxPrice && item.price <= maxPrice) {
      reasons.push('Within your preferred price range');
    }
    if (start && end) {
      reasons.push('Available for your selected dates');
    }
    if (item.distanceKm != null && item.distanceKm <= 5) {
      reasons.push(popScore > 0.6 ? 'Popular near your location' : `Only ${item.distanceKm.toFixed(1)} km away`);
    }
    if (!reasons.length && popScore > 0.6) {
      reasons.push('Popular this week');
    }

    return {
      ...item,
      sim: querySimilarities[idx],
      score: Number(totalScore.toFixed(4)),
      reasons,
      components: {
        sim: Number(simScore.toFixed(3)),
        loc: Number(locScore.toFixed(3)),
        price: Number(priceScore.toFixed(3)),
        avail: availScore,
        owner: Number(ownerScore.toFixed(3)),
        pop: Number(popScore.toFixed(3))
      }
    };
  });

  return {
    items: scoredItems.sort((a, b) => b.score - a.score),
    mode: hasIntent ? 'hybrid' : 'cold-start',
    weights: activeWeights,
    note: 'Contextual hybrid ranker (TF-IDF cosine similarity + multi-signal scoring).'
  };
}

module.exports = {
  rankItems,
  haversine,
  weights
};
