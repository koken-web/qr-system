import { getEvent } from "../localdb/eventLocal";
import { prepareEventOfflineData } from "./offlineDataPreparationService";

const CURRENT_EVENT_ID_STORAGE_KEY = "qr-management-current-event-id";
const PREPARATION_INTERVAL_MS = 5000;

let started = false;
let preparing = false;

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
      return;
    }

    const result = await prepareEventOfflineData(
      event.id,
      event.name,
    );

    console.info(
      `オフライン準備: ${result.eventName} / チケット${result.ticketCount}件 / 部員${result.memberCount}件`,
    );
  } catch (error) {
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
