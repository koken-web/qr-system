import { DB_STORES, getDatabase } from "./db";

export type OfflineDeviceAccessSnapshot = {
  uid: string;
  device: {
    uid: string;
    role: "member" | "reception" | "control";
    displayName: string;
    deviceName: string;
    deviceType:
      | "ipad"
      | "iphone"
      | "android"
      | "windows"
      | "mac"
      | "other"
      | "unknown";
    active: boolean;
    createdAt: string;
    approvedAt: string;
    approvedByUid: string;
    approvedByName: string;
  };
  savedAt: number;
};

const SNAPSHOT_ID = "current";

function createSnapshotStore(database: IDBDatabase): void {
  if (database.objectStoreNames.contains("deviceAccessSnapshots")) {
    return;
  }

  database.createObjectStore("deviceAccessSnapshots", {
    keyPath: "id",
  });
}

async function ensureSnapshotStore(): Promise<IDBDatabase> {
  const database = await getDatabase();

  if (database.objectStoreNames.contains("deviceAccessSnapshots")) {
    return database;
  }

  database.close();
  const request = indexedDB.open("QRManagementDB", 4);

  return new Promise((resolve, reject) => {
    request.onupgradeneeded = () => {
      createSnapshotStore(request.result);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ??
          new Error("Failed to upgrade IndexedDB."),
      );
  });
}

export async function saveDeviceAccessSnapshot(
  snapshot: OfflineDeviceAccessSnapshot,
): Promise<void> {
  if (!snapshot.uid || !snapshot.device.active) {
    return;
  }

  const database = await ensureSnapshotStore();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      "deviceAccessSnapshots",
      "readwrite",
    );
    const store = transaction.objectStore(
      "deviceAccessSnapshots",
    );

    store.put({
      id: SNAPSHOT_ID,
      ...snapshot,
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error ??
          new Error("Failed to save device access snapshot."),
      );
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new Error("Device access snapshot transaction aborted."),
      );
  });
}

export async function getDeviceAccessSnapshot(): Promise<OfflineDeviceAccessSnapshot | null> {
  try {
    const database = await getDatabase();

    if (!database.objectStoreNames.contains("deviceAccessSnapshots")) {
      return null;
    }

    return await new Promise<OfflineDeviceAccessSnapshot | null>(
      (resolve, reject) => {
        const transaction = database.transaction(
          "deviceAccessSnapshots",
          "readonly",
        );
        const request = transaction
          .objectStore("deviceAccessSnapshots")
          .get(SNAPSHOT_ID);

        request.onsuccess = () => {
          resolve(
            (request.result as
              | OfflineDeviceAccessSnapshot
              | undefined) ?? null,
          );
        };
        request.onerror = () =>
          reject(
            request.error ??
              new Error("Failed to read device access snapshot."),
          );
      },
    );
  } catch {
    return null;
  }
}

export async function clearDeviceAccessSnapshot(): Promise<void> {
  try {
    const database = await getDatabase();

    if (!database.objectStoreNames.contains("deviceAccessSnapshots")) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        "deviceAccessSnapshots",
        "readwrite",
      );
      transaction.objectStore("deviceAccessSnapshots").delete(
        SNAPSHOT_ID,
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ??
            new Error("Failed to clear device access snapshot."),
        );
    });
  } catch {
    // The snapshot is only an offline fallback. Ignore cleanup failures.
  }
}

void DB_STORES;
