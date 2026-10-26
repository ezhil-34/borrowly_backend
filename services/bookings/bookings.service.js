const {
  uid,
  now,
  getDoc,
  setDoc,
  updateDoc,
  queryCollection,
  safeUser,
  notify,
  recordEvent,
  isValidDate,
  db
} = require('../../common/utils');
const { FieldValue } = require('../../common/firebase');
const { calculateQuote, calculateLateFee } = require('./pricing');

const BLOCKING_STATUSES = ['approved', 'ready_for_pickup', 'borrowed'];

// ─── Overlap Check ────────────────────────────────────────────────────────────
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

// ─── Get Quote ────────────────────────────────────────────────────────────────
async function getQuote(itemId, start, end) {
  const item = await getDoc('items', itemId);
  if (!item) throw Object.assign(new Error('Listing not found'), { status: 404 });
  return calculateQuote({ price: item.price, deposit: item.deposit, start, end });
}

// ─── Format Booking for Client ────────────────────────────────────────────────
async function formatBookingView(booking, currentUserId) {
  const item = (await getDoc('items', booking.itemId)) || {};
  const currentTime = Date.now();
  const dueTimestamp = Date.parse(booking.dueAt);

  let displayStatus = booking.status;
  let lateDays = booking.lateDays || 0;
  let lateFee = booking.lateFee || 0;

  if (booking.status === 'borrowed') {
    if (currentTime > dueTimestamp) {
      displayStatus = 'overdue';
      lateDays = Math.ceil((currentTime - dueTimestamp) / 864e5);
      lateFee = calculateLateFee(item.price, lateDays);
    } else if (dueTimestamp - currentTime < 864e5) {
      displayStatus = 'due_soon';
    }
  }

  const isOwner = String(currentUserId) === String(booking.ownerId);
  const isBorrower = String(currentUserId) === String(booking.borrowerId);
  const role = isOwner ? 'lender' : 'borrower';

  const otherUserId = isOwner ? booking.borrowerId : booking.ownerId;
  const otherUser = await getDoc('users', otherUserId);
  const showMeetingDetails = !['requested', 'cancelled'].includes(booking.status);

  return {
    ...booking,
    displayStatus,
    lateDays,
    lateFee,
    item: {
      id: item.id,
      title: item.title,
      image: item.images?.[0] || '',
      price: item.price,
      deposit: item.deposit || 0,
      area: item.area
    },
    role,
    isOwner,
    isBorrower,
    other: safeUser(otherUser),
    meetingDetails: showMeetingDetails ? item.meetingDetails : null
  };
}

// ─── Create Booking ───────────────────────────────────────────────────────────
async function createBooking({ itemId, start, end }, user) {
  const item = await getDoc('items', itemId);
  if (!item || item.status !== 'active') {
    throw Object.assign(new Error('This item is currently unavailable'), { status: 404 });
  }
  if (String(item.ownerId) === String(user.id)) {
    throw Object.assign(
      new Error('You cannot borrow your own listed item. You are the owner of this listing.'),
      { status: 400 }
    );
  }
  if (!isValidDate(start) || !isValidDate(end)) {
    throw Object.assign(new Error('Please select valid start and return dates'), { status: 400 });
  }
  if (start < now().slice(0, 10)) {
    throw Object.assign(new Error('Start date cannot be in the past'), { status: 400 });
  }

  const quote = calculateQuote({ price: item.price, deposit: item.deposit, start, end });
  if (quote.days < (item.minDays || 1) || quote.days > (item.maxDays || 14)) {
    throw Object.assign(
      new Error(`This owner allows a rental duration of ${item.minDays || 1}–${item.maxDays || 14} days`),
      { status: 400 }
    );
  }

  const conflicts = await findBlockingBookings(item.id, start, end);
  if (conflicts.length > 0) {
    throw Object.assign(new Error('Selected dates are no longer available'), { status: 409 });
  }

  const booking = {
    id: uid('b_'),
    itemId,
    ownerId: item.ownerId,
    borrowerId: user.id,
    start,
    end,
    status: 'requested',
    quote,
    createdAt: now(),
    dueAt: `${end}T23:59:59.000Z`,
    history: [{ status: 'requested', at: now(), by: user.id }],
    paymentSimulated: true,
    reviewedBy: []
  };

  await setDoc('bookings', booking.id, booking);
  await recordEvent(user.id, 'request', itemId);
  await notify(
    item.ownerId,
    'request',
    `${user.name} requested to borrow "${item.title}" (${start} to ${end})`,
    '#/activity'
  );

  return formatBookingView(booking, user.id);
}

