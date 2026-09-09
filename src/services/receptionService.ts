import { getEvent, getEvents } from "../localdb/eventLocal";
import { getTicketByQrCredentials } from "../localdb/ticketLocal";
import { saveReceptionEventWithSyncQueue } from "../localdb/receptionEventLocal";
import type { ReceptionEvent, SyncQueueItem } from "../localdb/types";

export type ReceptionErrorCode =
  | "EVENT_NOT_READY"
  | "TICKET_NOT_FOUND"
  | "LOCAL_SAVE_FAILED"
  | "INVALID_REQUEST"
  | "UNKNOWN_ERROR";

export type ReceptionResult =
  | {
      success: true;
      receptionEventId: string;
      type: "entry" | "exit";
      ticketId: string;
      timestamp: number;
    }
  | {
      success: false;
      code: ReceptionErrorCode;
      message: string;
    };

function createReceptionEventId(): string {
  if (
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function createReceptionError(
  code: ReceptionErrorCode,
  message: string,
): ReceptionResult {
  return {
    success: false,
    code,
    message,
  };
}

export async function processTicketReception(
  eventId: string,
  qrNumber: string,
  authToken: string,
  type: "entry" | "exit",
  deviceId: string,
): Promise<ReceptionResult> {
  if (
    !eventId ||
    !qrNumber ||
    !authToken ||
    !deviceId
  ) {
    return createReceptionError(
      "INVALID_REQUEST",
      "受付情報が不足しています。",
    );
  }

  if (
    type !== "entry" &&
    type !== "exit"
  ) {
    return createReceptionError(
      "INVALID_REQUEST",
      "受付種別が不正です。",
    );
  }

  try {
    const event = await getEvent(eventId);

    if (!event) {
      return createReceptionError(
        "EVENT_NOT_READY",
        "この端末にイベントデータが準備されていません。",
      );
    }

    const ticket = await getTicketByQrCredentials(
      eventId,
      qrNumber,
      authToken,
    );

    if (!ticket) {
      return createReceptionError(
        "TICKET_NOT_FOUND",
        "このイベントのチケットが見つかりません。",
      );
    }

    const timestamp = Date.now();
    const receptionEvent: ReceptionEvent = {
      id: createReceptionEventId(),
      eventId,
      ticketId: ticket.id,
      type,
      timestamp,
      deviceId,
      offline:
        typeof navigator !== "undefined"
          ? !navigator.onLine
          : true,
      createdAt: timestamp,
    };

    const syncQueueItem: SyncQueueItem = {
      id: receptionEvent.id,
      eventId,
      type: "reception",
      data: receptionEvent,
      createdAt: timestamp,
      retryCount: 0,
      status: "pending",
    };

    try {
      // 受付イベントと同期キューを同じIndexedDBトランザクションで保存する。
      // どちらか一方だけが保存される状態を作らない。
      await saveReceptionEventWithSyncQueue(
        receptionEvent,
        syncQueueItem,
      );
    } catch {
      return createReceptionError(
        "LOCAL_SAVE_FAILED",
        "受付情報を端末に保存できませんでした。",
      );
    }

    return {
      success: true,
      receptionEventId:
        receptionEvent.id,
      type,
      ticketId: ticket.id,
      timestamp,
    };
  } catch {
    return createReceptionError(
      "UNKNOWN_ERROR",
      "受付処理中に予期しないエラーが発生しました。",
    );
  }
}

async function resolveEventIdByName(
  eventName: string,
): Promise<string | undefined> {
  const events = await getEvents();
  return events.find(
    (event) => event.name === eventName,
  )?.id;
}

export async function processTicketReceptionByEventName(
  eventName: string,
  qrNumber: string,
  authToken: string,
  type: "entry" | "exit",
  deviceId: string,
): Promise<ReceptionResult> {
  if (!eventName) {
    return createReceptionError(
      "INVALID_REQUEST",
      "イベント情報が不足しています。",
    );
  }

  try {
    const eventId = await resolveEventIdByName(
      eventName,
    );

    if (!eventId) {
      return createReceptionError(
        "EVENT_NOT_READY",
        "この端末にイベントデータが準備されていません。",
      );
    }

    return processTicketReception(
      eventId,
      qrNumber,
      authToken,
      type,
      deviceId,
    );
  } catch {
    return createReceptionError(
      "UNKNOWN_ERROR",
      "受付処理中に予期しないエラーが発生しました。",
    );
  }
}

export async function processTicketEntry(
  eventId: string,
  qrNumber: string,
  authToken: string,
  deviceId: string,
): Promise<ReceptionResult> {
  return processTicketReception(
    eventId,
    qrNumber,
    authToken,
    "entry",
    deviceId,
  );
}

export async function processTicketExit(
  eventId: string,
  qrNumber: string,
  authToken: string,
  deviceId: string,
): Promise<ReceptionResult> {
  return processTicketReception(
    eventId,
    qrNumber,
    authToken,
    "exit",
    deviceId,
  );
}
