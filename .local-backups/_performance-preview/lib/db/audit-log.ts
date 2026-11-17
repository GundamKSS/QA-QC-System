import "server-only";
import { sql, getPool } from "./pool";
import type { AuditRow } from "./audit-row";

/**
 * Appends one row to `dbo.audit_logs`. Throws on failure — callers decide whether that matters.
 * The time is stamped by the database (`DEFAULT SYSUTCDATETIME()`): passing a DateTime2 parameter
 * failed inside the Next server ("type.validate is not a function") although it works in plain Node.
 */
export async function insertAuditRow(row: AuditRow): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("action", sql.VarChar(64), row.action)
    .input("actor_id", sql.BigInt, row.actorId)
    .input("actor_code", sql.NVarChar(64), row.actorCode)
    .input("entity_type", sql.VarChar(48), row.entityType)
    .input("entity_id", sql.NVarChar(64), row.entityId)
    .input("before_json", sql.NVarChar(sql.MAX), row.beforeJson)
    .input("after_json", sql.NVarChar(sql.MAX), row.afterJson)
    .input("detail_json", sql.NVarChar(sql.MAX), row.detailJson)
    .input("ip", sql.VarChar(64), row.ip)
    .input("user_agent", sql.NVarChar(256), row.userAgent)
    .query(`INSERT INTO dbo.audit_logs ([action], actor_id, actor_code, entity_type, entity_id, before_json, after_json, detail_json, ip, user_agent)
            VALUES (@action, @actor_id, @actor_code, @entity_type, @entity_id, @before_json, @after_json, @detail_json, @ip, @user_agent)`);
}
