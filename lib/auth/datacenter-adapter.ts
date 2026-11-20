import "server-only";
import { authPolicy } from "@/lib/config/auth";
import { parseProgramRole, resolveEffectiveRoles } from "./roles";
import type {
  DatacenterAuthResponse,
  DatacenterProgram,
  PermissionCheckResult,
  SessionUser,
} from "./types";

export type DatacenterAuthResult =
  | { kind: "success"; user: SessionUser; unknownRoles: string[] }
  | { kind: "forbidden"; reason: string; account: { id: string; employeeCode: string }; unknownRoles?: string[] }
  | { kind: "invalid" }
  | { kind: "disabled"; account?: { id: string; employeeCode: string } }
  | { kind: "error"; message: string };

/**
 * Checks if the user has active permission for the target program (e.g. PRG003).
 */
export function checkProgramPermission(
  programs: DatacenterProgram[] | undefined,
  targetProgramCode: string = process.env.PROGRAM_CODE || authPolicy.datacenter.defaultProgramCode,
): PermissionCheckResult {
  if (!Array.isArray(programs) || programs.length === 0) {
    return {
      allowed: false,
      reason: "not_granted",
      message: `คุณไม่มีสิทธิ์เข้าใช้งานโปรแกรมนี้ (${targetProgramCode}) กรุณาติดต่อผู้ดูแลระบบ`,
    };
  }

  const normalizedTarget = targetProgramCode.trim().toUpperCase();
  const program = programs.find((p) => p.program_code?.trim().toUpperCase() === normalizedTarget);

  if (!program) {
    return {
      allowed: false,
      reason: "not_granted",
      message: `คุณไม่มีสิทธิ์เข้าใช้งานโปรแกรมนี้ (${targetProgramCode}) กรุณาติดต่อผู้ดูแลระบบ`,
    };
  }

  if (program.can_use !== true) {
    return {
      allowed: false,
      reason: "cannot_use",
      message: `สิทธิ์การเข้าใช้งานโปรแกรม ${targetProgramCode} ถูกระงับ กรุณาติดต่อผู้ดูแลระบบ`,
      program,
    };
  }

  if (program.is_active !== true) {
    return {
      allowed: false,
      reason: "inactive",
      message: `โปรแกรม ${targetProgramCode} ปิดการใช้งานอยู่ในขณะนี้ กรุณาติดต่อผู้ดูแลระบบ`,
      program,
    };
  }

  return { allowed: true, program };
}

/**
 * Resolves the full URL to the Datacenter auth endpoint.
 */
export function getDatacenterAuthUrl(): string {
  const baseUrl =
    process.env.API_DATACENTER ||
    process.env.API_Datacenter ||
    authPolicy.datacenter.defaultBaseUrl;
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const endpointPath = authPolicy.datacenter.authPermissionProgPath.replace(/^\/+/, "");
  return `${cleanBase}/${endpointPath}`;
}

/** Give up on the central system after this long and say so (FR-AUTH-08). */
const TIMEOUT_MS = Number(process.env.CENTRAL_AUTH_TIMEOUT_MS) || 5000;

/** A 200 that doesn't look like the agreed shape is a central-side fault, not a wrong password. */
function isAuthResponse(data: unknown): data is DatacenterAuthResponse {
  if (typeof data !== "object" || data === null) return false;
  const record = data as Record<string, unknown>;
  return typeof record.employee_no === "string" && record.employee_no.trim().length > 0
    && (record.display_name === undefined || typeof record.display_name === "string")
    && (record.email === undefined || typeof record.email === "string")
    && Array.isArray(record.programs) && record.programs.every((program: unknown) => {
      if (typeof program !== "object" || program === null) return false;
      const item = program as Record<string, unknown>;
      return typeof item.program_code === "string" && typeof item.can_use === "boolean" && typeof item.is_active === "boolean";
    });
}

/**
 * Authenticates against API_Datacenter/auth/auth_permission_prog
 * and verifies program permission for PRG003.
 */
export async function authenticateWithDatacenter(
  username: string,
  password: string,
  targetProgramCode: string = process.env.PROGRAM_CODE || authPolicy.datacenter.defaultProgramCode,
): Promise<DatacenterAuthResult> {
  const authUrl = getDatacenterAuthUrl();

  try {
    const res = await fetch(authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        username,
        password,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 401) {
      return { kind: "invalid" };
    }

    if (res.status === 403) {
      return { kind: "disabled" };
    }

    if (!res.ok) {
      // The body may echo the request; keep only the status in logs.
      return { kind: "error", message: `Datacenter API error (${res.status})` };
    }

    const data: unknown = await res.json().catch(() => null);
    if (!isAuthResponse(data)) {
      return { kind: "error", message: "Datacenter API returned an unexpected response" };
    }
    const permission = checkProgramPermission(data.programs, targetProgramCode);

    const account = {
      id: data.employee_no,
      employeeCode: data.employee_no,
    };

    if (!permission.allowed) {
      return {
        kind: "forbidden",
        reason: permission.message,
        account,
      };
    }

    // ProgramPermission carries coarse levels only (User / Admin / Dev); granular sub-roles live in QCheck's DB.
    const { programRole, unknown } = parseProgramRole(permission.program.role_prog);
    if (!programRole) {
      return {
        kind: "forbidden",
        reason: `บัญชีนี้ยังไม่ได้รับบทบาทระดับโปรแกรม (User / Admin / Dev) ใน QA & QC System (${targetProgramCode}) กรุณาติดต่อผู้ดูแลระบบ`,
        account,
        unknownRoles: unknown,
      };
    }

    // access_token stays here: it never reaches the session or the browser.
    // For DEV, resolveEffectiveRoles immediately grants all QCheck roles; for USER/ADMIN,
    // sub-roles are loaded from dbo.user_roles right after login.
    const user: SessionUser = {
      id: account.id,
      employeeCode: account.employeeCode,
      fullName: data.display_name || data.employee_no,
      roles: resolveEffectiveRoles(programRole, []),
      programRole,
      mustChangePassword: false,
      email: data.email || undefined,
    };

    return { kind: "success", user, unknownRoles: unknown };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Unknown network error",
    };
  }
}
