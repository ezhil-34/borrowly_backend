/**
 * migrate-to-cloud.js
 * Migrates data from local .firebase_local/firestore_store.json to real Cloud Firestore.
 * Run AFTER placing serviceAccountKey.json in the project root.
 *
 * Usage: node server/migrate-to-cloud.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const storeFile = path.join(__dirname, '../.firebase_local/firestore_store.json');

if (!fs.existsSync(storeFile)) {
  console.log('❌ No local data file found at .firebase_local/firestore_store.json');
  console.log('   Run the seed first: npm.cmd run seed');
  process.exit(1);
}

const keyPath = path.join(__dirname, '../serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('❌ serviceAccountKey.json not found in project root.');
  console.error('   Download it from Firebase Console → Project Settings → Service Accounts');
  process.exit(1);
}

// Force real Firebase (not local emulator)
process.env.FORCE_REAL_FIREBASE = 'true';

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
}

const cloudDb = getFirestore();

async function migrate() {
  const localStore = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const collections = Object.keys(localStore);

  console.log(`\n🔥 Migrating to Firebase project: ${serviceAccount.project_id}`);
  console.log(`📦 Collections found: ${collections.join(', ')}\n`);

  for (const colName of collections) {
    const docs = localStore[colName];
    const docIds = Object.keys(docs);

    if (!docIds.length) continue;

    console.log(`  ↑ ${colName} (${docIds.length} docs)...`);

    // Write in batches of 499
    const BATCH_SIZE = 499;
    for (let i = 0; i < docIds.length; i += BATCH_SIZE) {
      const batch = cloudDb.batch();
      const chunk = docIds.slice(i, i + BATCH_SIZE);
      for (const docId of chunk) {
        batch.set(cloudDb.collection(colName).doc(docId), docs[docId]);
      }
      await batch.commit();
    }

    console.log(`  ✓ ${colName} done`);
  }

  // Migrate nested sub-collections (e.g. items/{id}/reviews stored as items/id/reviews in flat key)
  const nestedCollections = Object.keys(localStore).filter(k => k.includes('/'));
  if (nestedCollections.length) {
    console.log('\n📂 Migrating sub-collections...');
    for (const nestedKey of nestedCollections) {
      const parts = nestedKey.split('/'); // e.g. "items/i_1/reviews"
      if (parts.length !== 3) continue;
      const [parentCol, parentId, subCol] = parts;
      const docs = localStore[nestedKey];
      const docIds = Object.keys(docs);
      if (!docIds.length) continue;

      console.log(`  ↑ ${nestedKey} (${docIds.length} docs)...`);
      const batch = cloudDb.batch();
      for (const docId of docIds) {
        batch.set(
          cloudDb.collection(parentCol).doc(parentId).collection(subCol).doc(docId),
          docs[docId]
        );
      }
      await batch.commit();
      console.log(`  ✓ ${nestedKey} done`);
    }
  }

  console.log('\n✅ Migration complete! All local data is now in Cloud Firestore.');
  console.log(`🔗 View it at: https://console.firebase.google.com/project/${serviceAccount.project_id}/firestore`);
}

migrate().catch(err => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
