import { getEvent } from "../localdb/eventLocal";
import { getTickets } from "../localdb/ticketLocal";
import { getMembers } from "../localdb/memberLocal";
import { getDevices } from "../localdb/deviceLocal";

export type OfflineReadinessCheck = {
  key: "event" | "tickets" | "members" | "devices" | "storage" | "sounds";
  ok: boolean;
  message: string;
};

export type OfflineReadinessResult = {
  ready: boolean;
  checks: OfflineReadinessCheck[];
};

export type OfflineReadinessOptions = {
  expectedTicketCount: number;
  expectedMemberCount?: number;
  expectedDeviceIds?: string[];
};

const SOUND_CACHE = "qr-reception-sounds-v2";
const SOUND_PATHS = [
  `${import.meta.env.BASE_URL}sounds/qr_scan_detected.wav?v=20260904-v2`,
  `${import.meta.env.BASE_URL}sounds/qr_result_chime.wav?v=20260904-v2`,
  `${import.meta.env.BASE_URL}sounds/qr_gate_error_chime_v1.wav?v=20260904-v2`,
] as const;

async function checkStorage(): Promise<OfflineReadinessCheck> {
  try {
    if (typeof indexedDB === "undefined") throw new Error();
    await getEvent("__readiness_probe__");
    return { key: "storage", ok: true, message: "端末データベースを利用できます。" };
  } catch {
    return { key: "storage", ok: false, message: "端末データベースを利用できません。" };
  }
}

async function checkEvent(eventId: string): Promise<OfflineReadinessCheck> {
  const event = await getEvent(eventId);
  return event
    ? { key: "event", ok: true, message: `${event.name}のイベント情報を確認しました。` }
    : { key: "event", ok: false, message: "イベント情報が端末に保存されていません。" };
}

async function checkTickets(eventId: string, expectedCount: number): Promise<OfflineReadinessCheck> {
  const tickets = await getTickets(eventId);
  if (tickets.length !== expectedCount) {
    return { key: "tickets", ok: false, message: `チケットが不足しています。${tickets.length}/${expectedCount}件です。` };
  }

  const ids = new Set<string>();
  const qrNumbers = new Set<string>();
  for (const ticket of tickets) {
    if (ticket.eventId !== eventId || !ticket.id.trim() || !ticket.qrNumber.trim() || !ticket.authToken.trim()) {
      return { key: "tickets", ok: false, message: "チケット情報に不正なデータがあります。" };
    }
    if (ids.has(ticket.id)) {
      return { key: "tickets", ok: false, message: `チケットIDが重複しています: ${ticket.id}` };
    }
    if (qrNumbers.has(ticket.qrNumber)) {
      return { key: "tickets", ok: false, message: `QR番号が重複しています: ${ticket.qrNumber}` };
    }
    ids.add(ticket.id);
    qrNumbers.add(ticket.qrNumber);
  }
  return { key: "tickets", ok: true, message: `チケット${tickets.length}件を確認しました。` };
}

async function checkMembers(eventId: string, expectedCount?: number): Promise<OfflineReadinessCheck> {
  const members = await getMembers(eventId);
  if (expectedCount !== undefined && members.length !== expectedCount) {
    return { key: "members", ok: false, message: `部員データが不足しています。${members.length}/${expectedCount}件です。` };
  }

  const qrTokens = new Set<string>();
  for (const member of members) {
    if (member.eventId !== eventId || !member.id.trim() || !member.name.trim() || !member.qrToken.trim()) {
      return { key: "members", ok: false, message: "部員データに不正なデータがあります。" };
    }
    if (qrTokens.has(member.qrToken)) {
      return { key: "members", ok: false, message: `部員QRが重複しています: ${member.qrToken}` };
    }
    qrTokens.add(member.qrToken);
  }
  return { key: "members", ok: true, message: `部員データ${members.length}件を確認しました。` };
}

async function checkDevices(eventId: string, expectedIds?: string[]): Promise<OfflineReadinessCheck> {
  const devices = await getDevices(eventId);
  const ids = new Set(devices.map((device) => device.id));
  if (expectedIds?.some((id) => !ids.has(id))) {
    return { key: "devices", ok: false, message: "必要な端末設定が端末に保存されていません。" };
  }
  if (devices.some((device) => !device.id.trim() || !device.name.trim())) {
    return { key: "devices", ok: false, message: "端末設定に不正なデータがあります。" };
  }
  return { key: "devices", ok: true, message: `端末設定${devices.length}件を確認しました。` };
}

async function checkSounds(): Promise<OfflineReadinessCheck> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return { key: "sounds", ok: false, message: "Cache Storageが利用できません。" };
  }
  try {
    const cache = await window.caches.open(SOUND_CACHE);
    const missing = [];
    for (const path of SOUND_PATHS) {
      const response = await cache.match(path);
      if (!response?.ok) missing.push(path);
    }
    return missing.length === 0
      ? { key: "sounds", ok: true, message: "受付音声は端末に保存されています。" }
      : { key: "sounds", ok: false, message: `受付音声が${missing.length}件端末に保存されていません。` };
  } catch {
    return { key: "sounds", ok: false, message: "受付音声の保存状態を確認できません。" };
  }
}

export async function checkOfflineReadiness(
  eventId: string,
  options: OfflineReadinessOptions,
): Promise<OfflineReadinessResult> {
  if (!eventId || !Number.isInteger(options.expectedTicketCount) || options.expectedTicketCount < 1) {
    return { ready: false, checks: [{ key: "event", ok: false, message: "オフライン準備確認に必要な情報が不正です。" }] };
  }

  try {
    const checks: OfflineReadinessCheck[] = [
      await checkStorage(),
      await checkEvent(eventId),
    ];
    if (checks.some((check) => !check.ok)) return { ready: false, checks };

    checks.push(await checkTickets(eventId, options.expectedTicketCount));
    checks.push(await checkMembers(eventId, options.expectedMemberCount));
    checks.push(await checkDevices(eventId, options.expectedDeviceIds));
    checks.push(await checkSounds());

    return { ready: checks.every((check) => check.ok), checks };
  } catch {
    return {
      ready: false,
      checks: [{ key: "event", ok: false, message: "オフライン準備状態の確認中にエラーが発生しました。" }],
    };
  }
}
