import { getEvent, getEvents } from "../localdb/eventLocal";
import { getTicketByQrCredentials } from "../localdb/ticketLocal";
import {
  getMemberByQrCredentials,
  updateMemberStatus,
} from "../localdb/memberLocal";
import {
  getTicketReceptionHistory,
  saveReceptionEventWithSyncQueue,
} from "../localdb/receptionEventLocal";
import type {
  Member,
  ReceptionEvent,
  SyncQueueItem,
} from "../localdb/types";

export type ReceptionErrorCode =
  | "EVENT_NOT_READY"
  | "TICKET_NOT_FOUND"
  | "MEMBER_NOT_FOUND"
  | "LOCAL_SAVE_FAILED"
  | "INVALID_REQUEST"
  | "UNKNOWN_ERROR";

export type ReceptionResult =
  | {
      success: true;
      receptionEventId: string;
      type: "entry" | "exit";
      ticketId: string;
      ticket: {
        qrNumber: string;
      };
      timestamp: number;
      syncStatus: "pending";
      isReEntry: boolean;
    }
  | {
      success: false;
      code: ReceptionErrorCode;
      message: string;
      reason:
        | "not-cached"
        | "invalid"
        | "already-inside"
        | "not-entered"
        | "already-exited"
        | "save-failed"
        | "unknown";
    };

export type MemberReceptionResult =
  | {
      success: true;
      member: Member;
      action: "entry" | "exit";
      syncStatus: "pending";
    }
  | {
      success: false;
      reason:
        | "not-found"
        | "not-cached"
        | "invalid-token"
        | "duplicate";
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
  reason:
    | "not-cached"
    | "invalid"
    | "already-inside"
    | "not-entered"
    | "already-exited"
    | "save-failed"
    | "unknown",
): ReceptionResult {
  return {
    success: false,
    code,
    message,
    reason,
  };
}

async function saveReceptionEvent(
  receptionEvent: ReceptionEvent,
): Promise<void> {
  const syncQueueItem: SyncQueueItem = {
    id: receptionEvent.id,
    eventId: receptionEvent.eventId,
    type: "reception",
    data: receptionEvent,
    createdAt: receptionEvent.createdAt,
    retryCount: 0,
    status: "pending",
  };

  await saveReceptionEventWithSyncQueue(
    receptionEvent,
    syncQueueItem,
  );
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
      "unknown",
    );
  }

  if (
    type !== "entry" &&
    type !== "exit"
  ) {
    return createReceptionError(
      "INVALID_REQUEST",
      "受付種別が不正です。",
      "unknown",
    );
  }

  try {
    const event = await getEvent(eventId);

    if (!event) {
      return createReceptionError(
        "EVENT_NOT_READY",
        "この端末にイベントデータが準備されていません。",
        "not-cached",
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
        "invalid",
      );
    }

    const history = await getTicketReceptionHistory(
      eventId,
      ticket.id,
    );
    const isReEntry =
      type === "entry" &&
      history.some(
        (receptionEvent) =>
          receptionEvent.type === "entry",
      );

    const timestamp = Date.now();
    const receptionEvent: ReceptionEvent = {
      id: createReceptionEventId(),
      eventId,
      subjectType: "ticket",
      ticketId: ticket.id,
      qrNumber: ticket.qrNumber,
      type,
      timestamp,
      deviceId,
      offline:
        typeof navigator !== "undefined"
          ? !navigator.onLine
          : true,
      createdAt: timestamp,
    };

    try {
      await saveReceptionEvent(receptionEvent);
    } catch {
      return createReceptionError(
        "LOCAL_SAVE_FAILED",
        "受付情報を端末に保存できませんでした。",
        "save-failed",
      );
    }

    return {
      success: true,
      receptionEventId: receptionEvent.id,
      type,
      ticketId: ticket.id,
      ticket: {
        qrNumber: ticket.qrNumber,
      },
      timestamp,
      syncStatus: "pending",
      isReEntry,
    };
  } catch {
    return createReceptionError(
      "UNKNOWN_ERROR",
      "受付処理中に予期しないエラーが発生しました。",
      "unknown",
    );
  }
}

export async function processMemberReception(
  eventId: string,
  qrNumber: string,
  authToken: string,
  type: "entry" | "exit",
  deviceId: string,
): Promise<MemberReceptionResult> {
  if (
    !eventId ||
    !qrNumber ||
    !authToken ||
    !deviceId ||
    (type !== "entry" && type !== "exit")
  ) {
    return {
      success: false,
      reason: "not-found",
    };
  }

  try {
    const event = await getEvent(eventId);

    if (!event) {
      return {
        success: false,
        reason: "not-cached",
      };
    }

    const member = await getMemberByQrCredentials(
      eventId,
      qrNumber,
      authToken,
    );

    if (!member) {
      return {
        success: false,
        reason: "not-found",
      };
    }

    const timestamp = Date.now();
    const nextStatus =
      type === "entry" ? "inside" : "outside";
    const receptionEvent: ReceptionEvent = {
      id: createReceptionEventId(),
      eventId,
      subjectType: "member",
      memberId: member.id,
      qrNumber,
      type,
      timestamp,
      deviceId,
      offline:
        typeof navigator !== "undefined"
          ? !navigator.onLine
          : true,
      createdAt: timestamp,
    };

    try {
      await saveReceptionEvent(receptionEvent);
      await updateMemberStatus(
        member.id,
        nextStatus,
        timestamp,
      );
    } catch {
      return {
        success: false,
        reason: "duplicate",
      };
    }

    const updatedMember: Member = {
      ...member,
      status: nextStatus,
      updatedAt: timestamp,
    };

    return {
      success: true,
      member: updatedMember,
      action: type,
      syncStatus: "pending",
    };
  } catch {
    return {
      success: false,
      reason: "not-found",
    };
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
      "unknown",
    );
  }

  try {
    const eventId = await resolveEventIdByName(eventName);

    if (!eventId) {
      return createReceptionError(
        "EVENT_NOT_READY",
        "この端末にイベントデータが準備されていません。",
        "not-cached",
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
      "unknown",
    );
  }
}

export async function processMemberReceptionByEventName(
  eventName: string,
  qrNumber: string,
  authToken: string,
  type: "entry" | "exit",
  deviceId: string,
): Promise<MemberReceptionResult> {
  if (!eventName) {
    return {
      success: false,
      reason: "not-cached",
    };
  }

  try {
    const eventId = await resolveEventIdByName(eventName);

    if (!eventId) {
      return {
        success: false,
        reason: "not-cached",
      };
    }

    return processMemberReception(
      eventId,
      qrNumber,
      authToken,
      type,
      deviceId,
    );
  } catch {
    return {
      success: false,
      reason: "not-found",
    };
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
