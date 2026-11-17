"use client";

import { useApiRead } from "@/lib/api/client";
import type { WorkOrderListPayload } from "@/lib/plans/work-order-list";

/** Reads the work orders of one plan (and the inspectors, for whoever manages them) from `GET /api/plans/[id]/work-order-list`; used only while the "ใบงาน" tab is open. */
export function useWorkOrderList(planId: number) {
  return useApiRead<WorkOrderListPayload>(`/api/plans/${planId}/work-order-list`);
}
