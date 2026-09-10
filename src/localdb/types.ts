export type EventStatus =
  | "scheduled"
  | "active"
  | "ended";

export type ReceptionType =
  | "entry"
  | "exit";

export type ReceptionSubjectType =
  | "ticket"
  | "member";

export type DeviceType =
  | "entry"
  | "exit"
  | "control"
  | "admin";

export type DeviceStatus =
  | "online"
  | "offline";

export type SyncQueueItemType =
  | "reception"
  | "member"
  | "activity";

export type SyncQueueStatus =
  | "pending"
  | "processing"
  | "failed";

export type ActivityType =
  | "entry"
  | "exit"
  | "member_entry"
  | "member_exit"
  | "device_connected"
  | "device_disconnected"
  | "sync";

export type Event = {
  id: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  status: EventStatus;
  createdAt: number;
  updatedAt: number;
};

export type Ticket = {
  id: string;
  eventId: string;
  qrNumber: string;
  authToken: string;
  createdAt: number;
  updatedAt: number;
};

export type ReceptionEvent = {
  id: string;
  eventId: string;
  subjectType: ReceptionSubjectType;
  ticketId?: string;
  memberId?: string;
  qrNumber: string;
  type: ReceptionType;
  timestamp: number;
  deviceId: string;
  offline: boolean;
  createdAt: number;
};

export type Member = {
  id: string;
  eventId: string;
  name: string;
  qrToken: string;
  status: "inside" | "outside";
  updatedAt: number;
};

export type Device = {
  id: string;
  name: string;
  type: DeviceType;
  eventId?: string;
  status: DeviceStatus;
  lastSeenAt?: number;
  updatedAt: number;
};

export type SyncQueueItem = {
  id: string;
  eventId: string;
  type: SyncQueueItemType;
  data: unknown;
  createdAt: number;
  retryCount: number;
  status: SyncQueueStatus;
};

export type Activity = {
  id: string;
  eventId: string;
  type: ActivityType;
  targetId?: string;
  deviceId: string;
  timestamp: number;
  offline: boolean;
};
