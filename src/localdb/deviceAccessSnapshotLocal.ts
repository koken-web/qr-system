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

export async function saveDeviceAccessSnapshot(
  snapshot: OfflineDeviceAccessSnapshot,
): Promise<void> {
  if (!snapshot.uid || !snapshot.device.active) {
    return;
  }

  const database = await getDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      DB_STORES.deviceAccessSnapshots,
      "readwrite",
    );
    const store = transaction.objectStore(
      DB_STORES.deviceAccessSnapshots,
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

    return await new Promise<OfflineDeviceAccessSnapshot | null>(
      (resolve, reject) => {
        const transaction = database.transaction(
          DB_STORES.deviceAccessSnapshots,
          "readonly",
        );
        const request = transaction
          .objectStore(DB_STORES.deviceAccessSnapshots)
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

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        DB_STORES.deviceAccessSnapshots,
        "readwrite",
      );
      transaction.objectStore(DB_STORES.deviceAccessSnapshots).delete(
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