// ─── Get User Bookings ────────────────────────────────────────────────────────
async function getUserBookings(userId) {
  const owned = await queryCollection('bookings', [['ownerId', '==', userId]]);
  const borrowed = await queryCollection('bookings', [['borrowerId', '==', userId]]);

  // Merge unique bookings
  const map = new Map();
  [...owned, ...borrowed].forEach((b) => map.set(b.id, b));
  const sorted = [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return Promise.all(sorted.map((b) => formatBookingView(b, userId)));
}

const ACTION_RULES = {
  approve: { from: 'requested', to: 'approved', who: 'owner' },
  accept: { from: 'requested', to: 'approved', who: 'owner' },
  decline: { from: 'requested', to: 'cancelled', who: 'owner' },
  reject: { from: 'requested', to: 'cancelled', who: 'owner' },
  ready: { from: 'approved', to: 'ready_for_pickup', who: 'owner' },
  handover: { from: ['approved', 'ready_for_pickup'], to: 'borrowed', who: 'owner' },
  return: { from: 'borrowed', to: 'returned', who: 'owner' },
  complete: { from: 'returned', to: 'completed', who: 'owner' }
};

// ─── Perform Booking Action ───────────────────────────────────────────────────
async function performAction(bookingId, action, body, user) {
  let booking = await getDoc('bookings', bookingId);
  if (!booking) throw Object.assign(new Error('Booking not found'), { status: 404 });

  const userId = String(user.id);
  const ownerId = String(booking.ownerId);
  const borrowerId = String(booking.borrowerId);

  if (userId !== ownerId && userId !== borrowerId) {
    throw Object.assign(new Error('You do not have permission to modify this booking'), { status: 403 });
  }

  const item = await getDoc('items', booking.itemId);

  // Helper to push history entry
  const pushHistory = (status) => {
    booking.status = status;
    booking.history = [...(booking.history || []), { status, at: now(), by: user.id }];
  };

  if (action === 'cancel') {
    if (userId !== borrowerId) {
      throw Object.assign(new Error('Only the borrower who requested this item can cancel it'), { status: 403 });
    }
    if (!['requested', 'approved'].includes(booking.status)) {
      throw Object.assign(new Error('You cannot cancel this booking at this stage'), { status: 400 });
    }
    pushHistory('cancelled');
    await updateDoc('bookings', booking.id, booking);
    await notify(
      booking.ownerId,
      'cancel',
      `${user.name} cancelled their borrow request for "${item?.title || 'item'}"`,
      '#/activity'
    );
    return formatBookingView(booking, user.id);
  }

  if (action === 'dispute') {
    if (!['borrowed', 'returned'].includes(booking.status)) {
      throw Object.assign(
        new Error('Disputes can only be raised once an item is borrowed or returned'),
        { status: 400 }
      );
    }
    pushHistory('disputed');
    booking.disputeNote = body?.note || '';
    await updateDoc('bookings', booking.id, booking);
    const recipient = userId === ownerId ? booking.borrowerId : booking.ownerId;
    await notify(recipient, 'dispute', `${user.name} reported an issue with "${item?.title}"`, '#/activity');
    return formatBookingView(booking, user.id);
  }

  // ALL OTHER ACTIONS (accept, approve, decline, reject, ready, handover, return, complete) ARE OWNER-ONLY
  if (['approve', 'accept', 'decline', 'reject', 'ready', 'handover', 'return', 'complete'].includes(action)) {
    if (userId === borrowerId && userId !== ownerId) {
      const verb = ['approve', 'accept'].includes(action) ? 'accept or approve' : action;
      throw Object.assign(
        new Error(`Borrowers cannot ${verb} requests. Only the item owner (${item?.title || 'item'} owner) can perform this action.`),
        { status: 403 }
      );
    }
    if (userId !== ownerId) {
      throw Object.assign(new Error('Only the item owner can perform this action'), { status: 403 });
    }
  }

  if (['approve', 'accept'].includes(action)) {
    if (booking.status !== 'requested') {
      throw Object.assign(
        new Error(`Cannot accept a booking that is currently "${booking.status}"`),
        { status: 409 }
      );
    }

    // Use Firestore transaction to guard against double-booking
    await db.runTransaction(async (tx) => {
      const overlaps = await findBlockingBookings(booking.itemId, booking.start, booking.end, booking.id);
      if (overlaps.length > 0) {
        throw Object.assign(new Error('Selected dates overlap with another approved booking'), { status: 409 });
      }
      pushHistory('approved');
      tx.set(db.collection('bookings').doc(booking.id), booking);
      tx.set(
        db.collection('stats').doc(booking.itemId),
        { bookings: FieldValue.increment(1) },
        { merge: true }
      );
    });

    await notify(
      booking.borrowerId,
      'approve',
      `Great news! ${user.name} accepted your request to borrow "${item?.title || 'item'}"!`,
      '#/activity'
    );
    return formatBookingView(booking, user.id);
  }

  const rule = ACTION_RULES[action];
  if (!rule) throw Object.assign(new Error(`Unknown booking action: ${action}`), { status: 400 });

  const validFrom = Array.isArray(rule.from) ? rule.from : [rule.from];
  if (!validFrom.includes(booking.status)) {
    throw Object.assign(
      new Error(`Cannot ${action} a booking that is currently "${booking.status}"`),
      { status: 409 }
    );
  }

  pushHistory(rule.to);

  if (action === 'handover') {
    booking.checkoutAt = now();
  } else if (action === 'return') {
    booking.returnedAt = now();
    const dueTime = Date.parse(booking.dueAt);
    const overdueDays = Math.max(0, Math.ceil((Date.now() - dueTime) / 864e5));
    booking.lateDays = overdueDays;
    booking.lateFee = calculateLateFee(item?.price || 0, overdueDays);
  }

  await updateDoc('bookings', booking.id, booking);

  const notifications = {
    decline: `${user.name} declined your request for "${item?.title || 'item'}"`,
    reject: `${user.name} declined your request for "${item?.title || 'item'}"`,
    ready: `"${item?.title}" is marked ready for pickup! Coordinate handover with ${user.name}`,
    handover: `Handover confirmed for "${item?.title}". Enjoy! Return by ${booking.end}`,
    return: `${user.name} confirmed the return of "${item?.title}". Thank you!`,
    complete: `Rental completed for "${item?.title}". Deposit has been released!`
  };

  const notifyMsg = notifications[action];
  if (notifyMsg) {
    await notify(booking.borrowerId, action, notifyMsg, '#/activity');
  }

  return formatBookingView(booking, user.id);
}

// ─── Submit Review ────────────────────────────────────────────────────────────
async function submitReview(bookingId, body, user) {
  const booking = await getDoc('bookings', bookingId);
  if (!booking) throw Object.assign(new Error('Booking not found'), { status: 404 });
  if (![booking.ownerId, booking.borrowerId].includes(user.id)) {
    throw Object.assign(new Error('Only rental participants can leave a review'), { status: 403 });
  }
  if (!['returned', 'completed'].includes(booking.status)) {
    throw Object.assign(new Error('You can only leave a review after the item is returned'), { status: 400 });
  }

  const rating = Number(body.rating);
  if (!(rating >= 1 && rating <= 5)) {
    throw Object.assign(new Error('Rating must be between 1 and 5 stars'), { status: 400 });
  }

  const reviewedBy = booking.reviewedBy || [];
  if (reviewedBy.includes(user.id)) {
    throw Object.assign(new Error('You have already submitted a review for this booking'), { status: 409 });
  }

  // Update target user's aggregate rating
  const targetUserId = user.id === booking.ownerId ? booking.borrowerId : booking.ownerId;
  const targetUser = await getDoc('users', targetUserId);
  if (targetUser) {
    const prevRating = targetUser.rating || 0;
    const prevCount = targetUser.reviewCount || 0;
    await updateDoc('users', targetUserId, {
      rating: Number(((prevRating * prevCount + rating) / (prevCount + 1)).toFixed(2)),
      reviewCount: prevCount + 1
    });
  }

  // Store item review in sub-collection
  if (user.id === booking.borrowerId) {
    const clampRating = (val) => Math.min(5, Math.max(1, Number(val) || rating));
    const reviewRecord = {
      id: uid('r_'),
      itemId: booking.itemId,
      bookingId: booking.id,
      reviewerId: user.id,
      reviewerName: user.name,
      rating,
      condition: clampRating(body.condition),
      accuracy: clampRating(body.accuracy),
      communication: clampRating(body.communication),
      pickup: clampRating(body.pickup),
      text: String(body.text || '').slice(0, 800),
      createdAt: now()
    };
    await db
      .collection('items')
      .doc(booking.itemId)
      .collection('reviews')
      .doc(reviewRecord.id)
      .set(reviewRecord);
  }

  await updateDoc('bookings', booking.id, {
    reviewedBy: FieldValue.arrayUnion(user.id)
  });

  return { ok: true };
}

module.exports = {
  getQuote,
  createBooking,
  getUserBookings,
  performAction,
  submitReview,
  formatBookingView
};
