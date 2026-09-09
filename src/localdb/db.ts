const DB_NAME = "QRManagementDB";
const DB_VERSION = 2;

export const DB_STORES = {
  events: "events",
  tickets: "tickets",
  members: "members",
  devices: "devices",
  receptionEvents: "receptionEvents",
  activities: "activities",
  syncQueue: "syncQueue",
} as const;

type StoreName =
  (typeof DB_STORES)[keyof typeof DB_STORES];

let databasePromise: Promise<IDBDatabase> | null = null;

function createStore(
  database: IDBDatabase,
  name: StoreName,
  options: IDBObjectStoreParameters,
): IDBObjectStore {
  return database.createObjectStore(name, options);
}

function createIndexes(
  store: IDBObjectStore,
  indexes: Array<{
    name: string;
    keyPath: string | string[];
    options?: IDBIndexParameters;
  }>,
): void {
  for (const index of indexes) {
    store.createIndex(
      index.name,
      index.keyPath,
      index.options,
    );
  }
}

function upgradeDatabase(
  database: IDBDatabase,
  upgradeTransaction: IDBTransaction,
  oldVersion: number,
): void {
  if (oldVersion < 1) {
    createStore(database, DB_STORES.events, {
      keyPath: "id",
    });

    const tickets = createStore(
      database,
      DB_STORES.tickets,
      { keyPath: "id" },
    );
    createIndexes(tickets, [
      { name: "eventId", keyPath: "eventId" },
      {
        name: "qrToken",
        keyPath: "qrToken",
        options: { unique: true },
      },
    ]);

    const members = createStore(
      database,
      DB_STORES.members,
      { keyPath: "id" },
    );
    createIndexes(members, [
      { name: "eventId", keyPath: "eventId" },
      {
        name: "qrToken",
        keyPath: "qrToken",
        options: { unique: true },
      },
    ]);

    const devices = createStore(
      database,
      DB_STORES.devices,
      { keyPath: "id" },
    );
    createIndexes(devices, [
      { name: "eventId", keyPath: "eventId" },
    ]);

    const receptionEvents = createStore(
      database,
      DB_STORES.receptionEvents,
      { keyPath: "id" },
    );
    createIndexes(receptionEvents, [
      { name: "eventId", keyPath: "eventId" },
      { name: "ticketId", keyPath: "ticketId" },
      { name: "timestamp", keyPath: "timestamp" },
      {
        name: "eventId_ticketId",
        keyPath: ["eventId", "ticketId"],
      },
    ]);

    const activities = createStore(
      database,
      DB_STORES.activities,
      { keyPath: "id" },
    );
    createIndexes(activities, [
      { name: "eventId", keyPath: "eventId" },
      { name: "timestamp", keyPath: "timestamp" },
      {
        name: "eventId_timestamp",
        keyPath: ["eventId", "timestamp"],
      },
    ]);

    const syncQueue = createStore(
      database,
      DB_STORES.syncQueue,
      { keyPath: "id" },
    );
    createIndexes(syncQueue, [
      { name: "eventId", keyPath: "eventId" },
      { name: "status", keyPath: "status" },
      { name: "createdAt", keyPath: "createdAt" },
      {
        name: "status_createdAt",
        keyPath: ["status", "createdAt"],
      },
    ]);
  }

  if (oldVersion < 2) {
    const tickets = upgradeTransaction.objectStore(
      DB_STORES.tickets,
    );

    if (!tickets.indexNames.contains("eventId_qrNumber")) {
      tickets.createIndex(
        "eventId_qrNumber",
        ["eventId", "qrNumber"],
      );
    }
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("IndexedDB is not supported."),
    );
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      DB_NAME,
      DB_VERSION,
    );

    request.onupgradeneeded = (event) => {
      const upgradeTransaction = request.transaction;

      if (!upgradeTransaction) {
        reject(
          new Error("IndexedDB upgrade transaction is unavailable."),
        );
        return;
      }

      upgradeDatabase(
        request.result,
        upgradeTransaction,
        event.oldVersion,
      );
    };

    request.onsuccess = () => {
      const database = request.result;

      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };

      resolve(database);
    };

    request.onerror = () => {
      reject(
        request.error ??
          new Error("Failed to open IndexedDB."),
      );
    };

    request.onblocked = () => {
      reject(
        new Error("IndexedDB upgrade is blocked."),
      );
    };
  });
}

export function getDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabase().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }

  return databasePromise;
}

export async function closeDatabase(): Promise<void> {
  if (!databasePromise) {
    return;
  }

  const database = await databasePromise.catch(() => null);
  database?.close();
  databasePromise = null;
}

export { DB_NAME, DB_VERSION };
