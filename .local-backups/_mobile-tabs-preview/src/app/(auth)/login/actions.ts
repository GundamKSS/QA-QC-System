"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authPolicy } from "@/config/auth";
import { visibleAttemptsLeft } from "@/lib/auth/attempts";
import { audit, auditContext, auditedCode } from "@/lib/auth/audit";
import { EMPLOYEE_CODE_MAX, normalizeEmployeeCode, PASSWORD_MAX, safeNextPath } from "@/lib/auth/employee-code";
import { authenticate } from "@/lib/auth/authenticate";
import { getLocalStore } from "@/lib/auth/local-runtime";
import { createSession } from "@/lib/auth/session";
import { dbConfigured } from "@/lib/db/config";
import { syncUserOnLogin } from "@/lib/db/users";
import type { LoginState } from "@/lib/auth/types";

/**
 * `next` comes from a hidden field filled after hydration. A submit before hydration (or
 * without JS) sends it empty, so fall back to the page's own URL — same-origin POSTs carry the
 * full Referer under our strict-origin-when-cross-origin policy.
 */
function requestedNext(formData: FormData, requestHeaders: Headers): string | null {
  const fromForm = formData.get("next");
  if (typeof fromForm === "string" && fromForm) return fromForm;
  const referer = requestHeaders.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).searchParams.get("next");
  } catch {
    return null;
  }
}

/**
 * Login Server Action (FR-AUTH-01). Works before hydration: without JS (`enhanced` absent)
 * a success redirects; with JS it returns the success state so the client can play the
 * welcome transition first. The login page never reads the session, so the re-render
 * that follows `cookies().set` doesn't redirect underneath the form.
 */
export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const at = Date.now();
  const rawCode = formData.get("employeeCode");
  const employeeCode = process.env.QCHECK_AUTH === "mock"
    ? normalizeEmployeeCode(rawCode)
    : typeof rawCode === "string" ? rawCode.trim().slice(0, EMPLOYEE_CODE_MAX) : "";
  const password = formData.get("password");
  const enhanced = formData.get("enhanced") === "1";

  const missingCode = normalizeEmployeeCode(employeeCode).length === 0;
  const missingPassword = typeof password !== "string" || password.length === 0;
  if (missingCode || missingPassword) {
    return {
      status: "invalid",
      employeeCode,
      attemptsLeft: null,
      fieldErrors: { employeeCode: missingCode, password: missingPassword },
      at,
    };
  }
  if (password.length > PASSWORD_MAX) {
    return { status: "invalid", employeeCode, attemptsLeft: null, at };
  }

  const requestHeaders = await headers();
  const context = auditContext(requestHeaders);
  const result = await authenticate(typeof rawCode === "string" ? rawCode : employeeCode, password, { ip: context.ip });

  if (result.kind === "success") {
    const { user } = result;
    // Persist the user + role snapshot (DEC-09). Only for central logins and only when a DB is configured.
    if (process.env.QCHECK_AUTH !== "mock" && user.source !== "LOCAL" && dbConfigured()) {
      try {
        await syncUserOnLogin(user);
      } catch (error) {
        // The central system already vouched for this user and the session cookie carries their
        // profile and roles, so a database outage must not lock office staff out. The snapshot is
        // refreshed on their next login; the failure is logged and audited.
        console.error("[db] user sync failed", error instanceof Error ? error.message : error);
        audit({ action: "login.unavailable", employeeCode: user.employeeCode, userId: user.id, reason: "database user sync" }, context);
      }
    }
    if (user.source === "LOCAL") await getLocalStore().touchLogin(user.id).catch(() => {});
    await createSession(user);
    audit({ action: "login.success", employeeCode: user.employeeCode, userId: user.id }, context);
    if (result.unknownRoles?.length) {
      audit({ action: "login.unknown_role", employeeCode: user.employeeCode, userId: user.id, roles: result.unknownRoles }, context);
    }
    const next = user.mustChangePassword
      ? authPolicy.changePasswordPath
      : safeNextPath(requestedNext(formData, requestHeaders), authPolicy.homePath);
    if (!enhanced) redirect(next);
    return { status: "success", employeeCode, next, fullName: user.fullName, at };
  }

  const logged = { employeeCode: auditedCode(result.account, employeeCode), userId: result.account?.id };
  switch (result.kind) {
    case "locked":
      if (result.justLocked) {
        audit({ action: "login.failure", ...logged }, context);
        audit({ action: "login.lockout", ...logged, lockedUntil: result.lockedUntil }, context);
      } else {
        audit({ action: "login.locked", ...logged }, context);
      }
      return { status: "locked", employeeCode, lockedUntil: result.lockedUntil, at };
    case "pinLocked":
      if (result.justLocked) {
        audit({ action: "login.pin_failure", ...logged }, context);
        audit({ action: "login.pin_lockout", ...logged }, context);
      } else {
        audit({ action: "login.pin_locked", ...logged }, context);
      }
      return { status: "pinLocked", employeeCode, at };
    case "disabled":
      audit({ action: "login.disabled", ...logged }, context);
      return { status: "disabled", employeeCode, at };
    case "forbidden":
      audit({ action: "login.forbidden", ...logged }, context);
      if (result.unknownRoles?.length) {
        audit({ action: "login.unknown_role", ...logged, roles: result.unknownRoles }, context);
      }
      return { status: "forbidden", employeeCode, message: result.reason, at };
    case "unavailable":
      audit({ action: "login.unavailable", ...logged, reason: result.message }, context);
      return { status: "unavailable", employeeCode, at };
    case "busy":
      // Only scripted parallel requests get here; answer like any other failure.
      audit({ action: "login.throttled", ...logged }, context);
      return { status: "invalid", employeeCode, attemptsLeft: null, at };
    case "invalid":
      audit({ action: "login.failure", ...logged }, context);
      return { status: "invalid", employeeCode, attemptsLeft: visibleAttemptsLeft(result.attemptsLeft), at };
  }
}
