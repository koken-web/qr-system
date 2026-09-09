import { DB_STORES, getDatabase } from "./db";
import type { Ticket } from "./types";

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

export async function saveTickets(
  tickets: Ticket[],
): Promise<void> {
  const database = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      DB_STORES.tickets,
      "readwrite",
    );
    const store = transaction.objectStore(
      DB_STORES.tickets,
    );

    for (const ticket of tickets) {
      store.put(ticket);
    }

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error("Failed to save tickets."),
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ??
          new Error("Ticket save transaction was aborted."),
      );
    };
  });
}

export async function getTicketByQrToken(
  qrToken: string,
): Promise<Ticket | undefined> {
  const database = await getDatabase();
  const transaction = database.transaction(
    DB_STORES.tickets,
    "readonly",
  );
  const store = transaction.objectStore(
    DB_STORES.tickets,
  );
  const index = store.index("qrToken");

  return requestToPromise(
    index.get(qrToken),
  );
}

export async function getTickets(
  eventId?: string,
): Promise<Ticket[]> {
  const database = await getDatabase();
  const transaction = database.transaction(
    DB_STORES.tickets,
    "readonly",
  );
  const store = transaction.objectStore(
    DB_STORES.tickets,
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

export async function deleteTicketsByEventId(
  eventId: string,
): Promise<void> {
  const database = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      DB_STORES.tickets,
      "readwrite",
    );
    const store = transaction.objectStore(
      DB_STORES.tickets,
    );
    const index = store.index("eventId");
    const request = index.openKeyCursor(
      IDBKeyRange.only(eventId),
    );

    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor) {
        return;
      }

      cursor.delete();
      cursor.continue();
    };

    request.onerror = () => {
      reject(
        request.error ??
          new Error("Failed to find tickets for deletion."),
      );
    };

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error("Failed to delete tickets."),
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ??
          new Error("Ticket delete transaction was aborted."),
      );
    };
  });
}
