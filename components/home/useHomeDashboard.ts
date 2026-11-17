"use client";

import { useApiRead } from "@/lib/api/client";
import type { HomeDashboardPayload } from "@/lib/plans/home";

/** Reads the totals, the newest plans and the nearest deadlines from `GET /api/home`; the search words (`?q=`) are part of the address. */
export function useHomeDashboard(query: string) {
  return useApiRead<HomeDashboardPayload>(query ? `/api/home?q=${encodeURIComponent(query)}` : "/api/home");
}
