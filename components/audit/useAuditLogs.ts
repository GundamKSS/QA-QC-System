"use client";

import { useApiRead } from "@/lib/api/client";
import { auditQueryString, type AuditLogPayload, type AuditQuery } from "@/lib/audit/query";

export function useAuditLogs(query: AuditQuery) {
  return useApiRead<AuditLogPayload>(`/api/admin/audit${auditQueryString(query)}`);
}
