const crypto = require('crypto');
const { db, FieldValue } = require('./firebase');

/**
 * Generate a unique ID with a specified prefix
 */
function uid(prefix = '') {
  return prefix + crypto.randomBytes(6).toString('hex');
}

/**
 * Get current ISO 8601 timestamp string
 */
function now() {
  return new Date().toISOString();
}

/**
 * Get a single Firestore document by collection + id
 */
async function getDoc(collection, id) {
  const snap = await db.collection(collection).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Set (create/overwrite) a Firestore document
 */
async function setDoc(collection, id, data) {
  await db.collection(collection).doc(id).set(data);
}

/**
 * Update specific fields in a Firestore document
 */
async function updateDoc(collection, id, updates) {
  await db.collection(collection).doc(id).update(updates);
}

/**
 * Delete a Firestore document
 */
async function deleteDoc(collection, id) {
  await db.collection(collection).doc(id).delete();
}

/**
 * Get all documents in a collection
 */
async function getCollection(collection) {
  const snap = await db.collection(collection).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Get multiple Firestore documents by their IDs (parallel fetch)
 */
async function getDocs(collection, ids) {
  if (!ids || ids.length === 0) return [];
  const snaps = await Promise.all(ids.map((id) => db.collection(collection).doc(id).get()));
  return snaps.filter((s) => s.exists).map((s) => ({ id: s.id, ...s.data() }));
}

/**
 * Query a collection with filters
 * @param {string} collection
 * @param {Array<[field, op, value]>} filters
 * @param {{ orderBy?: string, orderDir?: string, limit?: number }} options
 */
async function queryCollection(collection, filters = [], options = {}) {
  let q = db.collection(collection);
  for (const [field, op, val] of filters) {
    q = q.where(field, op, val);
  }
  if (options.orderBy) {
    q = q.orderBy(options.orderBy, options.orderDir || 'asc');
  }
  if (options.limit) {
    q = q.limit(options.limit);
  }
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Strip sensitive credentials from user model before returning to client
 */
function safeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    area: user.area,
    since: user.since,
    rating: user.rating || 0,
    reviewCount: user.reviewCount || 0,
    demo: !!user.demo
  };
}

/**
 * Push an in-app notification to a user's notifications sub-collection
 */
async function notify(userId, type, text, link = '') {
  const notification = {
    id: uid('n_'),
    type,
    text,
    link,
    read: false,
    at: now()
  };
  await db
    .collection('users')
    .doc(userId)
    .collection('notifications')
    .doc(notification.id)
    .set(notification);
  return notification;
}

/**
 * Record an analytics event
 */
async function recordEvent(userId, type, itemId, extra = {}) {
  const event = {
    id: uid('ev_'),
    userId,
    type,
    itemId,
    timestamp: now(),
    ...extra
  };
  await db.collection('events').doc(event.id).set(event);
  return event;
}

/**
 * Validate YYYY-MM-DD date format
 */
function isValidDate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr || '') && !isNaN(Date.parse(dateStr));
}

module.exports = {
  uid,
  now,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getCollection,
  getDocs,
  queryCollection,
  safeUser,
  notify,
  recordEvent,
  isValidDate,
  // Expose FieldValue helpers
  FieldValue,
  db
};
