const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../../common/config');
const {
  uid, now, getDoc, setDoc, updateDoc, queryCollection, safeUser
} = require('../../common/utils');

// ─── Signup ──────────────────────────────────────────────────────────────────
async function signup({ name, email, password, area }) {
  if (!name || !email || !password) {
    throw Object.assign(new Error('Name, email and password are required'), { status: 400 });
  }

  // Check for existing user
  const existing = await queryCollection('users', [['email', '==', email.toLowerCase()]]);
  if (existing.length > 0) {
    throw Object.assign(new Error('Email already registered'), { status: 409 });
  }

  const hash = await bcrypt.hash(password, 12);
  const userId = uid('u_');
  const user = {
    id: userId,
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password: hash,
    area: area || '',
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
    since: now(),
    rating: 0,
    reviewCount: 0,
    demo: false
  };

  await setDoc('users', userId, user);
  const token = jwt.sign({ userId }, config.jwtSecret, { expiresIn: '30d' });
  return { token, user: safeUser(user) };
}

// ─── Login ───────────────────────────────────────────────────────────────────
async function login({ email, password }) {
  if (!email || !password) {
    throw Object.assign(new Error('Email and password required'), { status: 400 });
  }

  const users = await queryCollection('users', [['email', '==', email.toLowerCase()]]);
  const user = users[0];
  if (!user) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '30d' });
  return { token, user: safeUser(user) };
}

// ─── Get User Profile ─────────────────────────────────────────────────────────
async function getProfile(userId) {
  const user = await getDoc('users', userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  return safeUser(user);
}

// ─── Update Profile ───────────────────────────────────────────────────────────
async function updateProfile(userId, { name, area, avatar }) {
  const user = await getDoc('users', userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const updates = {};
  if (name) updates.name = name.trim();
  if (area !== undefined) updates.area = area;
  if (avatar) updates.avatar = avatar;

  await updateDoc('users', userId, updates);
  return safeUser({ ...user, ...updates });
}

// ─── Change Password ──────────────────────────────────────────────────────────
async function changePassword(userId, { oldPassword, newPassword }) {
  const user = await getDoc('users', userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const valid = await bcrypt.compare(oldPassword, user.password);
  if (!valid) throw Object.assign(new Error('Current password is incorrect'), { status: 400 });

  const hash = await bcrypt.hash(newPassword, 12);
  await updateDoc('users', userId, { password: hash });
  return { message: 'Password updated successfully' };
}

// ─── Get Notifications ────────────────────────────────────────────────────────
async function getNotifications(userId) {
  const { db } = require('../../common/utils');
  const snap = await db
    .collection('users')
    .doc(userId)
    .collection('notifications')
    .orderBy('at', 'desc')
    .limit(50)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── Mark Notification Read ───────────────────────────────────────────────────
async function markNotificationRead(userId, notifId) {
  const { db } = require('../../common/utils');
  await db
    .collection('users')
    .doc(userId)
    .collection('notifications')
    .doc(notifId)
    .update({ read: true });
  return { success: true };
}

module.exports = {
  signup,
  login,
  getProfile,
  updateProfile,
  changePassword,
  getNotifications,
  markNotificationRead
};
