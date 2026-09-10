import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type Transaction,
  type Unsubscribe,
} from "firebase/firestore";

import {
  db,
} from "./firebase";

import {
  ANALYTICS_COLLECTION,
  ANALYTICS_SUMMARY_DOCUMENT,
  EVENT_DATA_COLLECTION,
  EVENT_MEMBERS_COLLECTION,
  RECEPTION_EVENTS_COLLECTION,
  TICKETS_COLLECTION,
  getEventDataId,
} from "./firestorePaths";

const ANALYTICS_SCHEMA_VERSION = 2;
const REBUILD_RETRY_LIMIT = 4;

export type AnalyticsHourData = {
  label: string;
  count: number;
};

export type EventAnalyticsSummary = {
  schemaVersion: number;
  revision: number;
  totalVisitors: number;
  currentInside: number;
  currentMembersInside: number;
  reEntryCount: number;
  ticketCount: number;
  activityCount: number;
  totalStayMilliseconds: number;
  completedStayCount: number;
  averageStayMinutes: number | null;
  hourlyEntryCounts: Record<string, number>;
  needsRebuild: false;
};

type ReceptionEventType = "entry" | "exit";

type AnalyticsReceptionEvent = {
  id: string;
  ticketId: string;
  type: ReceptionEventType;
  timestamp: number;
  forcedExit?: boolean;
};

type AnalyticsSnapshot = DocumentSnapshot<DocumentData>;

type LegacyAnalyticsActivity = {
  type:
    | "ticket-entry"
    | "ticket-exit"
    | "member-entry"
    | "member-exit";
  timestamp: string;
  isReEntry?: boolean;
  previousEntryAt?: string;
  forcedExit?: boolean;
};

class AnalyticsRevisionChangedError extends Error {}

const rebuildPromises = new Map<
  string,
  Promise<EventAnalyticsSummary>
>();

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function readHourlyEntryCounts(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  const counts: Record<string, number> = {};

  for (const [key, count] of Object.entries(value)) {
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(key) ||
      !isFiniteNonNegativeNumber(count)
    ) {
      return null;
    }

    counts[key] = Math.floor(count);
  }

  return counts;
}

function convertAnalyticsSummary(
  data: DocumentData
): EventAnalyticsSummary | null {
  const hourlyEntryCounts = readHourlyEntryCounts(
    data.hourlyEntryCounts
  );

  if (
    data.schemaVersion !== ANALYTICS_SCHEMA_VERSION ||
    data.needsRebuild === true ||
    !isFiniteNonNegativeNumber(data.revision) ||
    !isFiniteNonNegativeNumber(data.totalVisitors) ||
    !isFiniteNonNegativeNumber(data.currentInside) ||
    !isFiniteNonNegativeNumber(data.currentMembersInside) ||
    !isFiniteNonNegativeNumber(data.reEntryCount) ||
    !isFiniteNonNegativeNumber(data.ticketCount) ||
    !isFiniteNonNegativeNumber(data.activityCount) ||
    !isFiniteNonNegativeNumber(data.totalStayMilliseconds) ||
    !isFiniteNonNegativeNumber(data.completedStayCount) ||
    hourlyEntryCounts === null
  ) {
    return null;
  }

  const averageStayMinutes =
    data.completedStayCount === 0
      ? null
      : Math.round(
          data.totalStayMilliseconds /
            data.completedStayCount /
            1000 /
            60
        );

  return {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    revision: Math.floor(data.revision),
    totalVisitors: Math.floor(data.totalVisitors),
    currentInside: Math.floor(data.currentInside),
    currentMembersInside: Math.floor(data.currentMembersInside),
    reEntryCount: Math.floor(data.reEntryCount),
    ticketCount: Math.floor(data.ticketCount),
    activityCount: Math.floor(data.activityCount),
    totalStayMilliseconds: data.totalStayMilliseconds,
    completedStayCount: Math.floor(data.completedStayCount),
    averageStayMinutes,
    hourlyEntryCounts,
    needsRebuild: false,
  };
}

export function getEventAnalyticsDocumentByDataId(eventDataId: string) {
  return doc(
    db,
    EVENT_DATA_COLLECTION,
    eventDataId,
    ANALYTICS_COLLECTION,
    ANALYTICS_SUMMARY_DOCUMENT
  );
}

export function getEventAnalyticsDocument(eventName: string) {
  return getEventAnalyticsDocumentByDataId(getEventDataId(eventName));
}

function getRevision(snapshot: AnalyticsSnapshot) {
  if (!snapshot.exists()) {
    return 0;
  }

  const revision = snapshot.data().revision;

  return isFiniteNonNegativeNumber(revision)
    ? Math.floor(revision)
    : 0;
}

function createHourBucket(timestamp: number) {
  const date = new Date(timestamp);

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return `${String(date.getFullYear()).padStart(4, "0")}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(
    date.getHours()
  ).padStart(2, "0")}`;
}

