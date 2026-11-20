import type { WorkOrderType } from "@/lib/plans/rules";

export type NotificationKind = "assigned" | "returned" | "qa_handover";

/** Current work requiring this signed-in person's attention. */
export type WorkNotification = {
  id: string;
  workOrderId: string;
  kind: NotificationKind;
  status: "IN_PROGRESS" | "RETURNED";
  title: string;
  body: string;
  href: string;
  createdAt: string;
  woNo: string;
  modelCode: string;
  calledDate: string;
  qtyNeed: number;
  qtyDone: number;
  type: WorkOrderType;
};

/** Persisted record of a notification previously read by this user (cross-device history). */
export type NotificationHistoryItem = {
  id: string;
  woNo: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  readAt: string;
};

export type NotificationReadInput = {
  id: string;
  woNo?: string | null;
  kind?: NotificationKind;
  title?: string | null;
  body?: string | null;
  href?: string | null;
};

export type NotificationSnapshot = {
  /** Session identity, also used to keep this device's read state separate for each account. */
  userId: string;
  items: WorkNotification[];
  total: number;
  /** Server-synced read receipt IDs for this account (when DB/store is available). */
  readIds?: string[];
  /** Recent notifications this account has marked as read across devices. */
  history?: NotificationHistoryItem[];
  /** True when read receipts are persisted server-side (cross-device sync). */
  synced?: boolean;
};
