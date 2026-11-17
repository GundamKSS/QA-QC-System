import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { authPolicy } from "@/config/auth";
import { getLocalStore } from "./local-runtime";
import { checkLocalRoles } from "./local-users";
import { findUserById, mockAuthEnabled, toSessionUser } from "./mock-adapter";
import { knownRoles } from "./roles";
import { readSession } from "./session";
import type { SessionUser } from "./types";
import { canAccessPage, type AppPage } from "./page-access";

/**
 * Data Access Layer: the only place pages read who is signed in.
 * Mock users are re-checked against their local record. Central profiles/roles are
 * snapshots from login until the session expires; live revalidation awaits G2 in docs/08.
 * Reads cookies, so callers must sit inside a <Suspense> boundary (Cache Components).
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await readSession();
  if (!session) return null;

  // 0. Field (LOCAL) users have no central profile: their record is the source of truth, so a
  //    deactivation or role change by an Admin takes effect on the very next request (docs/12 §2 R5).
  if (session.source === "LOCAL") {
    const local = await getLocalStore().findById(session.id);
    if (!local || !local.isActive) return null;
    const { roles } = checkLocalRoles(local.roles);
    if (roles.length === 0) return null;
    return { id: local.id, employeeCode: local.employeeCode, fullName: local.fullName, roles, mustChangePassword: local.mustChangePin, source: "LOCAL" };
  }

  // 1. Check local/mock user store if present
  const user = process.env.QCHECK_AUTH === "mock" && mockAuthEnabled() ? await findUserById(session.id) : undefined;
  if (user) {
    if (!user.isActive) return null;
    return toSessionUser(user);
  }

  // 2. If authenticated via Datacenter API (session claims contain profile)
  if (session.fullName) {
    const roles = knownRoles(session.roles);
    if (roles.length === 0) return null;
    return {
      id: session.id,
      employeeCode: session.employeeCode,
      fullName: session.fullName,
      roles,
      mustChangePassword: session.mustChangePassword ?? false,
      email: session.email,
    };
  }

  return null;
});

function loginUrl(returnTo?: string) {
  return returnTo ? `${authPolicy.loginPath}?next=${encodeURIComponent(returnTo)}` : authPolicy.loginPath;
}

/** For pages inside the app: signed in and done with the forced password change. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginUrl(returnTo));
  if (user.mustChangePassword) redirect(authPolicy.changePasswordPath);
  return user;
}

/** Call inside each page's data loader, before reading protected data. A layout
 * or hidden menu alone cannot secure direct URLs, RSC requests or Server Actions. */
export async function requirePageAccess(page: AppPage, returnTo?: string): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (!canAccessPage(user.roles, page)) notFound();
  return user;
}

/** For the change-password screen: signed in, password change may still be pending. */
export async function requireSignedIn(returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginUrl(returnTo));
  return user;
}
