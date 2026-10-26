const {
  uid,
  now,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  queryCollection,
  recordEvent,
  db
} = require('../../common/utils');
const { rankItems, haversine } = require('./recommender');
const { summarizeReviews } = require('./reviews.summary');
const mlClient = require('../../common/mlClient');

const BLOCKING_STATUSES = ['approved', 'ready_for_pickup', 'borrowed'];

// ─── Blocking Booking Check ──────────────────────────────────────────────────
async function findBlockingBookings(itemId, start, end, ignoreBookingId = null) {
  const bookings = await queryCollection('bookings', [['itemId', '==', itemId]]);
  return bookings.filter(
    (b) =>
      b.id !== ignoreBookingId &&
      BLOCKING_STATUSES.includes(b.status) &&
      b.start <= end &&
      start <= b.end
  );
}

// ─── Format Public Item ───────────────────────────────────────────────────────
async function formatPublicItem(item, context = {}) {
  const owner = (await getDoc('users', item.ownerId)) || {};
  let isAvailable = item.status === 'active';

  if (isAvailable && context.start && context.end) {
    const conflicts = await findBlockingBookings(item.id, context.start, context.end);
    isAvailable = conflicts.length === 0;
  }

  // Get stats from Firestore stats document
  const statsDoc = await getDoc('stats', item.id);
  const views = statsDoc?.views || 0;
  const saves = statsDoc?.saves || 0;
  const bookings = statsDoc?.bookings || 0;

  const { meetingDetails, ...publicFields } = item;

  const distanceKm =
    context.lat != null && context.lng != null
      ? haversine(context.lat, context.lng, item.lat, item.lng)
      : null;

  return {
    ...publicFields,
    lat: Number(Number(item.lat).toFixed(2)),
    lng: Number(Number(item.lng).toFixed(2)),
    available: isAvailable,
    popularity: views * 0.2 + saves + bookings * 3,
    owner: {
      id: owner.id,
      name: owner.name,
      avatar: owner.avatar,
      rating: owner.rating || 0,
      count: owner.reviewCount || 0,
      area: owner.area,
      since: owner.since
    },
    distanceKm
  };
}

// ─── Discover / Search Items ──────────────────────────────────────────────────
async function discover(params = {}, user = null) {
  const context = {
    lat: params.lat != null && params.lat !== '' ? Number(params.lat) : null,
    lng: params.lng != null && params.lng !== '' ? Number(params.lng) : null,
    start: params.start,
    end: params.end
  };

  const rawItems = await queryCollection('items', [['status', '==', 'active']]);
  let items = await Promise.all(rawItems.map((i) => formatPublicItem(i, context)));

  // Hard filters
  if (context.start && context.end) {
    items = items.filter((i) => i.available);
  }
  if (params.category) {
    items = items.filter((i) => i.category === params.category);
  }
  if (params.maxPrice) {
    items = items.filter((i) => i.price <= Number(params.maxPrice));
  }
  if (params.radius && context.lat != null) {
    items = items.filter((i) => i.distanceKm <= Number(params.radius));
  }

  // Personalization — build affinity string from user history
  let affinity = '';
  const categories = [].concat(params.categories || []);
  if (user) {
    const userDoc = await getDoc('users', user.id);
    const viewedIds = (userDoc?.viewedItems || []).slice(0, 10);
    const savedIds = (userDoc?.savedItems || []);
    const uniqueIds = [...new Set([...viewedIds, ...savedIds])];
    if (uniqueIds.length) {
      const seenItems = await Promise.all(uniqueIds.map((id) => getDoc('items', id)));
      affinity = seenItems
        .filter(Boolean)
        .map((i) => `${i.title} ${i.category}`)
        .join(' ');
    }
  }

  const ranked = rankItems(items, {
    q: params.q,
    affinity,
    categories,
    maxPrice: Number(params.maxPrice) || null,
    lat: context.lat,
    lng: context.lng,
    start: context.start,
    end: context.end
  });

  let outputItems = ranked.items;
  if (params.q) {
    outputItems = outputItems.filter((i) => i.sim > 0.02);
  }

  // Enhance with Python ML model if available and user is browsing
  let mlModelUsed = false;
  try {
    if (outputItems.length > 0 && !params.sort) {
      const mlRes = await mlClient.predictRecommendations(user?.id, outputItems);
      if (mlRes && mlRes.ranked_items?.length) {
        const mlScoreMap = new Map(mlRes.ranked_items.map((r) => [r.id, r]));
        outputItems = outputItems.map((item) => {
          const mlInfo = mlScoreMap.get(item.id);
          if (mlInfo) {
            return {
              ...item,
              mlScore: mlInfo.ml_score,
              pClick: mlInfo.p_click,
              pBook: mlInfo.p_book,
              reasons: [mlInfo.rank_reason, ...(item.reasons || [])].slice(0, 2)
            };
          }
          return item;
        });

        // Blended score prioritizing 2-stage ML expected booking probability
        outputItems.sort((a, b) => {
          const scoreA = (a.mlScore != null ? a.mlScore * 10 : 0) + (a.score || 0);
          const scoreB = (b.mlScore != null ? b.mlScore * 10 : 0) + (b.score || 0);
          return scoreB - scoreA;
        });
        mlModelUsed = true;
      }
    }
  } catch {}

  const sortStrategies = {
    distance: (a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9),
    price: (a, b) => a.price - b.price,
    rating: (a, b) => (b.owner.rating || 0) - (a.owner.rating || 0),
    popular: (a, b) => b.popularity - a.popularity
  };

  if (sortStrategies[params.sort]) {
    outputItems = [...outputItems].sort(sortStrategies[params.sort]);
  }

  return {
    items: outputItems,
    mode: mlModelUsed ? 'ml_2stage_funnel' : ranked.mode,
    weights: ranked.weights,
    note: mlModelUsed
      ? 'Ranked using trained HistGradientBoosting 2-stage expected booking funnel (P(click) × P(book|click)).'
      : ranked.note
  };
}

