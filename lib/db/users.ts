import "server-only";
import { sql, getPool } from "./pool";
import { knownProgramRole, knownRoles } from "@/lib/auth/roles";
import type { ProgramRole, Role, SessionUser } from "@/lib/auth/types";

export type SyncedUserResult = {
  id: string;
  roles: Role[];
  programRole: ProgramRole | undefined;
};

/**
 * Called after the central system accepted the login:
 * 1. Upserts the `dbo.users` row by `employee_code` (saving identity + `program_role` from ProgramPermission).
 * 2. Reads the user's QCheck sub-roles from `dbo.user_roles` WITHOUT overwriting them —
 *    sub-roles are owned and managed inside QCheck.
 */
export async function syncUserOnLogin(user: SessionUser): Promise<SyncedUserResult> {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const upsert = await new sql.Request(tx)
      .input("employee_code", sql.NVarChar(32), user.employeeCode)
      .input("full_name", sql.NVarChar(200), user.fullName)
      .input("email", sql.NVarChar(256), user.email ?? null)
      .input("program_role", sql.VarChar(16), user.programRole ?? null)
      .query<{ id: string }>(`
        MERGE dbo.users WITH (HOLDLOCK) AS t
        USING (SELECT @employee_code AS employee_code) AS s ON t.employee_code = s.employee_code
        WHEN MATCHED THEN UPDATE SET
          full_name = @full_name,
          email = @email,
          program_role = COALESCE(@program_role, t.program_role),
          is_active = 1,
          last_login_at = SYSUTCDATETIME(),
          roles_synced_at = SYSUTCDATETIME(),
          updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (employee_code, full_name, email, program_role, last_login_at, roles_synced_at)
          VALUES (@employee_code, @full_name, @email, @program_role, SYSUTCDATETIME(), SYSUTCDATETIME())
        OUTPUT CAST(inserted.id AS VARCHAR(20)) AS id;`);
    const id = upsert.recordset[0].id;

    const rolesRes = await new sql.Request(tx)
      .input("user_id", sql.BigInt, id)
      .query<{ role: string }>("SELECT role FROM dbo.user_roles WHERE user_id = @user_id");

    await tx.commit();
    return {
      id,
      roles: knownRoles(rolesRes.recordset.map((r) => r.role)),
      programRole: user.programRole,
    };
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
}

export type CentralUserState = {
  id: string;
  isActive: boolean;
  programRole: ProgramRole | undefined;
  roles: Role[];
};

/**
 * Live lookup of a CENTRAL user's current QCheck sub-roles (`dbo.user_roles`) and `program_role`.
 * Called from `getCurrentUser()` so role changes by an Admin/Dev take effect on the next request.
 */
export async function loadCentralUserState(employeeCode: string): Promise<CentralUserState | null> {
  const pool = await getPool();
  const res = await pool
    .request()
    .input("employee_code", sql.NVarChar(32), employeeCode)
    .query<{ id: string; is_active: boolean; program_role: string | null; role: string | null }>(`
      SELECT CAST(u.id AS VARCHAR(20)) AS id, u.is_active, u.program_role, r.role
      FROM dbo.users u
      LEFT JOIN dbo.user_roles r ON r.user_id = u.id
      WHERE u.employee_code = @employee_code AND u.source = 'CENTRAL'
    `);

  if (res.recordset.length === 0) return null;
  const first = res.recordset[0];
  return {
    id: first.id,
    isActive: Boolean(first.is_active),
    programRole: knownProgramRole(first.program_role),
    roles: knownRoles(res.recordset.map((row) => row.role).filter((r): r is string => Boolean(r))),
  };
}
