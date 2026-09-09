import { DB_STORES, getDatabase } from "./db";
import type { Event } from "./types";

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

export async function saveEvent(
  event: Event,
): Promise<void> {
  const database = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      DB_STORES.events,
      "readwrite",
    );
    const store = transaction.objectStore(
      DB_STORES.events,
    );

    store.put(event);

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error("Failed to save event."),
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ??
          new Error("Event save transaction was aborted."),
      );
    };
  });
}

export async function getEvent(
  eventId: string,
): Promise<Event | undefined> {
  const database = await getDatabase();
  const transaction = database.transaction(
    DB_STORES.events,
    "readonly",
  );
  const store = transaction.objectStore(
    DB_STORES.events,
  );

  return requestToPromise(
    store.get(eventId),
  );
}

export async function getEvents(): Promise<Event[]> {
  const database = await getDatabase();
  const transaction = database.transaction(
    DB_STORES.events,
    "readonly",
  );
  const store = transaction.objectStore(
    DB_STORES.events,
  );

  return requestToPromise(
    store.getAll(),
  );
}

export async function deleteEvent(
  eventId: string,
): Promise<void> {
  const database = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      DB_STORES.events,
      "readwrite",
    );
    const store = transaction.objectStore(
      DB_STORES.events,
    );

    store.delete(eventId);

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error("Failed to delete event."),
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ??
          new Error("Event delete transaction was aborted."),
      );
    };
  });
}
