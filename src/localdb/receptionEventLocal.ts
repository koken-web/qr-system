import { DB_STORES, getDatabase } from "./db";
import type { ReceptionEvent, SyncQueueItem } from "./types";

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

function waitForTransaction(
  transaction: IDBTransaction,
  errorMessage: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error(errorMessage),
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ??
          new Error(`${errorMessage} Transaction was aborted.`),
      );
    };
  });
}

export async function saveReceptionEvent(
  receptionEvent: ReceptionEvent,
): Promise<void> {
  const database = await getDatabase();

  const transaction = database.transaction(
    DB_STORES.receptionEvents,
    "readwrite",
  );
  const store = transaction.objectStore(
    DB_STORES.receptionEvents,
  );

  store.add(receptionEvent);

  await waitForTransaction(
    transaction,
    "Failed to save reception event.",
  );
}

export async function saveReceptionEventWithSyncQueue(
  receptionEvent: ReceptionEvent,
  syncQueueItem: SyncQueueItem,
): Promise<void> {
  if (receptionEvent.id !== syncQueueItem.id) {
    throw new Error(
      "受付イベントと同期キューのIDが一致していません。",
    );
  }

  if (receptionEvent.eventId !== syncQueueItem.eventId) {
    throw new Error(
      "受付イベントと同期キューのイベントIDが一致していません。",
    );
  }

  const database = await getDatabase();
  const transaction = database.transaction(
    [DB_STORES.receptionEvents, DB_STORES.syncQueue],
    "readwrite",
  );

  transaction
    .objectStore(DB_STORES.receptionEvents)
    .add(receptionEvent);

  transaction
    .objectStore(DB_STORES.syncQueue)
    .add(syncQueueItem);

  await waitForTransaction(
    transaction,
    "受付情報と同期キューを保存できませんでした。",
  );
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
