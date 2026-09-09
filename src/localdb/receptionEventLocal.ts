import { DB_STORES, getDatabase } from "./db";
import type { ReceptionEvent } from "./types";

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

export async function saveReceptionEvent(
  receptionEvent: ReceptionEvent,
): Promise<void> {
  const database = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      DB_STORES.receptionEvents,
      "readwrite",
    );
    const store = transaction.objectStore(
      DB_STORES.receptionEvents,
    );

    store.add(receptionEvent);

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error("Failed to save reception event."),
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ??
          new Error("Reception event save transaction was aborted."),
      );
    };
  });
}

export async function getReceptionEvents(
  eventId: string,
): Promise<ReceptionEvent[]> {
  const database = await getDatabase();
  const transaction = database.transaction(
    DB_STORES.receptionEvents,
    "readonly",
  );
  const store = transaction.objectStore(
    DB_STORES.receptionEvents,
  );
  const index = store.index("eventId_timestamp");
  const request = index.getAll(
    IDBKeyRange.bound(
      [eventId, -Infinity],
      [eventId, Infinity],
    ),
  );

  const events = await requestToPromise(request);
  return events.sort(
    (a, b) => a.timestamp - b.timestamp,
  );
}

export async function getTicketReceptionHistory(
  eventId: string,
  ticketId: string,
): Promise<ReceptionEvent[]> {
  const database = await getDatabase();
  const transaction = database.transaction(
    DB_STORES.receptionEvents,
    "readonly",
  );
  const store = transaction.objectStore(
    DB_STORES.receptionEvents,
  );
  const index = store.index("eventId_ticketId");
  const events = await requestToPromise(
    index.getAll([eventId, ticketId]),
  );

  return events.sort(
    (a, b) => a.timestamp - b.timestamp,
  );
}

export async function getLatestReceptionEvent(
  eventId: string,
  ticketId: string,
): Promise<ReceptionEvent | undefined> {
  const history = await getTicketReceptionHistory(
    eventId,
    ticketId,
  );

  return history.at(-1);
}
