import type { WorkOrderType } from "@/lib/plans/rules";

/** Current work requiring this signed-in person's attention, rather than a historical event log. */
export type WorkNotification = {
  id: string;
  workOrderId: string;
  kind: "assigned" | "returned";
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

export type NotificationSnapshot = {
  /** Session identity, also used to keep this device's read state separate for each account. */
  userId: string;
  items: WorkNotification[];
  total: number;
};
