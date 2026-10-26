/**
 * Demo Data Seeder for Borrowly (Firebase Edition)
 * Seeds demo users, categorized listings, and starter reviews into Firestore.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, isEmulatedLocal } = require('./common/firebase');

const img = (keyword, n) =>
  [1, 2, 3].map((i) => `https://loremflickr.com/800/600/${keyword}?lock=${n * 10 + i}`);

const CHENNAI_AREAS = {
  Adyar: [13.0067, 80.2574],
  'T. Nagar': [13.0418, 80.2341],
  Velachery: [12.9815, 80.218],
  'Anna Nagar': [13.085, 80.2101],
  Guindy: [13.0067, 80.2206],
  Tambaram: [12.9249, 80.1]
};

const SEED_USERS = [
  ['u_demo', 'Demo Borrower', 'demo@borrowly.app', 11, 'Adyar', 0, 0],
  ['u_arun', 'Arun Kumar', 'arun@example.com', 12, 'Adyar', 4.8, 31],
  ['u_meera', 'Meera Iyer', 'meera@example.com', 47, 'T. Nagar', 4.9, 54],
  ['u_karthik', 'Karthik R', 'karthik@example.com', 33, 'Velachery', 4.6, 19],
  ['u_divya', 'Divya S', 'divya@example.com', 45, 'Anna Nagar', 4.7, 26],
  ['u_naveen', 'Naveen P', 'naveen@example.com', 15, 'Guindy', 4.5, 8],
  ['u_sana', 'Sana Farooq', 'sana@example.com', 20, 'Tambaram', 0, 0]
];

const SEED_ITEMS = [
  ['Canon EOS R50 Camera', 'Cameras & Photography', 'Canon', 'Like new', 450, 3000, 'u_arun', 'camera',
    'Mirrorless 24MP camera with 18-45mm kit lens, two batteries and a 64GB card. Great for travel and events.',
    ['Kit lens', '2 batteries', '64GB SD card', 'Strap'], 120, 14],
  ['Cordless Drill Machine', 'Tools & DIY', 'Bosch', 'Good', 120, 500, 'u_karthik', 'drill',
    '18V cordless drill with two batteries and a 30-piece bit set. Clean, well maintained.',
    ['2 batteries', 'Charger', 'Bit set'], 60, 9],
  ['Camping Tent for 3 People', 'Travel & Camping', 'Quechua', 'Good', 250, 800, 'u_meera', 'tent',
    'Waterproof 3-person tent, sets up in 5 minutes. Rain fly and pegs included.',
    ['Rain fly', 'Pegs', 'Carry bag'], 90, 11],
  ['Badminton Racket Set', 'Sports & Fitness', 'Yonex', 'Good', 80, 200, 'u_divya', 'badminton',
    'Two Yonex rackets with a shuttle tube and a carry bag.',
    ['2 rackets', '6 shuttles', 'Carry bag'], 40, 6],
  ['Projector with Screen', 'Electronics', 'Epson', 'Good', 350, 2000, 'u_arun', 'projector',
    'Full HD projector with 100-inch tripod screen and HDMI cable. Movie nights and presentations.',
    ['Tripod screen', 'HDMI cable', 'Remote'], 70, 8],
  ['Portable Pressure Washer', 'Home & Kitchen', 'Karcher', 'Good', 200, 1000, 'u_karthik', 'washer',
    'Compact pressure washer for cars, bikes and balconies. Hose and nozzles included.',
    ['5 m hose', '2 nozzles'], 55, 5],
  ['Party Speaker with Mic', 'Events & Party Supplies', 'JBL', 'Good', 300, 1500, 'u_divya', 'speaker',
    'Loud Bluetooth party speaker with wireless mic and light bar.',
    ['Wireless mic', 'Charger'], 45, 7],
  ['UPSC & Engineering Textbook Bundle', 'Books & Study', 'Assorted', 'Fair', 30, 0, 'u_naveen', 'books',
    'Bundle of 8 reference textbooks. Light highlighting in a few chapters.',
    ['8 books'], 20, 3]
];

const SEED_REVIEWS = [
  [0, 5, 'Camera was spotless, like new. Easy pickup and Arun was on time. Great value for a weekend trip.'],
  [0, 5, 'Well maintained, both batteries fully charged. Smooth return.'],
  [0, 4, 'Good value. Description could be more accurate about the lens size.'],
  [2, 5, 'Tent was clean and dry. Easy pickup, friendly owner.'],
  [2, 4, 'Worth the price. Small scratch on the bag but nothing serious.'],
  [2, 5, 'Works perfectly, set up in minutes. Good value.'],
  [1, 5, 'Drill works great, batteries well maintained.'],
  [1, 4, 'Easy return, friendly. Missing one bit from the set.']
];

async function seed(force = false) {
  // Check if data already exists
  if (!force) {
    const snap = await db.collection('items').limit(1).get();
    if (!snap.empty) {
      console.log('ℹ️  Data already seeded. Use --force to re-seed.');
      return false;
    }
  }

  // Clear existing data if force
  if (force) {
    console.log('🗑️  Clearing existing data...');
    if (isEmulatedLocal && db._clearAll) {
      db._clearAll();
    } else {
      const collections = ['users', 'items', 'bookings', 'stats', 'events', 'reports'];
      for (const col of collections) {
        const snap = await db.collection(col).get();
        const batch = db.batch();
        snap.docs.forEach((doc) => batch.delete(doc.ref));
        if (!snap.empty) await batch.commit();
      }
    }
    console.log('✓ Cleared existing data');
  }

  const defaultPasswordHash = await bcrypt.hash('demo1234', 8);
  const timestamp = new Date().toISOString();

  // ── Seed Users ──────────────────────────────────────────────────────────────
  console.log('👤 Seeding users...');
  const userBatch = db.batch();
  for (const [id, name, email, avatarId, area, rating, count] of SEED_USERS) {
    userBatch.set(db.collection('users').doc(id), {
      id,
      name,
      email,
      password: defaultPasswordHash,
      avatar: `https://i.pravatar.cc/96?img=${avatarId}`,
      area,
      rating,
      reviewCount: count,
      since: '2025-03-01',
      savedItems: [],
      viewedItems: [],
      demo: true
    });
  }
  await userBatch.commit();

  // ── Seed Items & Stats ──────────────────────────────────────────────────────
  console.log('📦 Seeding items...');
  const createdItemIds = [];
  for (let n = 0; n < SEED_ITEMS.length; n++) {
    const [title, category, brand, condition, price, deposit, ownerId, keyword, description, accessories, views, saves] =
      SEED_ITEMS[n];

    const ownerArea = SEED_USERS.find((u) => u[0] === ownerId)[4];
    const [lat, lng] = CHENNAI_AREAS[ownerArea];
    const itemId = `i_${n + 1}`;

    await db.collection('items').doc(itemId).set({
      id: itemId,
      title,
      category,
      brand,
      condition,
      price,
      deposit,
      ownerId,
      description,
      accessories,
      images: img(keyword, n + 1),
      area: ownerArea,
      lat: Number((lat + (n % 3) * 0.004).toFixed(4)),
      lng: Number((lng + (n % 2) * 0.004).toFixed(4)),
      minDays: 1,
      maxDays: 14,
      delivery: n % 2 === 0,
      rules: ['Return clean and in the same condition', 'No sub-lending'],
      cancellation: 'Free cancellation up to 24 hours before pickup',
      lateFeeNote: 'Late returns are charged at 1.5× the daily rate per overdue day',
      status: 'active',
      createdAt: timestamp,
      demo: true,
      meetingDetails: `Meet at the lobby of the ${ownerArea} apartment complex; owner will share the flat number in chat.`
    });

    await db.collection('stats').doc(itemId).set({
      views,
      saves,
      bookings: 1 + (n % 4)
    });

    createdItemIds.push(itemId);
  }

  // ── Seed Reviews ────────────────────────────────────────────────────────────
  console.log('⭐ Seeding reviews...');
  let reviewCounter = 0;
  for (const [itemIndex, rating, text] of SEED_REVIEWS) {
    const reviewId = `r_${++reviewCounter}`;
    const targetItemId = createdItemIds[itemIndex];
    await db
      .collection('items')
      .doc(targetItemId)
      .collection('reviews')
      .doc(reviewId)
      .set({
        id: reviewId,
        itemId: targetItemId,
        reviewerId: 'u_sana',
        reviewerName: 'Sana Farooq',
        rating,
        condition: rating,
        accuracy: rating,
        communication: 5,
        pickup: 5,
        text,
        createdAt: timestamp,
        demo: true
      });
  }

  console.log('\n✅ Demo data seeded successfully!');
  console.log('🔑 Demo Login: demo@borrowly.app / demo1234');
  return true;
}

module.exports = { seed };

if (require.main === module) {
  seed(process.argv.includes('--force'))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Seed failed:', err.message);
      process.exit(1);
    });
}
