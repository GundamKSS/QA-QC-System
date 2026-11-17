"use client";

import { useApiRead } from "@/lib/api/client";
import type { OpenPlanPayload } from "@/lib/plans/open-data";

/** Reads the form's options and the just-opened plan from `GET /api/plans/options`; only `opened` is part of the address (the prefill is the form's own business). */
export function useOpenPlanData(openedId: number | null) {
  return useApiRead<OpenPlanPayload>(openedId !== null ? `/api/plans/options?opened=${openedId}` : "/api/plans/options");
}
