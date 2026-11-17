"use client";

import { useApiRead } from "@/lib/api/client";
import type { JobsPayload, JobsViewName } from "@/lib/plans/jobs";

/**
 * Reads "งานของฉัน" from `GET /api/jobs`. The server ignores `notification`: an alert's link carries a new value,
 * which changes the address and so makes the list load again when the person taps it while already on this page.
 */
export function useJobsData(view: JobsViewName, notification: string | null) {
  const query = new URLSearchParams({ view });
  if (notification) query.set("notification", notification);
  return useApiRead<JobsPayload>(`/api/jobs?${query}`);
}
