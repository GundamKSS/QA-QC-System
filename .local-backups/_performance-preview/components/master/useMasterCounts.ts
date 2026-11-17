"use client";

import { useApiRead } from "@/lib/api/client";
import type { MasterCountsPayload } from "@/lib/master/counts";

/** Reads how many rows each master table has from `GET /api/master`. */
export function useMasterCounts() {
  return useApiRead<MasterCountsPayload>("/api/master");
}
