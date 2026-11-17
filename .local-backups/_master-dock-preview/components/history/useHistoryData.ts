"use client";

import { useApiRead } from "@/lib/api/client";
import type { HistoryPayload } from "@/lib/plans/history";
import { historyQuery, type HistoryValues } from "@/lib/plans/history-query";

/** Reads one page of ประวัติ from `GET /api/history`; a new filter or page changes the address and so loads again. */
export function useHistoryData(values: HistoryValues) {
  const query = historyQuery(values);
  return useApiRead<HistoryPayload>(query ? `/api/history?${query}` : "/api/history");
}
