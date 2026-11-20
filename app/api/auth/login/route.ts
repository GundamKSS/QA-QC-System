import { readFields } from "@/lib/api/body";
import { apiMessages } from "@/lib/api/messages";
import { apiJson } from "@/lib/api/response";
import { visibleAttemptsLeft } from "@/lib/auth/attempts";
import { audit, auditContext, auditedCode } from "@/lib/auth/audit";
import { authenticate } from "@/lib/auth/authenticate";
import { EMPLOYEE_CODE_MAX, normalizeEmployeeCode, PASSWORD_MAX, safeNextPath } from "@/lib/auth/employee-code";
import { getLocalStore } from "@/lib/auth/local-runtime";
import { hasAppAccess, resolveEffectiveRoles } from "@/lib/auth/roles";
import { isSameOriginRequest } from "@/lib/auth/same-origin";
import { createSession } from "@/lib/auth/session";
import type { LoginState, SessionUser } from "@/lib/auth/types";
import { authPolicy } from "@/lib/config/auth";
import { dbConfigured } from "@/lib/db/config";
import { syncUserOnLogin } from "@/lib/db/users";

/** A login is a code and a password; a body bigger than this is not one. */
const MAX_BODY_BYTES = 16 * 1024;

const answer = (state: LoginState, status = 200) => apiJson(state, status);

/**
 * Sign in (FR-AUTH-01). There is no session yet, so this is not behind `guardApi`: it checks the
 * origin itself and answers one of the `LoginState`s the form renders. The form plays its welcome
 * animation on `success` and then loads `next` as a full page (so nothing of the previous user
 * stays in memory on a shared device) — which is why a success carries `next`, not `redirectTo`.
 *
 * Wrong code or password is 401, a malformed body 422, a lock 423, a closed account or missing
 * permission 403, the central system being down 503. The password is never logged or audited.
 */
export async function POST(request: Request) {
  const at = Date.now();
  if (!isSameOriginRequest(request.headers)) return answer({ status: "forbidden", employeeCode: "", message: apiMessages.origin, at }, 403);

  const fields = await readFields(request, { maxBytes: MAX_BODY_BYTES });
  const rawCode = fields.get("employeeCode");
  const employeeCode = process.env.QCHECK_AUTH === "mock" ? normalizeEmployeeCode(rawCode) : (rawCode?.trim().slice(0, EMPLOYEE_CODE_MAX) ?? "");
  const password = fields.get("password");

  const missingCode = normalizeEmployeeCode(employeeCode).length === 0;
  if (missingCode || !password) {
    return answer({ status: "invalid", employeeCode, attemptsLeft: null, fieldErrors: { employeeCode: missingCode, password: !password }, at }, 422);
  }
  if (password.length > PASSWORD_MAX) return answer({ status: "invalid", employeeCode, attemptsLeft: null, at }, 422);

  const context = auditContext(request.headers);
  const result = await authenticate(rawCode ?? employeeCode, password, { ip: context.ip });

  if (result.kind === "success") {
    let sessionUser: SessionUser = result.user;
    // Persist the user + ProgramPermission level, then read QCheck sub-roles from dbo.user_roles.
    // Only for central logins and only when a DB is configured.
    if (process.env.QCHECK_AUTH !== "mock" && sessionUser.source !== "LOCAL" && dbConfigured()) {
      try {
        const synced = await syncUserOnLogin(sessionUser);
        if (synced) {
          sessionUser = {
            ...sessionUser,
            id: synced.id,
            roles: resolveEffectiveRoles(sessionUser.programRole, synced.roles),
          };
        }
      } catch (error) {
        // The central system already vouched for this user and the session cookie carries their
        // profile and programRole, so a database outage must not lock office staff out.
        console.error("[db] user sync failed", error instanceof Error ? error.message : error);
        audit({ action: "login.unavailable", employeeCode: sessionUser.employeeCode, userId: sessionUser.id, reason: "database user sync" }, context);
      }
    }
    if (sessionUser.source === "LOCAL") await getLocalStore().touchLogin(sessionUser.id).catch(() => {});
    await createSession(sessionUser);
    audit({ action: "login.success", employeeCode: sessionUser.employeeCode, userId: sessionUser.id }, context);
    if (result.unknownRoles?.length) {
      audit({ action: "login.unknown_role", employeeCode: sessionUser.employeeCode, userId: sessionUser.id, roles: result.unknownRoles }, context);
    }
    const next = sessionUser.mustChangePassword
      ? authPolicy.changePasswordPath
      : !hasAppAccess(sessionUser)
        ? authPolicy.noAccessPath
        : safeNextPath(fields.get("next"), authPolicy.homePath);
    return answer({ status: "success", employeeCode, next, fullName: sessionUser.fullName, at });
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
      return answer({ status: "locked", employeeCode, lockedUntil: result.lockedUntil, at }, 423);
    case "pinLocked":
      if (result.justLocked) {
        audit({ action: "login.pin_failure", ...logged }, context);
        audit({ action: "login.pin_lockout", ...logged }, context);
      } else {
        audit({ action: "login.pin_locked", ...logged }, context);
      }
      return answer({ status: "pinLocked", employeeCode, at }, 423);
    case "disabled":
      audit({ action: "login.disabled", ...logged }, context);
      return answer({ status: "disabled", employeeCode, at }, 403);
    case "forbidden":
      audit({ action: "login.forbidden", ...logged }, context);
      if (result.unknownRoles?.length) {
        audit({ action: "login.unknown_role", ...logged, roles: result.unknownRoles }, context);
      }
      return answer({ status: "forbidden", employeeCode, message: result.reason, at }, 403);
    case "unavailable":
      audit({ action: "login.unavailable", ...logged, reason: result.message }, context);
      return answer({ status: "unavailable", employeeCode, at }, 503);
    case "busy":
      // Only scripted parallel requests get here; answer exactly like any other failure.
      audit({ action: "login.throttled", ...logged }, context);
      return answer({ status: "invalid", employeeCode, attemptsLeft: null, at }, 401);
    case "invalid":
      audit({ action: "login.failure", ...logged }, context);
      return answer({ status: "invalid", employeeCode, attemptsLeft: visibleAttemptsLeft(result.attemptsLeft), at }, 401);
  }
}