// ─── Get Item Details ─────────────────────────────────────────────────────────
async function getItemDetails(itemId, context = {}, user = null) {
  const item = await getDoc('items', itemId);
  if (!item) {
    throw Object.assign(new Error('Listing not found'), { status: 404 });
  }

  const publicItem = await formatPublicItem(item, context);

  // Fetch reviews from sub-collection
  const reviewsSnap = await db
    .collection('items')
    .doc(itemId)
    .collection('reviews')
    .orderBy('createdAt', 'desc')
    .get();
  const reviews = reviewsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const starDistribution = [5, 4, 3, 2, 1].map((s) => ({
    stars: s,
    count: reviews.filter((r) => r.rating === s).length
  }));

  const bookings = await queryCollection('bookings', [['itemId', '==', item.id]]);
  const bookedDates = bookings
    .filter((b) => BLOCKING_STATUSES.includes(b.status))
    .map((b) => ({ start: b.start, end: b.end }));

  // Increment view count & record user interaction
  const statsRef = db.collection('stats').doc(item.id);
  await statsRef.set({ views: 1 }, { merge: true });
  await statsRef.update({ views: require('../../common/firebase').FieldValue.increment(1) });

  if (user) {
    // Append to viewedItems array in user doc
    await db
      .collection('users')
      .doc(user.id)
      .update({
        viewedItems: require('../../common/firebase').FieldValue.arrayUnion(item.id)
      });
    await recordEvent(user.id, 'view', item.id);
  }

  const reviewCount = reviews.length;
  const avgRating = reviewCount
    ? Number((reviews.reduce((acc, r) => acc + r.rating, 0) / reviewCount).toFixed(1))
    : null;

  return {
    item: publicItem,
    booked: bookedDates,
    reviews: reviews.slice(0, 10),
    reviewStats: {
      count: reviewCount,
      avg: avgRating,
      dist: starDistribution
    },
    summary: await summarizeReviews(reviews, 1, item.title)
  };
}

// ─── Create Item ──────────────────────────────────────────────────────────────
function validateItemInput(body) {
  const errors = [];
  if (!body.title?.trim()) errors.push('Title is required');
  if (!body.category) errors.push('Choose a category');
  if (!(Number(body.price) > 0)) errors.push('Enter a daily price above 0');
  if ((body.description || '').trim().length < 20) {
    errors.push('Description needs at least 20 characters');
  }
  if (!body.images?.length) errors.push('Add at least one photo');
  if (body.images?.length > 8) errors.push('Maximum 8 photos allowed');
  return errors;
}

