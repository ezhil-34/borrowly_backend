/**
 * Extract sentiment themes and optional AI-generated LLM review summaries (Gemini API)
 */
const https = require('https');

const THEMES = [
  ['Well maintained', 'pos', /clean|well maintained|good condition|like new|works? (great|perfectly)|mint/i],
  ['Easy pickup & return', 'pos', /easy (pick|return|hand)|smooth|on time|punctual|friendly|flexible/i],
  ['Good value', 'pos', /value|worth|affordable|cheap|saved/i],
  ['Description could be more accurate', 'neg', /not as described|different from|inaccurate|missing|description/i],
  ['Slow communication', 'neg', /slow (reply|response)|unresponsive|late reply/i],
  ['Wear or damage noted', 'neg', /scratch|damage|broken|dirty|worn/i]
];

/**
 * Call Google Gemini LLM API to summarize reviews if GEMINI_API_KEY is configured
 */
async function callGeminiReviewSummary(reviews, itemTitle = 'this item') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') return null;

  try {
    const reviewTexts = reviews
      .map((r, i) => `${i + 1}. [Rating: ${r.rating || 5}/5] "${r.text || ''}"`)
      .join('\n');

    const prompt = `You are an AI assistant for Borrowly, a peer-to-peer equipment and tool rental marketplace.
Summarize the following customer reviews for the item "${itemTitle}".
Keep it concise (2-3 sentences max). Mention what renters loved most, item condition/reliability, and any cautions. Be balanced and authentic.

Reviews:
${reviewTexts}

Output a single short paragraph summary without markdown bolding headers:`;

    const requestBody = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 150
      }
    });

    return await new Promise((resolve) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const req = https.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestBody)
          },
          timeout: 5000
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                const parsed = JSON.parse(data);
                const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                resolve(text || null);
              } else {
                resolve(null);
              }
            } catch {
              resolve(null);
            }
          });
        }
      );

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.write(requestBody);
      req.end();
    });
  } catch {
    return null;
  }
}

async function summarizeReviews(reviews, minReviews = 1, itemTitle = '') {
  if (!reviews || reviews.length < minReviews) return null;

  const themes = THEMES.map(([label, type, regex]) => {
    const matchingReviewIds = reviews
      .filter((r) => regex.test(r.text || ''))
      .map((r) => r.id);

    return {
      label,
      type,
      count: matchingReviewIds.length,
      reviewIds: matchingReviewIds
    };
  })
    .filter((theme) => theme.count > 0)
    .sort((a, b) => b.count - a.count);

  // Try LLM summary if key provided
  const aiSummary = await callGeminiReviewSummary(reviews, itemTitle);

  return {
    basedOn: reviews.length,
    themes,
    aiSummary: aiSummary || null,
    source: aiSummary ? 'gemini-llm' : 'sentiment-extraction'
  };
}

module.exports = {
  summarizeReviews,
  callGeminiReviewSummary
};
