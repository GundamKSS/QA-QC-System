"use client";

import { useApiRead } from "@/lib/api/client";
import type { AdminUsersPayload } from "@/lib/auth/admin-users";

/** Reads the field users from `GET /api/admin/users`; it loads again by itself after any form on the page saves. */
export function useAdminUsers() {
  return useApiRead<AdminUsersPayload>("/api/admin/users");
}
