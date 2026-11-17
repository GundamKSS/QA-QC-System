import "server-only";
import { sql, getPool } from "./pool";

/**
 * Turns "who did it" into a `users.id` for created_by / updated_by columns.
 * A field user's session id already is one; an office (central) user's session id is their
 * employee code, so look up the row that was synced when they logged in. No row (e.g. the
 * database was down at their login) → null, which those columns allow.
 */
export async function resolveActorId(by: string): Promise<string | null> {
  if (/^\d{1,18}$/.test(by)) return by;
  const pool = await getPool();
  const result = await pool.request().input("code", sql.NVarChar(32), by.trim()).query<{ id: string }>(
    "SELECT CAST(id AS VARCHAR(20)) AS id FROM dbo.users WHERE employee_code = @code",
  );
  return result.recordset[0]?.id ?? null;
}
