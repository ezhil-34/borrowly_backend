/**
 * Firebase Firestore Connection & Database Abstraction
 * Supports:
 *  1. Google Cloud Firebase Admin with serviceAccountKey.json
 *  2. Environment credentials (FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
 *  3. Local Firestore Emulator (FIRESTORE_EMULATOR_HOST)
 *  4. Built-in zero-config persistent local Firestore engine for instant offline development
 *
 * firebase-admin v14 API:
 *  - cert() is a top-level named export (not admin.credential.cert)
 *  - getFirestore() is used instead of admin.firestore()
 *  - FieldValue comes from the Firestore instance
 */
const fs = require('fs');
const path = require('path');
// firebase-admin v14 uses named exports
const { initializeApp, getApps, cert, getApp } = require('firebase-admin/app');
const { getFirestore, FieldValue: CloudFieldValue } = require('firebase-admin/firestore');
const config = require('./config');

let db;
let isEmulatedLocal = false;

// Check for service account file
const defaultKeyPath = path.join(__dirname, '../../serviceAccountKey.json');
const customKeyPath = config.firebase.serviceAccountPath
  ? path.resolve(config.firebase.serviceAccountPath)
  : null;
const keyPathToUse = customKeyPath && fs.existsSync(customKeyPath)
  ? customKeyPath
  : fs.existsSync(defaultKeyPath)
  ? defaultKeyPath
  : null;