function convertReceptionEvent(
  documentId: string,
  data: DocumentData
): AnalyticsReceptionEvent | null {
  if (
    (data.type !== "entry" && data.type !== "exit") ||
    typeof data.ticketId !== "string" ||
    data.ticketId.trim() === "" ||
    !isFiniteNonNegativeNumber(data.timestamp)
  ) {
    return null;
  }

  return {
    id:
      typeof data.id === "string" && data.id.trim() !== ""
        ? data.id
        : documentId,
    ticketId: data.ticketId,
    type: data.type,
    timestamp: data.timestamp,
    ...(typeof data.forcedExit === "boolean"
      ? { forcedExit: data.forcedExit }
      : {}),
  };
}

function calculateSummary(
  revision: number,
  ticketDocuments: QueryDocumentSnapshot<DocumentData>[],
  memberDocuments: QueryDocumentSnapshot<DocumentData>[],
  receptionEventDocuments: QueryDocumentSnapshot<DocumentData>[]
): EventAnalyticsSummary {
  const events = receptionEventDocuments
    .map((snapshot) =>
      convertReceptionEvent(snapshot.id, snapshot.data())
    )
    .filter(
      (event): event is AnalyticsReceptionEvent => event !== null
    )
    .sort((first, second) => {
      if (first.timestamp !== second.timestamp) {
        return first.timestamp - second.timestamp;
      }

      return first.id.localeCompare(second.id);
    });

  const stateByTicket = new Map<string, "inside" | "outside">();
  const entryTimeByTicket = new Map<string, number>();
  const visitorTicketIds = new Set<string>();
  const hourlyEntryCounts: Record<string, number> = {};

  let currentInside = 0;
  let reEntryCount = 0;
  let totalStayMilliseconds = 0;
  let completedStayCount = 0;

  for (const event of events) {
    if (event.type === "entry") {
      const previousState = stateByTicket.get(event.ticketId) ?? "outside";

      if (previousState === "inside") {
        continue;
      }

      const wasVisitor = visitorTicketIds.has(event.ticketId);
      if (wasVisitor) {
        reEntryCount += 1;
      } else {
        visitorTicketIds.add(event.ticketId);
      }

      stateByTicket.set(event.ticketId, "inside");
      entryTimeByTicket.set(event.ticketId, event.timestamp);
      currentInside += 1;

      const bucket = createHourBucket(event.timestamp);
      if (bucket !== null) {
        hourlyEntryCounts[bucket] =
          (hourlyEntryCounts[bucket] ?? 0) + 1;
      }

      continue;
    }

    if (stateByTicket.get(event.ticketId) !== "inside") {
      continue;
    }

    stateByTicket.set(event.ticketId, "outside");
    currentInside = Math.max(0, currentInside - 1);

    const entryTimestamp = entryTimeByTicket.get(event.ticketId);
    entryTimeByTicket.delete(event.ticketId);

    if (
      entryTimestamp === undefined ||
      event.timestamp < entryTimestamp
    ) {
      continue;
    }

    if (event.forcedExit === true) {
      continue;
    }

    totalStayMilliseconds += event.timestamp - entryTimestamp;
    completedStayCount += 1;
  }

  const currentMembersInside = memberDocuments.filter(
    (snapshot) => snapshot.data().status === "入室中"
  ).length;

  return {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    revision,
    totalVisitors: visitorTicketIds.size,
    currentInside,
    currentMembersInside,
    reEntryCount,
    ticketCount: ticketDocuments.length,
    activityCount: events.length,
    totalStayMilliseconds,
    completedStayCount,
    averageStayMinutes:
      completedStayCount === 0
        ? null
        : Math.round(
            totalStayMilliseconds /
              completedStayCount /
              1000 /
              60
          ),
    hourlyEntryCounts,
    needsRebuild: false,
  };
}

