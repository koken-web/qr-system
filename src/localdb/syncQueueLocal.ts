import { DB_STORES, getDatabase } from "./db";
import type {
  SyncQueueItem,
  SyncQueueStatus,
} from "./types";

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

export async function enqueueSyncItem(
  item: SyncQueueItem,
): Promise<void> {
  const database = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      DB_STORES.syncQueue,
      "readwrite",
    );
    const store = transaction.objectStore(
      DB_STORES.syncQueue,
    );

    store.add(item);

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error("Failed to enqueue sync item."),
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ??
          new Error("Sync queue transaction was aborted."),
      );
    };
  });
}

export async function getPendingSyncItems(
  eventId?: string,
): Promise<SyncQueueItem[]> {
  const database = await getDatabase();
  const transaction = database.transaction(
    DB_STORES.syncQueue,
    "readonly",
  );
  const store = transaction.objectStore(
    DB_STORES.syncQueue,
  );
  const index = store.index("status_createdAt");

  const statuses: SyncQueueStatus[] = [
    "pending",
    "processing",
  ];

  const items: SyncQueueItem[] = [];

  for (const status of statuses) {
    const result = await requestToPromise(
      index.getAll(
        IDBKeyRange.bound(
          [status, -Infinity],
          [status, Infinity],
        ),
      ),
    );

    items.push(...result);
  }

  const filtered = eventId
    ? items.filter(
        (item) => item.eventId === eventId,
      )
    : items;

  return filtered.sort(
    (a, b) => a.createdAt - b.createdAt,
  );
}

export async function updateSyncItemStatus(
  id: string,
  status: SyncQueueStatus,
  retryCount?: number,
): Promise<void> {
  const database = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      DB_STORES.syncQueue,
      "readwrite",
    );
    const store = transaction.objectStore(
      DB_STORES.syncQueue,
    );
    const request = store.get(id);

    request.onsuccess = () => {
      const item = request.result as
        | SyncQueueItem
        | undefined;

      if (!item) {
        transaction.abort();
        reject(
          new Error("Sync queue item was not found."),
        );
        return;
      }

      item.status = status;

      if (retryCount !== undefined) {
        item.retryCount = retryCount;
      }

      store.put(item);
    };

    request.onerror = () => {
      reject(
        request.error ??
          new Error("Failed to read sync queue item."),
      );
    };

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error("Failed to update sync queue item."),
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ??
          new Error("Sync queue update transaction was aborted."),
      );
    };
  });
}

export async function deleteSyncItem(
  id: string,
): Promise<void> {
  const database = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      DB_STORES.syncQueue,
      "readwrite",
    );
    const store = transaction.objectStore(
      DB_STORES.syncQueue,
    );

    store.delete(id);

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error("Failed to delete sync queue item."),
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ??
          new Error("Sync queue delete transaction was aborted."),
      );
    };
  });
}
