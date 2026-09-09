import { DB_STORES, getDatabase } from "./db";
import type { Device } from "./types";

function requestToPromise<T>(
  request: IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(
        request.error ??
          new Error("IndexedDB request failed."),
      );
    };
  });
}

export async function saveDevice(
  device: Device,
): Promise<void> {
  const database = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      DB_STORES.devices,
      "readwrite",
    );
    const store = transaction.objectStore(
      DB_STORES.devices,
    );

    store.put(device);

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error("Failed to save device."),
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ??
          new Error("Device save transaction was aborted."),
      );
    };
  });
}

export async function getDevice(
  deviceId: string,
): Promise<Device | undefined> {
  const database = await getDatabase();
  const transaction = database.transaction(
    DB_STORES.devices,
    "readonly",
  );
  const store = transaction.objectStore(
    DB_STORES.devices,
  );

  return requestToPromise(
    store.get(deviceId),
  );
}

export async function getDevices(
  eventId?: string,
): Promise<Device[]> {
  const database = await getDatabase();
  const transaction = database.transaction(
    DB_STORES.devices,
    "readonly",
  );
  const store = transaction.objectStore(
    DB_STORES.devices,
  );

  if (!eventId) {
    return requestToPromise(
      store.getAll(),
    );
  }

  const index = store.index("eventId");

  return requestToPromise(
    index.getAll(eventId),
  );
}

export async function updateDeviceStatus(
  deviceId: string,
  status: Device["status"],
  lastSeenAt?: number,
): Promise<void> {
  const database = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      DB_STORES.devices,
      "readwrite",
    );
    const store = transaction.objectStore(
      DB_STORES.devices,
    );
    const request = store.get(deviceId);

    request.onsuccess = () => {
      const device = request.result as
        | Device
        | undefined;

      if (!device) {
        transaction.abort();
        reject(
          new Error("Device was not found."),
        );
        return;
      }

      device.status = status;
      device.updatedAt = Date.now();

      if (lastSeenAt !== undefined) {
        device.lastSeenAt = lastSeenAt;
      }

      store.put(device);
    };

    request.onerror = () => {
      reject(
        request.error ??
          new Error("Failed to read device."),
      );
    };

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error("Failed to update device status."),
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ??
          new Error("Device status transaction was aborted."),
      );
    };
  });
}
