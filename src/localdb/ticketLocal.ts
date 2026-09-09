import { DB_STORES, getDatabase } from "./db";
import type { Ticket } from "./types";

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed."));
    };
  });
}

function validateTicket(ticket: Ticket): void {
  if (!ticket.id || !ticket.eventId || !ticket.qrNumber || !ticket.authToken || !Number.isFinite(ticket.createdAt) || !Number.isFinite(ticket.updatedAt)) {
    throw new Error("保存するチケット情報が不正です。");
  }
}

function getExpectedCounts(tickets: Ticket[]): Map<string, number> {
  const counts = new Map<string, number>();
  const qrNumbersByEvent = new Map<string, Set<string>>();

  for (const ticket of tickets) {
    validateTicket(ticket);
    const qrNumbers = qrNumbersByEvent.get(ticket.eventId) ?? new Set<string>();
    if (qrNumbers.has(ticket.qrNumber)) {
      throw new Error(`同じイベント内に重複したQR番号があります: ${ticket.qrNumber}`);
    }
    qrNumbers.add(ticket.qrNumber);
    qrNumbersByEvent.set(ticket.eventId, qrNumbers);
    counts.set(ticket.eventId, (counts.get(ticket.eventId) ?? 0) + 1);
  }

  return counts;
}

async function verifyTicketsStored(expectedCounts: Map<string, number>): Promise<void> {
  const database = await getDatabase();

  for (const [eventId, expectedCount] of expectedCounts) {
    const transaction = database.transaction(DB_STORES.tickets, "readonly");
    const store = transaction.objectStore(DB_STORES.tickets);
    const index = store.index("eventId");
    const actualTickets = await requestToPromise(index.getAll(eventId));

    if (actualTickets.length !== expectedCount) {
      throw new Error(`チケット配布確認に失敗しました。${actualTickets.length}/${expectedCount}件`);
    }

    const actualQrNumbers = new Set(actualTickets.map((ticket) => ticket.qrNumber));
    if (actualQrNumbers.size !== expectedCount) {
      throw new Error("チケット配布確認に失敗しました。QR番号に重複があります。");
    }
  }
}

export async function saveTickets(tickets: Ticket[]): Promise<void> {
  if (tickets.length === 0) return;

  const expectedCounts = getExpectedCounts(tickets);
  const database = await getDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DB_STORES.tickets, "readwrite");
    const store = transaction.objectStore(DB_STORES.tickets);

    for (const ticket of tickets) store.put(ticket);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed to save tickets."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Ticket save transaction was aborted."));
  });

  await verifyTicketsStored(expectedCounts);
}

export async function replaceTicketsForEvent(eventId: string, tickets: Ticket[]): Promise<void> {
  if (!eventId) {
    throw new Error("イベントIDが指定されていません。");
  }

  const normalizedTickets = tickets.map((ticket) => ({
    ...ticket,
    eventId,
  }));

  getExpectedCounts(normalizedTickets);

  const database = await getDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DB_STORES.tickets, "readwrite");
    const store = transaction.objectStore(DB_STORES.tickets);
    const index = store.index("eventId");
    const cursorRequest = index.openKeyCursor(IDBKeyRange.only(eventId));

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        for (const ticket of normalizedTickets) {
          store.put(ticket);
        }
        return;
      }

      cursor.delete();
      cursor.continue();
    };

    cursorRequest.onerror = () => {
      reject(cursorRequest.error ?? new Error("Failed to replace tickets."));
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed to replace tickets."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Ticket replacement transaction was aborted."));
  });

  await verifyTicketsStored(new Map([[eventId, normalizedTickets.length]]));
}

export async function getTicketByQrCredentials(eventId: string, qrNumber: string, authToken: string): Promise<Ticket | undefined> {
  const database = await getDatabase();
  const transaction = database.transaction(DB_STORES.tickets, "readonly");
  const store = transaction.objectStore(DB_STORES.tickets);
  const index = store.index("eventId_qrNumber");
  const ticket = await requestToPromise(index.get([eventId, qrNumber]));

  if (!ticket || ticket.authToken !== authToken) return undefined;
  return ticket;
}

export async function getTickets(eventId?: string): Promise<Ticket[]> {
  const database = await getDatabase();
  const transaction = database.transaction(DB_STORES.tickets, "readonly");
  const store = transaction.objectStore(DB_STORES.tickets);

  if (!eventId) return requestToPromise(store.getAll());

  return requestToPromise(store.index("eventId").getAll(eventId));
}

export async function deleteTicketsByEventId(eventId: string): Promise<void> {
  const database = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORES.tickets, "readwrite");
    const store = transaction.objectStore(DB_STORES.tickets);
    const request = store.index("eventId").openKeyCursor(IDBKeyRange.only(eventId));

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };

    request.onerror = () => reject(request.error ?? new Error("Failed to find tickets for deletion."));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed to delete tickets."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Ticket delete transaction was aborted."));
  });
}
