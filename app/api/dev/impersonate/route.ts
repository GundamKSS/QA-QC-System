import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { mockUsers } from "@/lib/auth/mock-users";
import { knownProgramRole, knownRoles, resolveEffectiveRoles } from "@/lib/auth/roles";
import { isSameOriginRequest } from "@/lib/auth/same-origin";
import { createSession } from "@/lib/auth/session";
import { ROLES, type ProgramRole, type Role } from "@/lib/auth/types";
import { dbConfigured } from "@/lib/db/config";
import { getPool } from "@/lib/db/pool";

/**
 * Only an authenticated DEV user (or a session currently impersonating another user on behalf of DEV)
 * may list personas or switch identities. Unauthenticated callers get 401; non-DEV users get 403.
 */
async function requireDevImpersonator() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { ok: false as const, error: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) };
  }
  if (currentUser.programRole !== "DEV" && !currentUser.impersonatedByDev) {
    return { ok: false as const, error: NextResponse.json({ error: "Dev role required" }, { status: 403 }) };
  }
  return { ok: true as const, currentUser };
}

function formatRoleLabel(entry: { employeeCode: string; programRole?: ProgramRole; roles: Role[] }): string {
  if (entry.programRole === "DEV") return "DEV (ทุกสิทธิ์)";
  const hasAllAdmin =
    entry.roles.includes("ADMIN") &&
    entry.roles.includes("MASTERDATA_ADMIN") &&
    entry.roles.includes("QC_HEAD") &&
    entry.roles.includes("QA_HEAD");
  if (hasAllAdmin) return "ซูเปอร์แอดมิน (Super Admin)";
  if (entry.roles.includes("ADMIN") || entry.programRole === "ADMIN") return "ผู้ดูแลระบบ (Admin)";
  if (entry.roles.includes("MASTERDATA_ADMIN")) return "ผู้ดูแลข้อมูลหลัก (Master Admin)";
  if (entry.roles.includes("QC_HEAD")) return "หัวหน้า QC (QC Head)";
  if (entry.roles.includes("QA_HEAD")) return "หัวหน้า QA (QA Head)";
  if (entry.roles.includes("QA_INSPECTOR")) return "ผู้ตรวจ QA (Inspector)";
  if (entry.roles.includes("QC_INSPECTOR")) return "ผู้ตรวจ QC (Inspector)";
  if (entry.roles.includes("PURCHASING")) return "จัดซื้อ (Purchasing)";
  if (entry.roles.includes("PM")) return "PM";
  if (entry.roles.includes("MANAGEMENT")) return "ผู้บริหาร (Management)";
  return "ยังไม่มีสิทธิ์ย่อย";
}

