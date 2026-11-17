"use client";

import { useApiRead } from "@/lib/api/client";
import type { InspectorHomePayload } from "@/lib/inspections/inspector-dashboard";

/**
 * Reads the inspector's monthly summary, urgent pending work items, and quick-action cards from `GET /api/home/inspector`.
 */
export function useInspectorDashboard(month?: string | null) {
  const address = month ? `/api/home/inspector?month=${encodeURIComponent(month)}` : "/api/home/inspector";
  return useApiRead<InspectorHomePayload>(address);
}
