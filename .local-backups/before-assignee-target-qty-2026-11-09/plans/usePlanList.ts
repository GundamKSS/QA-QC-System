"use client";

import { useApiRead } from "@/lib/api/client";
import type { PlanListPayload } from "@/lib/plans/list";
import { planListQuery, type PlanListValues } from "@/lib/plans/list-query";

/** Reads one page of the plan list from `GET /api/plans`; a new filter, sort or page changes the address and so loads again. */
export function usePlanList(values: PlanListValues) {
  const query = planListQuery(values);
  return useApiRead<PlanListPayload>(query ? `/api/plans?${query}` : "/api/plans");
}
