"use client";

import { useApiRead } from "@/lib/api/client";
import type { CentralUsersPayload } from "@/lib/db/central-users";

/** Reads CENTRAL users and their QCheck sub-roles from `GET /api/admin/central-users`. */
export function useCentralUsers() {
  return useApiRead<CentralUsersPayload>("/api/admin/central-users");
}
