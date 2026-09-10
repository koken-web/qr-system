import {
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";

import {
  db,
} from "./firebase";

import {
  ACTIVITY_COLLECTION,
  EVENT_DATA_COLLECTION,
  RECEPTION_EVENTS_COLLECTION,
  TICKETS_COLLECTION,
  getEventDataId,
} from "./firestorePaths";

import {
  getEvent,
} from "./localdb/eventLocal";

import {
  getTicketById,
} from "./localdb/ticketLocal";

import {
  getPendingSyncItems,
  updateSyncItemStatus,
  deleteSyncItem,
} from "./localdb/syncQueueLocal";

import type {
  ReceptionEvent,
  SyncQueueItem,
} from "./localdb/types";

import {
  getEventAnalyticsDocumentByDataId,
  markEventAnalyticsStaleInTransaction,
  rebuildEventAnalyticsByDataId,
} from "./eventAnalyticsFirestore";

const RETRY_INTERVAL_MILLISECONDS =
  15 * 1000;

let syncInProgress = false;
let syncStarted = false;

function isReceptionEvent(
  value: unknown,
): value is ReceptionEvent {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const event = value as Partial<ReceptionEvent>;

  return (
    typeof event.id === "string" &&
    event.id.length > 0 &&
    typeof event.eventId === "string" &&
    event.eventId.length > 0 &&
    typeof event.ticketId === "string" &&
    event.ticketId.length > 0 &&
    (event.type === "entry" || event.type === "exit") &&
    Number.isFinite(event.timestamp) &&
    typeof event.deviceId === "string" &&
    event.deviceId.length > 0 &&
    typeof event.offline === "boolean" &&
    Number.isFinite(event.createdAt)
  );
}

function getReceptionEvent(
  item: SyncQueueItem,
): ReceptionEvent {
  if (
    item.type !== "reception" ||
    !isReceptionEvent(item.data)
  ) {
    throw new Error("同期キューの受付データが不正です。");
  }

  if (
    item.id !== item.data.id ||
    item.eventId !== item.data.eventId
  ) {
    throw new Error("同期キューのIDまたはイベントIDが一致しません。");
  }

  return item.data;
}

function shouldApplyStatus(
  currentLastReceptionAt: unknown,
  capturedAt: string,
) {
  if (
    typeof currentLastReceptionAt !== "string" ||
    currentLastReceptionAt === ""
  ) {
    return true;
  }

  return (
    capturedAt.localeCompare(currentLastReceptionAt) >= 0
  );
}

type EndedEventState = {
  ended: boolean;
  endedAt: string | null;
};

function getEndedEventState(
  snapshot: DocumentSnapshot<DocumentData>,
): EndedEventState {
  if (!snapshot.exists()) {
    return {
      ended: false,
      endedAt: null,
    };
  }

  const data = snapshot.data();
  const ended =
    data.status === "ended" ||
    typeof data.endedAt === "string";

  return {
    ended,
    endedAt:
      typeof data.endedAt === "string"
        ? data.endedAt
        : null,
  };
}

function wasCapturedBeforeEventEnd(
  capturedAt: string,
  endedAt: string | null,
) {
  if (endedAt === null) {
    return false;
  }

  const capturedTime = Date.parse(capturedAt);
  const endedTime = Date.parse(endedAt);

  return (
    Number.isFinite(capturedTime) &&
    Number.isFinite(endedTime) &&
    capturedTime <= endedTime
  );
}

async function syncReceptionEvent(
  receptionEvent: ReceptionEvent,
) {
  const localEvent = await getEvent(
    receptionEvent.eventId,
  );

  if (!localEvent) {
    throw new Error(
      `同期対象イベント ${receptionEvent.eventId} が端末にありません。`,
    );
  }

  const localTicket = await getTicketById(
    receptionEvent.eventId,
    receptionEvent.ticketId,
  );

  if (!localTicket) {
    throw new Error(
      `同期対象チケット ${receptionEvent.ticketId} が端末にありません。`,
    );
  }

  const eventDataId = getEventDataId(
    localEvent.name,
  );
  const capturedAt = new Date(
    receptionEvent.timestamp,
  ).toISOString();

  const eventDocument = doc(
    db,
    "events",
    receptionEvent.eventId,
  );

  const ticketDocument = doc(
    db,
    EVENT_DATA_COLLECTION,
    eventDataId,
    TICKETS_COLLECTION,
    localTicket.qrNumber,
  );

  const receptionEventDocument = doc(
    db,
    EVENT_DATA_COLLECTION,
    eventDataId,
    RECEPTION_EVENTS_COLLECTION,
    receptionEvent.id,
  );

  const activityDocument = doc(
    db,
    EVENT_DATA_COLLECTION,
    eventDataId,
    ACTIVITY_COLLECTION,
    receptionEvent.id,
  );

  const analyticsDocument =
    getEventAnalyticsDocumentByDataId(
      eventDataId,
    );

  await runTransaction(
    db,
    async (transaction) => {
      const [
        eventSnapshot,
        receptionEventSnapshot,
        activitySnapshot,
        ticketSnapshot,
        analyticsSnapshot,
      ] = await Promise.all([
        transaction.get(eventDocument),
        transaction.get(receptionEventDocument),
        transaction.get(activityDocument),
        transaction.get(ticketDocument),
        transaction.get(analyticsDocument),
      ]);

      if (receptionEventSnapshot.exists()) {
        return;
      }

      if (!ticketSnapshot.exists()) {
        throw new Error(
          `同期対象チケット ${localTicket.qrNumber} が見つかりません。`,
        );
      }

      const ticketData = ticketSnapshot.data();
      const endedState = getEndedEventState(
        eventSnapshot,
      );
      const capturedBeforeEnd =
        !endedState.ended ||
        wasCapturedBeforeEventEnd(
          capturedAt,
          endedState.endedAt,
        );

      transaction.set(
        receptionEventDocument,
        {
          id: receptionEvent.id,
          eventId: receptionEvent.eventId,
          ticketId: receptionEvent.ticketId,
          qrNumber: localTicket.qrNumber,
          type: receptionEvent.type,
          timestamp: capturedAt,
          deviceId: receptionEvent.deviceId,
          offline: receptionEvent.offline,
          createdAt: serverTimestamp(),
        },
      );

      if (capturedBeforeEnd) {
        if (
          !endedState.ended &&
          shouldApplyStatus(
            ticketData.lastReceptionAt,
            capturedAt,
          )
        ) {
          transaction.update(
            ticketDocument,
            {
              status:
                receptionEvent.type === "entry"
                  ? "入場中"
                  : "使用済み",
              lastReceptionAt: capturedAt,
              lastReceptionOperationId: receptionEvent.id,
              updatedAt: serverTimestamp(),
            },
          );
        } else if (
          endedState.ended &&
          ticketData.status !== "無効"
        ) {
          transaction.update(
            ticketDocument,
            {
              status: "使用済み",
              lastReceptionAt:
                endedState.endedAt ?? capturedAt,
              lastReceptionOperationId:
                receptionEvent.id,
              updatedAt: serverTimestamp(),
            },
          );
        }

        if (!activitySnapshot.exists()) {
          transaction.set(
            activityDocument,
            {
              id: receptionEvent.id,
              type:
                receptionEvent.type === "entry"
                  ? "ticket-entry"
                  : "ticket-exit",
              qrNumber: localTicket.qrNumber,
              timestamp: capturedAt,
              source: "scanner",
              offline: receptionEvent.offline,
              createdAt: serverTimestamp(),
            },
          );
        }

        markEventAnalyticsStaleInTransaction(
          transaction,
          analyticsSnapshot,
        );
      }
    },
  );
}

async function syncOperation(
  item: SyncQueueItem,
) {
  if (item.type !== "reception") {
    throw new Error(
      `未対応の同期キュー種別です: ${item.type}`,
    );
  }

  const receptionEvent = getReceptionEvent(item);
  await syncReceptionEvent(receptionEvent);
}

export async function syncPendingReceptionOperations() {
  if (
    syncInProgress ||
    typeof navigator === "undefined" ||
    !navigator.onLine
  ) {
    return;
  }

  syncInProgress = true;

  try {
    const operations =
      await getPendingSyncItems();
    const changedEventIds = new Set<string>();

    for (const operation of operations) {
      if (!navigator.onLine) {
        break;
      }

      const nextRetryCount =
        operation.retryCount + 1;

      try {
        await updateSyncItemStatus(
          operation.id,
          "processing",
          nextRetryCount,
        );

        await syncOperation(operation);

        await deleteSyncItem(operation.id);
        changedEventIds.add(operation.eventId);
      } catch (error) {
        console.warn(
          `受付データ ${operation.id} の同期を次回へ延期します。`,
          error,
        );

        try {
          await updateSyncItemStatus(
            operation.id,
            "pending",
            nextRetryCount,
          );
        } catch (statusError) {
          console.warn(
            `同期キュー ${operation.id} の再試行状態を保存できませんでした。`,
            statusError,
          );
        }

        if (!navigator.onLine) {
          break;
        }
      }
    }

    for (const eventId of changedEventIds) {
      try {
        const localEvent = await getEvent(eventId);
        if (!localEvent) {
          continue;
        }

        await rebuildEventAnalyticsByDataId(
          getEventDataId(localEvent.name),
        );
      } catch (error) {
        console.warn(
          `イベント ${eventId} の集計再計算を次回へ延期します。`,
          error,
        );
      }
    }
  } finally {
    syncInProgress = false;
  }
}

export function startOfflineReceptionSync() {
  if (
    syncStarted ||
    typeof window === "undefined"
  ) {
    return;
  }

  syncStarted = true;

  const requestSync = () => {
    if (!navigator.onLine) {
      return;
    }

    void syncPendingReceptionOperations();
  };

  window.addEventListener(
    "online",
    requestSync,
  );

  window.setInterval(
    requestSync,
    RETRY_INTERVAL_MILLISECONDS,
  );

  window.setTimeout(
    requestSync,
    0,
  );
}
