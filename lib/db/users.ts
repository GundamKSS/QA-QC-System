import "server-only";
import { sql, getPool } from "./pool";
import type { Role, SessionUser } from "@/lib/auth/types";

/**
 * Called after the central system accepted the login (docs/04 §3.1, DEC-09): upserts the
 * `users` row by employee_code and overwrites the `user_roles` snapshot with the current
 * role_prog, all in one transaction. Returns the local user id.
 */
export async function syncUserOnLogin(user: SessionUser): Promise<string> {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const upsert = await new sql.Request(tx)
      .input("employee_code", sql.NVarChar(32), user.employeeCode)
      .input("full_name", sql.NVarChar(200), user.fullName)
      .input("email", sql.NVarChar(256), user.email ?? null)
      .query<{ id: string }>(`
        MERGE dbo.users WITH (HOLDLOCK) AS t
        USING (SELECT @employee_code AS employee_code) AS s ON t.employee_code = s.employee_code
        WHEN MATCHED THEN UPDATE SET full_name = @full_name, email = @email, is_active = 1,
          last_login_at = SYSUTCDATETIME(), roles_synced_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (employee_code, full_name, email, last_login_at, roles_synced_at)
          VALUES (@employee_code, @full_name, @email, SYSUTCDATETIME(), SYSUTCDATETIME())
        OUTPUT CAST(inserted.id AS VARCHAR(20)) AS id;`);
    const id = upsert.recordset[0].id;
    await replaceRoles(tx, id, user.roles);
    await tx.commit();
    return id;
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
}

async function replaceRoles(tx: InstanceType<typeof sql.Transaction>, userId: string, roles: Role[]) {
  await new sql.Request(tx).input("user_id", sql.BigInt, userId).query("DELETE FROM dbo.user_roles WHERE user_id = @user_id");
  for (const role of new Set(roles)) {
    await new sql.Request(tx)
      .input("user_id", sql.BigInt, userId)
      .input("role", sql.VarChar(16), role)
      .query("INSERT INTO dbo.user_roles (user_id, role) VALUES (@user_id, @role)");
  }
}
