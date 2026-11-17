import "server-only";
import { canManageLocalUsers, canUnlockLocalUser } from "./local-admin";
import type { LocalUserDetail, LocalUserStore } from "./local-store";
import type { Role } from "./types";

/**
 * The field-user list for `GET /api/admin/users` (docs/12). The browser side (components/admin) imports only the
 * types from this file. Only what the page draws leaves the server — never `pinHash` — and whether the actor may
 * unlock a row is decided here from their roles, so the browser doesn't need the rules.
 */

export type AdminUserItem = {
  id: string;
  employeeCode: string;
  fullName: string;
  nickname: string | null;
  email: string | null;
  department: string | null;
  roles: Role[];
  isActive: boolean;
  hasPin: boolean;
  pinLocked: boolean;
  mustChangePin: boolean;
  /** Whether the signed-in actor may clear this row's PIN lock (Admin: any; QC Head: QC inspectors). */
  canUnlock: boolean;
  /** ISO 8601; the screen formats them for Thailand. */
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

export type AdminUsersPayload = { canManage: boolean; users: AdminUserItem[] };

const iso = (date: Date | null) => (date ? date.toISOString() : null);

function toItem(actorRoles: readonly Role[], user: LocalUserDetail): AdminUserItem {
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    fullName: user.fullName,
    nickname: user.nickname,
    email: user.email,
    department: user.department,
    roles: [...user.roles],
    isActive: user.isActive,
    hasPin: user.hasPin,
    pinLocked: user.pinLocked,
    mustChangePin: user.mustChangePin,
    canUnlock: canUnlockLocalUser(actorRoles, user),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: iso(user.lastLoginAt),
  };
}

export async function loadLocalUsers(store: LocalUserStore, actorRoles: readonly Role[]): Promise<AdminUsersPayload> {
  const users = await store.list();
  return { canManage: canManageLocalUsers(actorRoles), users: users.map((user) => toItem(actorRoles, user)) };
}
