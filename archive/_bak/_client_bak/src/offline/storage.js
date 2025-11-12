const DB_NAME = "glass-frontier-offline";
const DB_VERSION = 1;

const STORES = {
  sessionState: "sessionState",
  intents: "intents"
};

let dbPromise = null;

function hasIndexedDBSupport() {
  return typeof indexedDB !== "undefined";
}

function openDatabase() {
  if (!hasIndexedDBSupport()) {
    return Promise.resolve(null);
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.sessionState)) {
        db.createObjectStore(STORES.sessionState, { keyPath: "sessionId" });
      }
      if (!db.objectStoreNames.contains(STORES.intents)) {
        const intentsStore = db.createObjectStore(STORES.intents, {
          keyPath: "id",
          autoIncrement: true
        });
        intentsStore.createIndex("bySessionId", "sessionId", { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
      };
      resolve(db);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });

  return dbPromise;
}

function transactionPromise(db, storeName, mode, handler) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    try {
      result = handler(store, transaction);
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}

function getDefaultSessionState(sessionId) {
  return {
    sessionId,
    messages: [],
    markers: [],
    overlay: null,
    recentChecks: [],
    activeCheck: null,
    updatedAt: Date.now(),
    queuedIntentCount: 0
  };
}

export async function loadSessionSnapshot(sessionId) {
  const db = await openDatabase();
  if (!db) {
    return { state: null, queuedIntents: [] };
  }

  const state = await transactionPromise(
    db,
    STORES.sessionState,
    "readonly",
    (store) =>
      new Promise((resolve, reject) => {
        const request = store.get(sessionId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      })
  );

  const intents = await transactionPromise(
    db,
    STORES.intents,
    "readonly",
    (store) =>
      new Promise((resolve, reject) => {
        const index = store.index("bySessionId");
        const request = index.getAll(IDBKeyRange.only(sessionId));
        request.onsuccess = () => {
          const records = Array.isArray(request.result) ? request.result.slice() : [];
          records.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          resolve(records);
        };
        request.onerror = () => reject(request.error);
      })
  );

  return {
    state,
    queuedIntents: intents
  };
}

export async function persistSessionState(sessionId, partial) {
  const db = await openDatabase();
  if (!db) {
    return null;
  }

  return transactionPromise(db, STORES.sessionState, "readwrite", (store) => {
    const request = store.get(sessionId);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const existing = request.result || getDefaultSessionState(sessionId);
        const next = {
          ...existing,
          ...partial,
          sessionId,
          updatedAt: Date.now()
        };
        const putRequest = store.put(next);
        putRequest.onsuccess = () => resolve(next);
        putRequest.onerror = () => reject(putRequest.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function enqueueIntent(sessionId, payload) {
  const db = await openDatabase();
  if (!db) {
    return null;
  }

  return transactionPromise(db, STORES.intents, "readwrite", (store) => {
    const record = {
      sessionId,
      payload,
      createdAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const request = store.add(record);
      request.onsuccess = () => {
        resolve({
          ...record,
          id: request.result
        });
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function removeQueuedIntent(intentId) {
  const db = await openDatabase();
  if (!db) {
    return false;
  }

  return transactionPromise(db, STORES.intents, "readwrite", (store) => {
    return new Promise((resolve, reject) => {
      const request = store.delete(intentId);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  });
}

export async function clearQueuedIntents(sessionId) {
  const db = await openDatabase();
  if (!db) {
    return 0;
  }

  return transactionPromise(db, STORES.intents, "readwrite", (store) => {
    const index = store.index("bySessionId");
    const range = IDBKeyRange.only(sessionId);
    return new Promise((resolve, reject) => {
      const request = index.openCursor(range);
      let removed = 0;

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(removed);
          return;
        }
        cursor.delete();
        removed += 1;
        cursor.continue();
      };

      request.onerror = () => reject(request.error);
    });
  });
}

export function offlineStorageAvailable() {
  return hasIndexedDBSupport();
}