export async function GET() {
  const auth = await requireDevImpersonator();
  if (!auth.ok) return auth.error;
  const { currentUser } = auth;

  if (dbConfigured()) {
    try {
      const pool = await getPool();
      const res = await pool
        .request()
        .query<{
          id: string;
          employee_code: string;
          full_name: string;
          is_active: boolean;
          program_role: string | null;
          role: string | null;
        }>(
          `SELECT CAST(u.id AS VARCHAR(20)) AS id, u.employee_code, u.full_name, u.is_active, u.program_role, r.role
           FROM dbo.users u
           LEFT JOIN dbo.user_roles r ON r.user_id = u.id
           WHERE u.is_active = 1
           ORDER BY u.id`,
        );

      const userMap = new Map<
        string,
        { id: string; employeeCode: string; fullName: string; programRole?: ProgramRole; rawRoles: string[] }
      >();
      for (const row of res.recordset) {
        let entry = userMap.get(row.id);
        if (!entry) {
          entry = {
            id: row.id,
            employeeCode: row.employee_code,
            fullName: row.full_name,
            programRole: knownProgramRole(row.program_role),
            rawRoles: [],
          };
          userMap.set(row.id, entry);
        }
        if (row.role) entry.rawRoles.push(row.role);
      }

      const users = Array.from(userMap.values()).map((u) => {
        const roles = knownRoles(u.rawRoles);
        return {
          id: u.id,
          employeeCode: u.employeeCode,
          fullName: u.fullName,
          programRole: u.programRole ?? null,
          role: formatRoleLabel({ employeeCode: u.employeeCode, programRole: u.programRole, roles }),
        };
      });

      return NextResponse.json({
        users,
        currentUserId: currentUser.id,
        currentEmployeeCode: currentUser.employeeCode,
      });
    } catch {
      // Fallback to mock
    }
  }

  const users = [
    { id: "2", employeeCode: "dev", fullName: "dev gundam", programRole: "DEV", role: "DEV (ทุกสิทธิ์)" },
    ...mockUsers.map((u) => ({
      id: u.id,
      employeeCode: u.employeeCode,
      fullName: u.fullName,
      programRole: "USER",
      role: formatRoleLabel({ employeeCode: u.employeeCode, roles: u.roles }),
    })),
  ];

  return NextResponse.json({
    users,
    currentUserId: currentUser.id,
    currentEmployeeCode: currentUser.employeeCode,
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request.headers)) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }
  const auth = await requireDevImpersonator();
  if (!auth.ok) return auth.error;

  const body = (await request.json().catch(() => ({}))) as { employeeCode?: string; userId?: string };
  const targetCode = body.employeeCode?.trim();
  const targetId = body.userId?.trim();

  if (!targetCode && !targetId) {
    return NextResponse.json({ error: "Missing employeeCode or userId" }, { status: 422 });
  }

  let selectedUser: {
    id: string;
    employeeCode: string;
    fullName: string;
    roles: Role[];
    programRole?: ProgramRole;
    source?: "LOCAL";
  } | null = null;

  if (dbConfigured()) {
    try {
      const pool = await getPool();
      const req = pool.request();
      let query = `
        SELECT CAST(u.id AS VARCHAR(20)) AS id, u.employee_code, u.full_name, u.source, u.program_role, r.role
        FROM dbo.users u
        LEFT JOIN dbo.user_roles r ON r.user_id = u.id
        WHERE u.is_active = 1
      `;
      if (targetCode) {
        req.input("code", targetCode);
        query += " AND u.employee_code = @code";
      } else if (targetId) {
        req.input("id", targetId);
        query += " AND u.id = @id";
      }
      const res = await req.query<{
        id: string;
        employee_code: string;
        full_name: string;
        source: string;
        program_role: string | null;
        role: string | null;
      }>(query);
      if (res.recordset.length > 0) {
        const first = res.recordset[0];
        const isLocal = first.source === "LOCAL";
        const programRole = isLocal
          ? undefined
          : knownProgramRole(first.program_role) ?? (first.employee_code.toLowerCase() === "dev" ? "DEV" : undefined);
        const appRoles = knownRoles(res.recordset.map((r) => r.role).filter((r): r is string => Boolean(r)));
        selectedUser = {
          id: first.id,
          employeeCode: first.employee_code,
          fullName: first.full_name,
          programRole,
          roles: resolveEffectiveRoles(programRole, appRoles),
          source: isLocal ? "LOCAL" : undefined,
        };
      }
    } catch {
      // Fallback to mock
    }
  }

  if (!selectedUser) {
    if (targetCode?.toLowerCase() === "dev") {
      selectedUser = { id: "2", employeeCode: "dev", fullName: "dev gundam", programRole: "DEV", roles: [...ROLES] };
    } else {
      const found = mockUsers.find((u) => u.employeeCode === targetCode || u.id === targetId);
      if (found) {
        selectedUser = {
          id: found.id,
          employeeCode: found.employeeCode,
          fullName: found.fullName,
          roles: found.roles,
        };
      }
    }
  }

  if (!selectedUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await createSession({
    id: selectedUser.id,
    employeeCode: selectedUser.employeeCode,
    fullName: selectedUser.fullName,
    roles: selectedUser.roles,
    programRole: selectedUser.programRole,
    // Keep the encrypted Dev-impersonation flag when switching into non-DEV accounts so Dev can switch back.
    impersonatedByDev: selectedUser.programRole !== "DEV",
    mustChangePassword: false,
    source: selectedUser.source,
  });

  return NextResponse.json({ ok: true, user: selectedUser });
}
