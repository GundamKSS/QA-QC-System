import { NextResponse } from "next/server";
import { devRoleAllowed } from "@/lib/auth/roles";
import { createSession } from "@/lib/auth/session";
import { getPool } from "@/lib/db/pool";
import { dbConfigured } from "@/lib/db/config";
import { mockUsers } from "@/lib/auth/mock-users";
import { ROLES, type Role } from "@/lib/auth/types";
import { getCurrentUser } from "@/lib/auth/dal";

export async function GET() {
  if (!devRoleAllowed()) {
    return NextResponse.json({ error: "Dev role not allowed" }, { status: 403 });
  }

  const currentUser = await getCurrentUser();

  if (dbConfigured()) {
    try {
      const pool = await getPool();
      const res = await pool
        .request()
        .query<{ id: string; employee_code: string; full_name: string; is_active: boolean; role: string | null }>(
          `SELECT CAST(u.id AS VARCHAR(20)) AS id, u.employee_code, u.full_name, u.is_active, r.role
           FROM dbo.users u
           LEFT JOIN dbo.user_roles r ON r.user_id = u.id
           WHERE u.is_active = 1
           ORDER BY u.id`
        );

      const userMap = new Map<string, { id: string; employeeCode: string; fullName: string; roles: string[] }>();
      for (const row of res.recordset) {
        let entry = userMap.get(row.id);
        if (!entry) {
          entry = {
            id: row.id,
            employeeCode: row.employee_code,
            fullName: row.full_name,
            roles: [],
          };
          userMap.set(row.id, entry);
        }
        if (row.role) {
          entry.roles.push(row.role);
        }
      }

      const users = Array.from(userMap.values()).map((u) => {
        const isDev = u.employeeCode.toLowerCase() === "dev";
        const roleLabel = isDev
          ? "DEV / หัวหน้า QC (ทุกสิทธิ์)"
          : u.roles.includes("ADMIN")
            ? "ผู้ดูแลระบบ (Admin)"
            : u.roles.includes("QC_HEAD")
              ? "หัวหน้า QC (QC Head)"
              : "ผู้ตรวจ QC (Inspector)";
        return {
          id: u.id,
          employeeCode: u.employeeCode,
          fullName: u.fullName,
          role: roleLabel,
        };
      });

      return NextResponse.json({ users, currentUserId: currentUser?.id, currentEmployeeCode: currentUser?.employeeCode });
    } catch {
      // Fallback to mock
    }
  }

  const users = [
    { id: "2", employeeCode: "dev", fullName: "dev gundam", role: "DEV / หัวหน้า QC" },
    ...mockUsers.map((u) => ({ id: u.id, employeeCode: u.employeeCode, fullName: u.fullName, role: "QC Inspector" })),
  ];

  return NextResponse.json({ users, currentUserId: currentUser?.id, currentEmployeeCode: currentUser?.employeeCode });
}

export async function POST(request: Request) {
  if (!devRoleAllowed()) {
    return NextResponse.json({ error: "Dev role not allowed" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { employeeCode?: string; userId?: string };
  const targetCode = body.employeeCode?.trim();
  const targetId = body.userId?.trim();

  if (!targetCode && !targetId) {
    return NextResponse.json({ error: "Missing employeeCode or userId" }, { status: 422 });
  }

  let selectedUser: { id: string; employeeCode: string; fullName: string; roles: Role[] } | null = null;

  if (dbConfigured()) {
    try {
      const pool = await getPool();
      const req = pool.request();
      let query = `
        SELECT CAST(u.id AS VARCHAR(20)) AS id, u.employee_code, u.full_name, r.role
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
      const res = await req.query<{ id: string; employee_code: string; full_name: string; role: string | null }>(query);
      if (res.recordset.length > 0) {
        const first = res.recordset[0];
        const isDev = first.employee_code.toLowerCase() === "dev";
        const userRoles = res.recordset.map((r) => r.role).filter((r): r is Role => Boolean(r) && ROLES.includes(r as Role));
        selectedUser = {
          id: first.id,
          employeeCode: first.employee_code,
          fullName: first.full_name,
          roles: isDev ? [...ROLES] : userRoles.length > 0 ? userRoles : ["QC_INSPECTOR"],
        };
      }
    } catch {
      // Fallback to mock
    }
  }

  if (!selectedUser) {
    if (targetCode?.toLowerCase() === "dev") {
      selectedUser = { id: "2", employeeCode: "dev", fullName: "dev gundam", roles: [...ROLES] };
    } else {
      const found = mockUsers.find((u) => u.employeeCode === targetCode || u.id === targetId);
      if (found) {
        selectedUser = { id: found.id, employeeCode: found.employeeCode, fullName: found.fullName, roles: found.roles };
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
    mustChangePassword: false,
    source: selectedUser.employeeCode.startsWith("F") ? "LOCAL" : undefined,
  });

  return NextResponse.json({ ok: true, user: selectedUser });
}
