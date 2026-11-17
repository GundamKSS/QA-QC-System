"use client";

import { useApiRead } from "@/lib/api/client";
import type { WorkOrderFormPayload } from "@/lib/plans/work-order-form";

/** Reads what the open-work-order form draws from `GET /api/plans/[id]/work-orders`; it loads again when a refusal says the inspector list is stale. */
export function useWorkOrderForm(planId: number) {
  return useApiRead<WorkOrderFormPayload>(`/api/plans/${planId}/work-orders`);
}
