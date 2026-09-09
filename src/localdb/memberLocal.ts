import { DB_STORES, getDatabase } from "./db";
import type { Member } from "./types";

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

export async function saveMembers(
  members: Member[],
): Promise<void> {
  const database = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      DB_STORES.members,
      "readwrite",
    );
    const store = transaction.objectStore(
      DB_STORES.members,
    );

    for (const member of members) {
      store.put(member);
    }

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error("Failed to save members."),
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ??
          new Error("Member save transaction was aborted."),
      );
    };
  });
}

export async function getMemberByQrToken(
  qrToken: string,
): Promise<Member | undefined> {
  const database = await getDatabase();
  const transaction = database.transaction(
    DB_STORES.members,
    "readonly",
  );
  const store = transaction.objectStore(
    DB_STORES.members,
  );
  const index = store.index("qrToken");

  return requestToPromise(
    index.get(qrToken),
  );
}

export async function getMembers(
  eventId?: string,
): Promise<Member[]> {
  const database = await getDatabase();
  const transaction = database.transaction(
    DB_STORES.members,
    "readonly",
  );
  const store = transaction.objectStore(
    DB_STORES.members,
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

export async function deleteMembersByEventId(
  eventId: string,
): Promise<void> {
  const database = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      DB_STORES.members,
      "readwrite",
    );
    const store = transaction.objectStore(
      DB_STORES.members,
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
          new Error("Failed to find members for deletion."),
      );
    };

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error("Failed to delete members."),
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ??
          new Error("Member delete transaction was aborted."),
      );
    };
  });
}
