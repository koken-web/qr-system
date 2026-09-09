import { DB_STORES, getDatabase } from "./db";
import type { Activity } from "./types";

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

export async function saveActivity(
  activity: Activity,
): Promise<void> {
  const database = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      DB_STORES.activities,
      "readwrite",
    );
    const store = transaction.objectStore(
      DB_STORES.activities,
    );

    store.add(activity);

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error("Failed to save activity."),
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ??
          new Error("Activity save transaction was aborted."),
      );
    };
  });
}

export async function getActivities(
  eventId: string,
): Promise<Activity[]> {
  const database = await getDatabase();
  const transaction = database.transaction(
    DB_STORES.activities,
    "readonly",
  );
  const store = transaction.objectStore(
    DB_STORES.activities,
  );
  const index = store.index("eventId_timestamp");
  const activities = await requestToPromise(
    index.getAll(
      IDBKeyRange.bound(
        [eventId, -Infinity],
        [eventId, Infinity],
      ),
    ),
  );

  return activities.sort(
    (a, b) => a.timestamp - b.timestamp,
  );
}
