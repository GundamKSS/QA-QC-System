import "server-only";
import { createHmac } from "node:crypto";
import { dbConfigured } from "@/lib/db/config";
import { toAuditRow } from "@/lib/db/audit-row";
import { insertAuditRow } from "@/lib/db/audit-log";

type AuditAction =
  | "login.success"
  | "login.failure"
  /** The failure that engaged the lock (logged right after its `login.failure`). */
  | "login.lockout"
  /** An attempt refused because the code is already locked. */
  | "login.locked"
  /** Refused because parallel requests for the same code are already using every remaining attempt. */
  | "login.throttled"
  /** A field user (PIN login, DEC-12): wrong PIN that locked the account, and attempts on an already-locked one. */
  | "login.pin_failure"
  | "login.pin_lockout"
  | "login.pin_locked"
  /** Admin / QC Head managing field users, and a field user changing their own PIN (DEC-12). */
  /** Master data changes (docs/03 §3.0): who changed which row, before → after. */
  | "master.create"
  | "master.update"
  | "master.disable"
  | "master.enable"
  /** Inspection plans (FR-PLAN-01): who opened which plan, with the computed QC target. */
  | "plan.open"
  /** BR-13: cancelled with a reason; FR-PLAN-17: "รอของ" flag on / off. */
  | "plan.cancel"
  | "plan.waiting_goods"
  | "plan.vendor"
  /** Work orders (docs/16): opened with Need/type and people, people changed, cancelled with a reason. */
  | "work_order.open"
  | "work_order.assignees"
  | "work_order.cancel"
  | "user.create"
  | "user.update"
  | "user.roles_change"
  | "user.pin_reset"
  | "user.pin_unlock"
  | "user.pin_change"
  | "user.deactivate"
  | "user.activate"
  | "login.disabled"
  | "login.forbidden"
  /** The central auth system was down, slow or answered garbage (FR-AUTH-08). */
  | "login.unavailable"
  /** role_prog carried codes QCheck doesn't know; they were dropped. */
  | "login.unknown_role"
  | "logout";

/**
 * Request details FR-AUD-01 asks for ("อุปกรณ์"); device_id arrives with shared-device mode.
 * X-Forwarded-For is only trustworthy behind our own proxy — it's informational here.
 */
export type AuditContext = { ip: string | null; userAgent: string | null };

export function auditContext(headers: Headers): AuditContext {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || headers.get("x-real-ip") || null,
    userAgent: headers.get("user-agent")?.slice(0, 256) ?? null,
  };
}

/**
 * What was typed into the code field is only logged when it matches a real employee code —
 * people sometimes type their password there. Unknown input is logged as a keyed fingerprint,
 * enough to spot repeated guessing without storing the text.
 */
export function auditedCode(account: { employeeCode: string } | null, typed: string): string {
  if (account) return account.employeeCode;
  const key = process.env.SESSION_SECRET;
  if (!key || !typed) return "<unknown>";
  return `<unknown:${createHmac("sha256", key).update(`audit-code:${typed}`).digest("hex").slice(0, 16)}>`;
}

/**
 * Login/logout audit trail (FR-AUD-01). Always writes a structured line to the server log, and
 * also appends a row to `dbo.audit_logs` when a database is configured. The insert is
 * fire-and-forget: a database hiccup must never block or fail a login, so failures are only logged.
 * Never pass passwords or raw typed input here.
 */
export function audit(
  event: {
    action: AuditAction;
    employeeCode: string;
    userId?: string;
    lockedUntil?: number;
    /** Unknown role codes from role_prog (login.unknown_role). */
    roles?: string[];
    /** Short server-side cause, e.g. for login.unavailable — never request bodies. */
    reason?: string;
    /** For user-management actions: who was acted on (employeeCode/userId above are the actor). */
    target?: { id: string; employeeCode: string };
    /** Another kind of record that was changed (e.g. a master data row). */
    entity?: { type: string; id: string };
    /** Values before / after a change (FR-AUD-01) — never secrets or PINs. */
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    /** Small structured facts (e.g. role lists) — never secrets or PINs. */
    detail?: Record<string, unknown>;
  },
  context: AuditContext,
) {
  const { lockedUntil, ...rest } = event;
  console.info(
    "[audit]",
    JSON.stringify({
      ...rest,
      ...(lockedUntil ? { lockedUntil: new Date(lockedUntil).toISOString() } : {}),
      ...context,
      at: new Date().toISOString(),
    }),
  );
  if (dbConfigured()) {
    insertAuditRow(toAuditRow(event, context)).catch((error) =>
      console.error("[audit] db write failed", error instanceof Error ? error.message : error),
    );
  }
}