async function createItem(body, user) {
  const validationErrors = validateItemInput(body);
  if (validationErrors.length > 0) {
    throw Object.assign(new Error(validationErrors.join('. ')), { status: 400 });
  }

  const item = {
    id: uid('i_'),
    ownerId: user.id,
    title: body.title.trim(),
    category: body.category,
    brand: body.brand || '',
    condition: body.condition || 'Good',
    price: Number(body.price),
    deposit: Number(body.deposit) || 0,
    description: body.description.trim(),
    accessories: body.accessories || [],
    images: body.images.slice(0, 8),
    area: body.area || user.area,
    lat: Number(body.lat),
    lng: Number(body.lng),
    minDays: Number(body.minDays) || 1,
    maxDays: Number(body.maxDays) || 14,
    delivery: Boolean(body.delivery),
    rules: ['Return clean and in the same condition'],
    cancellation: 'Free cancellation up to 24 hours before pickup',
    lateFeeNote: 'Late returns are charged at 1.5× the daily rate per overdue day',
    status: 'active',
    createdAt: now(),
    meetingDetails: body.meetingDetails || 'Owner will share exact meeting details in chat.'
  };

  await setDoc('items', item.id, item);
  // Init stats document
  await setDoc('stats', item.id, { views: 0, saves: 0, bookings: 0 });

  return { id: item.id };
}

// ─── Update Item ──────────────────────────────────────────────────────────────
async function updateItem(itemId, updates, user) {
  const item = await getDoc('items', itemId);
  if (!item) throw Object.assign(new Error('Listing not found'), { status: 404 });
  if (item.ownerId !== user.id) {
    throw Object.assign(new Error('You can only edit your own listings'), { status: 403 });
  }

  const allowedFields = ['title', 'description', 'price', 'deposit', 'status', 'condition'];
  const patch = {};
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      patch[field] =
        field === 'price' || field === 'deposit' ? Number(updates[field]) : updates[field];
    }
  }

  if (patch.status && !['active', 'paused'].includes(patch.status)) {
    throw Object.assign(new Error('Invalid status (must be active or paused)'), { status: 400 });
  }

  await updateDoc('items', itemId, patch);
  return { ok: true };
}

// ─── Delete Item ──────────────────────────────────────────────────────────────
async function deleteItem(itemId, user) {
  const item = await getDoc('items', itemId);
  if (!item) throw Object.assign(new Error('Listing not found'), { status: 404 });
  if (item.ownerId !== user.id) {
    throw Object.assign(new Error('You can only remove your own listings'), { status: 403 });
  }

  const conflicts = await findBlockingBookings(item.id, '0000-01-01', '9999-12-31');
  if (conflicts.length > 0) {
    throw Object.assign(
      new Error('Cannot delete this listing because it has active bookings'),
      { status: 400 }
    );
  }

  await deleteDoc('items', itemId);
  await deleteDoc('stats', itemId);
  return { ok: true };
}

// ─── My Items ─────────────────────────────────────────────────────────────────
async function getMyItems(userId) {
  return queryCollection('items', [['ownerId', '==', userId]]);
}

// ─── Saved Items ──────────────────────────────────────────────────────────────
async function getSavedItemIds(userId) {
  const userDoc = await getDoc('users', userId);
  return userDoc?.savedItems || [];
}

async function toggleSaveItem(userId, itemId) {
  const userDoc = await getDoc('users', userId);
  const savedItems = userDoc?.savedItems || [];
  const isSaved = savedItems.includes(itemId);
  const { FieldValue } = require('../../common/firebase');

  if (isSaved) {
    await db.collection('users').doc(userId).update({
      savedItems: FieldValue.arrayRemove(itemId)
    });
    return { saved: false };
  } else {
    await db.collection('users').doc(userId).update({
      savedItems: FieldValue.arrayUnion(itemId)
    });
    // Increment saves stat
    await db.collection('stats').doc(itemId).set({ saves: FieldValue.increment(1) }, { merge: true });
    await recordEvent(userId, 'save', itemId);
    return { saved: true };
  }
}

module.exports = {
  findBlockingBookings,
  formatPublicItem,
  discover,
  getItemDetails,
  createItem,
  updateItem,
  deleteItem,
  getMyItems,
  getSavedItemIds,
  toggleSaveItem
};
