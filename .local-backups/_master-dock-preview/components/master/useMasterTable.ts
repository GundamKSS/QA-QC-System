"use client";

import { useApiRead } from "@/lib/api/client";
import type { MasterTablePayload } from "@/lib/master/table";
import { masterTableApiQuery, type MasterTableValues } from "@/lib/master/table-query";

/** Reads one master table's rows from `GET /api/master/<table>`; the address values (filters, open form) are the request, and it loads again after a form saves. */
export function useMasterTable(slug: string, values: MasterTableValues) {
  const query = masterTableApiQuery(values);
  return useApiRead<MasterTablePayload>(`/api/master/${encodeURIComponent(slug)}${query ? `?${query}` : ""}`);
}
