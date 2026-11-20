import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { authPolicy } from "@/lib/config/auth";
import { dbConfigured } from "@/lib/db/config";
import { loadCentralUserState } from "@/lib/db/users";
import { getLocalStore } from "./local-runtime";
import { checkLocalRoles } from "./local-users";
import { findUserById, mockAuthEnabled, toSessionUser } from "./mock-adapter";
import { hasAppAccess, knownProgramRole, knownRoles, resolveEffectiveRoles } from "./roles";
import { readSession } from "./session";
import type { SessionUser } from "./types";
import { canAccessPage, type AppPage } from "./page-access";

/**
 * Data Access Layer: the only place pages read who is signed in.
 * - Field (LOCAL) users are re-checked against their DB record on every request.
 * - Central users with `programRole` (`USER` | `ADMIN` | `DEV`) resolve live QCheck sub-roles
 *   from `dbo.user_roles` when DB is configured, so role assignments by Admin/Dev take effect
 *   immediately without forcing re-login.
 * Reads cookies, so callers must sit inside a <Suspense> boundary (Cache Components).
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await readSession();
  if (!session) return null;

  const impFlag = session.impersonatedByDev ? { impersonatedByDev: true as const } : {};

  // 0. Field (LOCAL) users have no central profile: their record is the source of truth, so a
  //    deactivation or role change by an Admin takes effect on the very next request (docs/12 §2 R5).
  if (session.source === "LOCAL") {
    const local = await getLocalStore().findById(session.id);
    if (!local || !local.isActive) return null;
    const { roles } = checkLocalRoles(local.roles);
    if (roles.length === 0) return null;
    return { id: local.id, employeeCode: local.employeeCode, fullName: local.fullName, roles, mustChangePassword: local.mustChangePin, source: "LOCAL", ...impFlag };
  }

  // 1. Check local/mock user store if present
  const user = process.env.QCHECK_AUTH === "mock" && mockAuthEnabled() ? await findUserById(session.id) : undefined;
  if (user) {
    if (!user.isActive) return null;
    return { ...toSessionUser(user), ...impFlag };
  }

  // 2. Authenticated via Datacenter API (session claims contain profile + programRole)
  if (session.fullName) {
    const sessionProgramRole = knownProgramRole(session.programRole);
    const cookieRoles = knownRoles(session.roles);

    // DEV sees everything and every page
    if (sessionProgramRole === "DEV") {
      return {
        id: session.id,
        employeeCode: session.employeeCode,
        fullName: session.fullName,
        roles: resolveEffectiveRoles("DEV", []),
        programRole: "DEV",
        mustChangePassword: session.mustChangePassword ?? false,
        email: session.email,
        ...impFlag,
      };
    }

    // Live-read QCheck sub-roles from dbo.user_roles when DB is configured
    if (process.env.QCHECK_AUTH !== "mock" && dbConfigured()) {
      try {
        const live = await loadCentralUserState(session.employeeCode);
        if (live) {
          if (!live.isActive) return null;
          const programRole = sessionProgramRole ?? live.programRole;
          const roles = resolveEffectiveRoles(programRole, live.roles);
          return {
            id: live.id,
            employeeCode: session.employeeCode,
            fullName: session.fullName,
            roles,
            programRole,
            mustChangePassword: session.mustChangePassword ?? false,
            email: session.email,
            ...impFlag,
          };
        }
      } catch {
        // Transient DB error: fall back to cookie claims so office staff aren't logged out.
      }
    }

    const roles = resolveEffectiveRoles(sessionProgramRole, cookieRoles);
    if (!sessionProgramRole && roles.length === 0) return null;
    return {
      id: session.id,
      employeeCode: session.employeeCode,
      fullName: session.fullName,
      roles,
      programRole: sessionProgramRole,
      mustChangePassword: session.mustChangePassword ?? false,
      email: session.email,
      ...impFlag,
    };
  }

  return null;
});

function loginUrl(returnTo?: string) {
  return returnTo ? `${authPolicy.loginPath}?next=${encodeURIComponent(returnTo)}` : authPolicy.loginPath;
}

/** For pages inside the app: signed in, done with forced password change, and granted app access. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginUrl(returnTo));
  if (user.mustChangePassword) redirect(authPolicy.changePasswordPath);
  if (!hasAppAccess(user)) redirect(authPolicy.noAccessPath);
  return user;
}

/** Call inside each page's data loader, before reading protected data. A layout
 * or hidden menu alone cannot secure direct URLs, RSC requests or API routes (those start with `guardApi`). */
export async function requirePageAccess(page: AppPage, returnTo?: string): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (!canAccessPage(user.roles, page, user.programRole)) notFound();
  return user;
}

/** For the change-password and no-access screens: signed in, regardless of pending password change or sub-roles. */
export async function requireSignedIn(returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginUrl(returnTo));
  return user;
}
