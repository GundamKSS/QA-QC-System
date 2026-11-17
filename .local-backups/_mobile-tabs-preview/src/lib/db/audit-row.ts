/** The shape persisted in `dbo.audit_logs` (db/002_audit_logs.sql). Pure: no DB access. */
export type AuditRow = {
  action: string;
  actorId: string | null;
  actorCode: string | null;
  entityType: string | null;
  entityId: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  detailJson: string | null;
  ip: string | null;
  userAgent: string | null;
  at: Date;
};

type AuditEventInput = {
  action: string;
  employeeCode: string;
  userId?: string;
  lockedUntil?: number;
  roles?: string[];
  reason?: string;
  target?: { id: string; employeeCode: string };
  /** Any other record that was changed (master data row, …) — overrides the user target. */
  entity?: { type: string; id: string };
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  detail?: Record<string, unknown>;
};

/** Maps a login/logout audit event to a table row. Extra facts go in `detail_json`. */
export function toAuditRow(event: AuditEventInput, context: { ip: string | null; userAgent: string | null }, at = new Date()): AuditRow {
  const detail: Record<string, unknown> = { ...(event.detail ?? {}) };
  if (event.target) detail.targetCode = event.target.employeeCode;
  if (event.lockedUntil) detail.lockedUntil = new Date(event.lockedUntil).toISOString();
  if (event.roles?.length) detail.roles = event.roles;
  if (event.reason) detail.reason = event.reason;
  return {
    action: event.action,
    // Office (central) users' session id is their employee code, not a users.id — actor_code carries it.
    actorId: event.userId && /^\d{1,18}$/.test(event.userId) ? event.userId : null,
    actorCode: event.employeeCode.slice(0, 64),
    entityType: event.entity ? event.entity.type.slice(0, 48) : event.target || event.userId ? "user" : null,
    entityId: (event.entity?.id ?? event.target?.id ?? event.userId ?? null)?.slice(0, 64) ?? null,
    beforeJson: event.before ? JSON.stringify(event.before) : null,
    afterJson: event.after ? JSON.stringify(event.after) : null,
    detailJson: Object.keys(detail).length ? JSON.stringify(detail) : null,
    ip: context.ip?.slice(0, 64) ?? null,
    userAgent: context.userAgent?.slice(0, 256) ?? null,
    at,
  };
}
