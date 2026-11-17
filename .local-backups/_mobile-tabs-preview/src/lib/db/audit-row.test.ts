import { describe, expect, it } from "vitest";
import { toAuditRow } from "./audit-row";

const ctx = { ip: "10.0.0.5", userAgent: "Mozilla/5.0" };
const at = new Date("2026-10-19T08:00:00Z");

describe("toAuditRow", () => {
  it("links a known user and keeps extras in detail_json", () => {
    const row = toAuditRow({ action: "login.unknown_role", employeeCode: "TRW1001", userId: "42", roles: ["BOSS"] }, ctx, at);
    expect(row).toMatchObject({ action: "login.unknown_role", actorId: "42", actorCode: "TRW1001", entityType: "user", entityId: "42", ip: "10.0.0.5", at });
    expect(JSON.parse(row.detailJson!)).toEqual({ roles: ["BOSS"] });
  });

  it("records a failed login without a user id and without detail", () => {
    const row = toAuditRow({ action: "login.failure", employeeCode: "<unknown:abc123>" }, ctx, at);
    expect(row).toMatchObject({ actorId: null, actorCode: "<unknown:abc123>", entityType: null, entityId: null, detailJson: null });
  });

  it("serialises lockedUntil and reason, and caps long values", () => {
    const row = toAuditRow(
      { action: "login.lockout", employeeCode: "x".repeat(200), lockedUntil: Date.UTC(2026, 9, 19, 8, 15), reason: "timeout" },
      { ip: null, userAgent: "u".repeat(500) },
      at,
    );
    expect(JSON.parse(row.detailJson!)).toEqual({ lockedUntil: "2026-10-19T08:15:00.000Z", reason: "timeout" });
    expect(row.actorCode).toHaveLength(64);
    expect(row.userAgent).toHaveLength(256);
    expect(row.ip).toBeNull();
  });

  it("records the target of a user-management action while keeping the actor", () => {
    const row = toAuditRow({ action: "user.roles_change", employeeCode: "TRW1001", userId: "5", target: { id: "9", employeeCode: "F0003" }, detail: { roles: ["QC_INSPECTOR"] } }, ctx, at);
    expect(row).toMatchObject({ actorId: "5", actorCode: "TRW1001", entityType: "user", entityId: "9" });
    expect(JSON.parse(row.detailJson!)).toEqual({ roles: ["QC_INSPECTOR"], targetCode: "F0003" });
  });

  it("leaves actor_id empty for office users whose session id is an employee code", () => {
    const row = toAuditRow({ action: "login.success", employeeCode: "dev", userId: "dev" }, ctx, at);
    expect(row).toMatchObject({ actorId: null, actorCode: "dev", entityType: "user", entityId: "dev" });
  });

  it("records a changed record with before and after values", () => {
    const row = toAuditRow({ action: "master.update", employeeCode: "TRW9", userId: "TRW9", entity: { type: "brands", id: "4" }, before: { name: "Jet" }, after: { name: "JET" } }, ctx, at);
    expect(row).toMatchObject({ entityType: "brands", entityId: "4", actorId: null, actorCode: "TRW9" });
    expect(JSON.parse(row.beforeJson!)).toEqual({ name: "Jet" });
    expect(JSON.parse(row.afterJson!)).toEqual({ name: "JET" });
    expect(toAuditRow({ action: "login.failure", employeeCode: "x" }, ctx, at)).toMatchObject({ beforeJson: null, afterJson: null });
  });
});
