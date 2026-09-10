import {
  collection,
  doc,
  getDocs,
} from "firebase/firestore";

import { db } from "../firebase";
import {
  EVENT_DATA_COLLECTION,
  EVENT_MEMBERS_COLLECTION,
  MEMBER_CARDS_COLLECTION,
  TICKETS_COLLECTION,
  getEventDataId,
} from "../firestorePaths";
import { replaceTicketsForEvent } from "../localdb/ticketLocal";
import { saveMembers } from "../localdb/memberLocal";
import type { Member, Ticket } from "../localdb/types";

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export type OfflineDataPreparationResult = {
  eventId: string;
  eventName: string;
  ticketCount: number;
  memberCount: number;
};

export async function prepareEventOfflineData(
  eventId: string,
  eventName: string,
): Promise<OfflineDataPreparationResult> {
  if (!eventId.trim() || !eventName.trim()) {
    throw new Error("オフライン準備に必要なイベント情報がありません。");
  }

  const eventDataId = getEventDataId(eventName);
  const eventDataDocument = doc(
    db,
    EVENT_DATA_COLLECTION,
    eventDataId,
  );

  const [ticketSnapshot, memberSnapshot, memberCardSnapshot] =
    await Promise.all([
      getDocs(
        collection(
          eventDataDocument,
          TICKETS_COLLECTION,
        ),
      ),
      getDocs(
        collection(
          eventDataDocument,
          EVENT_MEMBERS_COLLECTION,
        ),
      ),
      getDocs(
        collection(
          db,
          MEMBER_CARDS_COLLECTION,
        ),
      ),
    ]);

  const tickets: Ticket[] = ticketSnapshot.docs.flatMap((snapshot) => {
    const data = snapshot.data();

    if (
      !isString(data.qrNumber) ||
      !isString(data.authToken)
    ) {
      return [];
    }

    return [
      {
        id: isString(data.id) ? data.id : snapshot.id,
        eventId,
        qrNumber: data.qrNumber,
        authToken: data.authToken,
        createdAt: Date.parse(data.createdAt) || Date.now(),
        updatedAt: Date.now(),
      },
    ];
  });

  const memberCards = new Map<
    string,
    { authToken: string; id: string }
  >();

  memberCardSnapshot.docs.forEach((snapshot) => {
    const data = snapshot.data();

    if (
      isString(data.qrNumber) &&
      isString(data.authToken)
    ) {
      memberCards.set(data.qrNumber, {
        authToken: data.authToken,
        id: isString(data.id) ? data.id : snapshot.id,
      });
    }
  });

  const members: Member[] = memberSnapshot.docs.flatMap((snapshot) => {
    const data = snapshot.data();
    const qrNumber = isString(data.qrNumber)
      ? data.qrNumber
      : snapshot.id;
    const card = memberCards.get(qrNumber);

    if (!isString(data.name) || !card) {
      return [];
    }

    return [
      {
        // ReceptionService validates the QR number against member.id,
        // so the local identity is deliberately the QR number.
        id: qrNumber,
        eventId,
        name: data.name,
        qrToken: card.authToken,
        status: data.status === "入室中" ? "inside" : "outside",
        updatedAt: Date.now(),
      },
    ];
  });

  await replaceTicketsForEvent(eventId, tickets);
  await saveMembers(members);

  return {
    eventId,
    eventName,
    ticketCount: tickets.length,
    memberCount: members.length,
  };
}