async function rebuildByDataId(
  eventDataId: string
): Promise<EventAnalyticsSummary> {
  const summaryDocument = getEventAnalyticsDocumentByDataId(eventDataId);

  for (let attempt = 0; attempt < REBUILD_RETRY_LIMIT; attempt += 1) {
    const beforeSnapshot = await getDocFromServer(summaryDocument);
    const revision = getRevision(beforeSnapshot);

    const [ticketsSnapshot, membersSnapshot, receptionEventsSnapshot] =
      await Promise.all([
        getDocsFromServer(
          collection(
            db,
            EVENT_DATA_COLLECTION,
            eventDataId,
            TICKETS_COLLECTION
          )
        ),
        getDocsFromServer(
          collection(
            db,
            EVENT_DATA_COLLECTION,
            eventDataId,
            EVENT_MEMBERS_COLLECTION
          )
        ),
        getDocsFromServer(
          collection(
            db,
            EVENT_DATA_COLLECTION,
            eventDataId,
            RECEPTION_EVENTS_COLLECTION
          )
        ),
      ]);

    const summary = calculateSummary(
      revision,
      ticketsSnapshot.docs,
      membersSnapshot.docs,
      receptionEventsSnapshot.docs
    );

    try {
      await runTransaction(db, async (transaction) => {
        const currentSnapshot = await transaction.get(summaryDocument);

        if (getRevision(currentSnapshot) !== revision) {
          throw new AnalyticsRevisionChangedError();
        }

        transaction.set(summaryDocument, {
          ...summary,
          rebuiltAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      return summary;
    } catch (error) {
      if (
        error instanceof AnalyticsRevisionChangedError &&
        attempt < REBUILD_RETRY_LIMIT - 1
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    "集計データの更新が続いているため再計算できませんでした。"
  );
}

export function rebuildEventAnalyticsByDataId(eventDataId: string) {
  const currentPromise = rebuildPromises.get(eventDataId);

  if (currentPromise !== undefined) {
    return currentPromise;
  }

  const promise = rebuildByDataId(eventDataId).finally(() => {
    rebuildPromises.delete(eventDataId);
  });

  rebuildPromises.set(eventDataId, promise);
  return promise;
}

export function rebuildEventAnalytics(eventName: string) {
  return rebuildEventAnalyticsByDataId(getEventDataId(eventName));
}

export async function ensureEventAnalytics(eventName: string) {
  const normalizedEventName = eventName.trim();

  if (normalizedEventName === "") {
    return null;
  }

  const snapshot = await getDocFromServer(
    getEventAnalyticsDocument(normalizedEventName)
  );

  if (snapshot.exists()) {
    const summary = convertAnalyticsSummary(snapshot.data());

    if (summary !== null) {
      return summary;
    }
  }

  return rebuildEventAnalytics(normalizedEventName);
}

export function subscribeToEventAnalytics(
  eventName: string,
  onSummaryChanged: (summary: EventAnalyticsSummary) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (eventName.trim() === "") {
    return () => {
      // イベント未設定時は解除処理なし
    };
  }

  let rebuilding = false;

  return onSnapshot(
    getEventAnalyticsDocument(eventName),
    (snapshot) => {
      const summary = snapshot.exists()
        ? convertAnalyticsSummary(snapshot.data())
        : null;

      if (summary !== null) {
        onSummaryChanged(summary);
        return;
      }

      if (rebuilding || snapshot.metadata.fromCache) {
        return;
      }

      rebuilding = true;

      void rebuildEventAnalytics(eventName)
        .catch((error: unknown) => {
          console.error(
            "イベント集計を再計算できませんでした。",
            error
          );

          onError?.(
            error instanceof Error
              ? error
              : new Error("イベント集計を再計算できませんでした。")
          );
        })
        .finally(() => {
          rebuilding = false;
        });
    },
    (error) => {
      console.error("イベント集計の購読に失敗しました。", error);
      onError?.(error);
    }
  );
}

export function getAnalyticsSnapshotForTransaction(
  transaction: Transaction,
  eventName: string
) {
  return transaction.get(getEventAnalyticsDocument(eventName));
}

export function markEventAnalyticsStaleInTransaction(
  transaction: Transaction,
  analyticsSnapshot: AnalyticsSnapshot
) {
  const revision = getRevision(analyticsSnapshot) + 1;

  transaction.set(
    analyticsSnapshot.ref,
    {
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      revision,
      needsRebuild: true,
    },
    { merge: true }
  );
}

export async function markEventAnalyticsStale(eventName: string) {
  const summaryDocument = getEventAnalyticsDocument(eventName);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(summaryDocument);
    markEventAnalyticsStaleInTransaction(transaction, snapshot);
  });
}

export function applyActivityToAnalyticsTransaction(
  transaction: Transaction,
  analyticsSnapshot: AnalyticsSnapshot,
  activity: LegacyAnalyticsActivity
) {
  // ReceptionEvent が分析の正本になったため、旧activityの増分集計は行わず
  // 再構築フラグだけを立てる。引数の参照は旧API互換のために残す。
  void activity;
  markEventAnalyticsStaleInTransaction(transaction, analyticsSnapshot);
}

export function createHourDataFromAnalytics(
  summary: EventAnalyticsSummary,
  eventDate: string,
  startTime: string,
  endTime: string
): AnalyticsHourData[] {
  if (
    eventDate.trim() === "" ||
    !/^\d{2}:\d{2}$/.test(startTime) ||
    !/^\d{2}:\d{2}$/.test(endTime)
  ) {
    return [];
  }

  const startDate = new Date(`${eventDate}T${startTime}:00`);
  const endDate = new Date(`${eventDate}T${endTime}:00`);

  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
    return [];
  }

  if (endDate.getTime() <= startDate.getTime()) {
    return [];
  }

  const result: AnalyticsHourData[] = [];
  const cursor = new Date(startDate);
  cursor.setMinutes(0, 0, 0);

  while (cursor.getTime() < endDate.getTime()) {
    const bucket = createHourBucket(cursor.getTime());
    const label = `${String(cursor.getHours()).padStart(2, "0")}:00`;

    result.push({
      label,
      count: bucket === null ? 0 : summary.hourlyEntryCounts[bucket] ?? 0,
    });

    cursor.setHours(cursor.getHours() + 1);
  }

  return result;
}
