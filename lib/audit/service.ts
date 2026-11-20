import "server-only";
import sql from "mssql";
import { dbConfigured } from "@/lib/db/config";
import { getPool } from "@/lib/db/pool";
import {
  AUDIT_PAGE_SIZE,
  bangkokDayEndExclusiveUtc,
  bangkokDayStartUtc,
  type AuditLogItem,
  type AuditLogPayload,
  type AuditQuery,
} from "./query";

type AuditDbRow = {
  id: number | string;
  at: Date;
  action: string;
  actor_id: number | string | null;
  actor_code: string | null;
  actor_name: string | null;
  entity_type: string | null;
  entity_id: string | null;
  before_json: string | null;
  after_json: string | null;
  detail_json: string | null;
  ip: string | null;
  user_agent: string | null;
  device_id: string | null;
};

/**
 * Loads paginated append-only audit trail rows from `dbo.audit_logs` (FR-AUD-01/03).
 * Uses parameterized SQL predicates and Bangkok-timezone date boundaries.
 */
export async function loadAuditLogs(query: AuditQuery): Promise<AuditLogPayload> {
  if (!dbConfigured()) {
    return {
      items: [],
      total: 0,
      page: query.page,
      pageSize: AUDIT_PAGE_SIZE,
      totalPages: 1,
      dbAvailable: false,
    };
  }

  const pool = await getPool();
  const where: string[] = ["1 = 1"];
  const req = pool.request();

  if (query.q) {
    where.push(`(
      a.actor_code LIKE @q ESCAPE '\\'
      OR u.full_name LIKE @q ESCAPE '\\'
      OR a.[action] LIKE @q ESCAPE '\\'
      OR a.entity_type LIKE @q ESCAPE '\\'
      OR a.entity_id LIKE @q ESCAPE '\\'
      OR a.ip LIKE @q ESCAPE '\\'
    )`);
    const escaped = query.q.replace(/[%_\\]/g, "\\$&");
    req.input("q", sql.NVarChar(120), `%${escaped}%`);
  }

  if (query.group) {
    if (query.group === "logout") {
      where.push(`(a.[action] = 'logout' OR a.[action] LIKE 'logout.%')`);
    } else {
      where.push(`a.[action] LIKE @groupPrefix`);
      req.input("groupPrefix", sql.VarChar(40), `${query.group}.%`);
    }
  }

  const fromUtc = bangkokDayStartUtc(query.from);
  if (fromUtc) {
    where.push(`a.[at] >= TRY_CONVERT(DATETIME2(3), @fromUtc, 127)`);
    req.input("fromUtc", sql.VarChar(40), fromUtc);
  }

  const toUtc = bangkokDayEndExclusiveUtc(query.to);
  if (toUtc) {
    where.push(`a.[at] < TRY_CONVERT(DATETIME2(3), @toUtc, 127)`);
    req.input("toUtc", sql.VarChar(40), toUtc);
  }

  const whereClause = where.join(" AND ");
  const offset = (query.page - 1) * AUDIT_PAGE_SIZE;
  req.input("offset", sql.Int, offset);
  req.input("limit", sql.Int, AUDIT_PAGE_SIZE);

  const countRes = await req.query<{ total: number }>(`
    SELECT COUNT(*) AS total
    FROM dbo.audit_logs a
    LEFT JOIN dbo.users u ON u.id = a.actor_id
    WHERE ${whereClause}
  `);

  const total = Number(countRes.recordset[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));

  const rowsRes = await req.query<AuditDbRow>(`
    SELECT
      a.id,
      a.[at],
      a.[action],
      a.actor_id,
      a.actor_code,
      u.full_name AS actor_name,
      a.entity_type,
      a.entity_id,
      a.before_json,
      a.after_json,
      a.detail_json,
      a.ip,
      a.user_agent,
      a.device_id
    FROM dbo.audit_logs a
    LEFT JOIN dbo.users u ON u.id = a.actor_id
    WHERE ${whereClause}
    ORDER BY a.[at] DESC, a.id DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);

  const items: AuditLogItem[] = rowsRes.recordset.map((row) => ({
    id: String(row.id),
    at: new Date(row.at).toISOString(),
    action: row.action,
    actorId: row.actor_id !== null ? String(row.actor_id) : null,
    actorCode: row.actor_code,
    actorName: row.actor_name,
    entityType: row.entity_type,
    entityId: row.entity_id,
    beforeJson: row.before_json,
    afterJson: row.after_json,
    detailJson: row.detail_json,
    ip: row.ip,
    userAgent: row.user_agent,
    deviceId: row.device_id,
  }));

  return {
    items,
    total,
    page: query.page,
    pageSize: AUDIT_PAGE_SIZE,
    totalPages,
    dbAvailable: true,
  };
}