try {
  if (getApps().length === 0) {
    if (keyPathToUse) {
      const serviceAccount = JSON.parse(fs.readFileSync(keyPathToUse, 'utf8'));
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || config.firebase.projectId
      });
      db = getFirestore();
      console.log(`[Firebase] ✅ Connected to Cloud Firestore — project: ${serviceAccount.project_id}`);
      console.log(`[Firebase] Service Account: ${path.basename(keyPathToUse)}`);
    } else if (config.firebase.clientEmail && config.firebase.privateKey) {
      initializeApp({
        credential: cert({
          projectId: config.firebase.projectId,
          clientEmail: config.firebase.clientEmail,
          privateKey: config.firebase.privateKey
        })
      });
      db = getFirestore();
      console.log(`[Firebase] ✅ Connected to Cloud Firestore — project: ${config.firebase.projectId}`);
    } else if (process.env.FIRESTORE_EMULATOR_HOST) {
      initializeApp({ projectId: config.firebase.projectId });
      db = getFirestore();
      console.log(`[Firebase] Connected to Firestore Emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
    } else {
      // Offline local Firestore-compatible store
      isEmulatedLocal = true;
      db = createLocalFirestore();
      console.log('[Firebase] Running in Local Firestore Mode (No cloud credentials detected).');
      console.log('           Tip: Place your serviceAccountKey.json in the project root to connect to Cloud Firestore.');
    }
  } else {
    db = getFirestore(getApp());
  }
} catch (err) {
  console.warn('[Firebase] Warning initializing Cloud Firebase:', err.message);
  console.log('[Firebase] Falling back to Local Firestore Engine.');
  isEmulatedLocal = true;
  db = createLocalFirestore();
}

/**
 * Creates an in-process, persistent local Firestore engine mirroring the Firestore API
 */
function createLocalFirestore() {
  const dataDir = path.join(__dirname, '../../.firebase_local');
  if (!fs.existsSync(dataDir)) {
    try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
  }
  const storeFile = path.join(dataDir, 'firestore_store.json');

  let store = {};
  if (fs.existsSync(storeFile)) {
    try { store = JSON.parse(fs.readFileSync(storeFile, 'utf8')); } catch { store = {}; }
  }

  const persist = () => {
    try {
      fs.writeFileSync(storeFile, JSON.stringify(store, null, 2), 'utf8');
    } catch {}
  };

  const getCollection = (colName) => {
    if (!store[colName]) store[colName] = {};
    return store[colName];
  };

  class LocalDocumentReference {
    constructor(colName, docId) {
      this.colName = colName;
      this.id = docId;
    }

    /** Support nested sub-collections: doc.collection('messages') */
    collection(subColName) {
      return new LocalCollectionReference(`${this.colName}/${this.id}/${subColName}`);
    }

    async get() {
      const col = getCollection(this.colName);
      const data = col[this.id];
      return {
        id: this.id,
        exists: !!data,
        data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
      };
    }

    async set(data, options = {}) {
      const col = getCollection(this.colName);
      if (options.merge && col[this.id]) {
        col[this.id] = { ...col[this.id], ...JSON.parse(JSON.stringify(data)) };
      } else {
        col[this.id] = JSON.parse(JSON.stringify(data));
      }
      persist();
      return { writeTime: new Date() };
    }

    async update(data) {
      const col = getCollection(this.colName);
      if (!col[this.id]) {
        // Create doc if missing (Firestore update on non-existent doc throws, but we soft-create here)
        col[this.id] = {};
      }
      for (const [key, val] of Object.entries(data)) {
        if (val && typeof val === 'object' && val.__increment !== undefined) {
          col[this.id][key] = (Number(col[this.id][key]) || 0) + val.__increment;
        } else if (val && typeof val === 'object' && val.__arrayUnion !== undefined) {
          const current = Array.isArray(col[this.id][key]) ? col[this.id][key] : [];
          col[this.id][key] = [...new Set([...current, ...val.__arrayUnion])];
        } else if (val && typeof val === 'object' && val.__arrayRemove !== undefined) {
          const current = Array.isArray(col[this.id][key]) ? col[this.id][key] : [];
          const removeSet = new Set(val.__arrayRemove);
          col[this.id][key] = current.filter((x) => !removeSet.has(x));
        } else {
          col[this.id][key] = JSON.parse(JSON.stringify(val));
        }
      }
      persist();
      return { writeTime: new Date() };
    }

    async delete() {
      const col = getCollection(this.colName);
      delete col[this.id];
      persist();
      return { writeTime: new Date() };
    }
  }

  class LocalQuery {
    constructor(colName, filters = [], sortField = null, sortDir = 'asc', limitCount = null) {
      this.colName = colName;
      this.filters = filters;
      this.sortField = sortField;
      this.sortDir = sortDir;
      this.limitCount = limitCount;
    }

    where(field, op, val) {
      return new LocalQuery(
        this.colName,
        [...this.filters, { field, op, val }],
        this.sortField,
        this.sortDir,
        this.limitCount
      );
    }

    orderBy(field, dir = 'asc') {
      return new LocalQuery(this.colName, this.filters, field, dir, this.limitCount);
    }

    limit(n) {
      return new LocalQuery(this.colName, this.filters, this.sortField, this.sortDir, n);
    }

    async get() {
      const col = getCollection(this.colName);
      let docs = Object.entries(col).map(([id, data]) => ({
        id,
        exists: true,
        data: () => JSON.parse(JSON.stringify(data))
      }));

      // Apply where filters
      for (const { field, op, val } of this.filters) {
        docs = docs.filter((d) => {
          const data = d.data();
          const target = data[field];
          if (op === '==') return target === val;
          if (op === '!=') return target !== val;
          if (op === '<') return target < val;
          if (op === '<=') return target <= val;
          if (op === '>') return target > val;
          if (op === '>=') return target >= val;
          if (op === 'array-contains') return Array.isArray(target) && target.includes(val);
          if (op === 'in') return Array.isArray(val) && val.includes(target);
          return true;
        });
      }

      // Apply sort
      if (this.sortField) {
        docs.sort((a, b) => {
          const valA = a.data()[this.sortField];
          const valB = b.data()[this.sortField];
          if (valA === valB) return 0;
          const cmp = valA > valB ? 1 : -1;
          return this.sortDir === 'desc' ? -cmp : cmp;
        });
      }

      // Apply limit
      if (this.limitCount != null) {
        docs = docs.slice(0, this.limitCount);
      }

      return {
        docs,
        empty: docs.length === 0,
        size: docs.length,
        forEach: (fn) => docs.forEach(fn)
      };
    }
  }

  class LocalCollectionReference extends LocalQuery {
    constructor(colName) {
      super(colName);
    }

    doc(id) {
      const docId = id || 'doc_' + Math.random().toString(36).slice(2, 10);
      return new LocalDocumentReference(this.colName, docId);
    }

    async add(data) {
      const docId = 'doc_' + Math.random().toString(36).slice(2, 10);
      const docRef = this.doc(docId);
      await docRef.set(data);
      return docRef;
    }
  }

  return {
    collection: (colName) => new LocalCollectionReference(colName),
    runTransaction: async (updateFunction) => {
      const transaction = {
        get: async (docRef) => docRef.get(),
        set: (docRef, data, options) => docRef.set(data, options),
        update: (docRef, data) => docRef.update(data),
        delete: (docRef) => docRef.delete()
      };
      return updateFunction(transaction);
    },
    batch: () => {
      const ops = [];
      return {
        set: (ref, data, opt) => ops.push(() => ref.set(data, opt)),
        update: (ref, data) => ops.push(() => ref.update(data)),
        delete: (ref) => ops.push(() => ref.delete()),
        commit: async () => {
          for (const op of ops) await op();
        }
      };
    },
    // Helper to clear collections during seed
    _clearAll: () => {
      store = {};
      persist();
    }
  };
}

const FieldValue = {
  increment: (n) => (isEmulatedLocal ? { __increment: n } : CloudFieldValue.increment(n)),
  arrayUnion: (...elements) =>
    isEmulatedLocal ? { __arrayUnion: elements } : CloudFieldValue.arrayUnion(...elements),
  arrayRemove: (...elements) =>
    isEmulatedLocal ? { __arrayRemove: elements } : CloudFieldValue.arrayRemove(...elements),
  serverTimestamp: () => (isEmulatedLocal ? new Date().toISOString() : CloudFieldValue.serverTimestamp())
};

module.exports = {
  db,
  FieldValue,
  isEmulatedLocal
};
