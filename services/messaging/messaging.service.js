const { uid, now, getDoc, queryCollection, notify, db } = require('../../common/utils');

// ─── Verify Chat Access ───────────────────────────────────────────────────────
async function verifyChatAccess(bookingId, user) {
  const booking = await getDoc('bookings', bookingId);
  if (!booking) {
    throw Object.assign(new Error('Booking not found'), { status: 404 });
  }
  if (![booking.ownerId, booking.borrowerId].includes(user.id)) {
    throw Object.assign(
      new Error('You do not have permission to view or participate in this conversation'),
      { status: 403 }
    );
  }
  return booking;
}

// ─── Get Chat Messages ────────────────────────────────────────────────────────
async function getChatMessages(bookingId, user) {
  await verifyChatAccess(bookingId, user);
  const snap = await db
    .collection('bookings')
    .doc(bookingId)
    .collection('messages')
    .orderBy('at', 'asc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── Send Chat Message ────────────────────────────────────────────────────────
async function sendChatMessage(bookingId, text, user) {
  const booking = await verifyChatAccess(bookingId, user);
  const cleanText = String(text || '').trim().slice(0, 1000);

  if (!cleanText) {
    throw Object.assign(new Error('Message text cannot be empty'), { status: 400 });
  }

  const message = {
    id: uid('m_'),
    from: user.id,
    name: user.name,
    text: cleanText,
    at: now()
  };

  await db
    .collection('bookings')
    .doc(bookingId)
    .collection('messages')
    .doc(message.id)
    .set(message);

  const recipientId = user.id === booking.ownerId ? booking.borrowerId : booking.ownerId;
  await notify(recipientId, 'message', `New message from ${user.name}`, '#/messages');

  return message;
}

// ─── Get Notifications ────────────────────────────────────────────────────────
async function getNotifications(userId) {
  const snap = await db
    .collection('users')
    .doc(userId)
    .collection('notifications')
    .orderBy('at', 'desc')
    .limit(50)
    .get();

  const notifications = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const unread = notifications.filter((n) => !n.read).length;

  return { notifications, unread };
}

// ─── Mark Notifications Read ──────────────────────────────────────────────────
async function markNotificationsRead(userId) {
  const snap = await db
    .collection('users')
    .doc(userId)
    .collection('notifications')
    .where('read', '==', false)
    .get();

  const batch = db.batch();
  snap.docs.forEach((doc) => batch.update(doc.ref, { read: true }));
  await batch.commit();

  return { ok: true };
}

// ─── Submit Report ────────────────────────────────────────────────────────────
async function submitReport(body, user) {
  const reason = String(body.reason || '').trim().slice(0, 1000);
  if (!reason) {
    throw Object.assign(
      new Error('Please describe the problem or reason for this report'),
      { status: 400 }
    );
  }

  const report = {
    id: uid('rp_'),
    by: user.id,
    type: body.type || 'listing',
    target: body.target || '',
    reason,
    at: now()
  };

  await db.collection('reports').doc(report.id).set(report);
  return { ok: true };
}

module.exports = {
  getChatMessages,
  sendChatMessage,
  getNotifications,
  markNotificationsRead,
  submitReport
};
