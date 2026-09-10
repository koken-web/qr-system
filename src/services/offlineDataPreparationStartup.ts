import { getEvent } from "../localdb/eventLocal";
import {
  checkOfflineReadiness,
  type OfflineReadinessResult,
} from "./offlineReadinessService";
import { prepareEventOfflineData } from "./offlineDataPreparationService";

const CURRENT_EVENT_ID_STORAGE_KEY = "qr-management-current-event-id";
const OFFLINE_READY_PREFIX = "qr-management-offline-ready:";
const PREPARATION_INTERVAL_MS = 5000;

let started = false;
let preparing = false;

function getOfflineReadyStorageKey(eventId: string) {
  return `${OFFLINE_READY_PREFIX}${eventId}`;
}

function saveOfflineReadiness(
  eventId: string,
  result: OfflineReadinessResult,
) {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = getOfflineReadyStorageKey(eventId);

  try {
    if (result.ready) {
      localStorage.setItem(
        storageKey,
        String(Date.now()),
      );
    } else {
      localStorage.removeItem(storageKey);
    }
  } catch (error) {
    console.warn(
      "オフライン準備状態の保存に失敗しました。",
      error,
    );
  }
}

export function isOfflineReady(eventId: string) {
  if (
    typeof window === "undefined" ||
    !eventId
  ) {
    return false;
  }

  try {
    return (
      localStorage.getItem(
        getOfflineReadyStorageKey(eventId),
      ) !== null
    );
  } catch {
    return false;
  }
}

async function prepareCurrentEvent() {
  if (
    preparing ||
    typeof window === "undefined" ||
    !navigator.onLine
  ) {
    return;
  }

  const eventId = localStorage.getItem(
    CURRENT_EVENT_ID_STORAGE_KEY,
  );

  if (!eventId) {
    return;
  }

  preparing = true;

  try {
    const event = await getEvent(eventId);

    if (!event) {
      saveOfflineReadiness(eventId, {
        ready: false,
        checks: [],
      });
      return;
    }

    const result = await prepareEventOfflineData(
      event.id,
      event.name,
    );

    const readiness = await checkOfflineReadiness(
      event.id,
      {
        expectedTicketCount: result.ticketCount,
        expectedMemberCount: result.memberCount,
      },
    );

    saveOfflineReadiness(event.id, readiness);

    if (readiness.ready) {
      console.info(
        `オフライン準備完了: ${result.eventName} / チケット${result.ticketCount}件 / 部員${result.memberCount}件`,
      );
    } else {
      const failedChecks = readiness.checks
        .filter((check) => !check.ok)
        .map((check) => check.message)
        .join(" / ");

      console.warn(
        `オフライン準備未完了: ${result.eventName} / ${failedChecks}`,
      );
    }
  } catch (error) {
    saveOfflineReadiness(eventId, {
      ready: false,
      checks: [],
    });

    console.warn(
      "イベントデータのオフライン準備に失敗しました。次回の準備で再試行します。",
      error,
    );
  } finally {
    preparing = false;
  }
}

export function startOfflineDataPreparation() {
  if (
    started ||
    typeof window === "undefined"
  ) {
    return;
  }

  started = true;

  const run = () => {
    void prepareCurrentEvent();
  };

  window.addEventListener("online", run);
  window.setInterval(run, PREPARATION_INTERVAL_MS);
  window.setTimeout(run, 1500);
}
