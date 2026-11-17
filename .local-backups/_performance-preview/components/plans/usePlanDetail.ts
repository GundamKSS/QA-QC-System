"use client";

import { useApiRead } from "@/lib/api/client";
import type { PlanDetailPayload } from "@/lib/plans/detail";

/** Reads one plan (header, sibling plans, history, vendor choices) from `GET /api/plans/[id]`; it loads again by itself after a form on the page saves. */
export function usePlanDetail(planId: number) {
  return useApiRead<PlanDetailPayload>(`/api/plans/${planId}`);
}
