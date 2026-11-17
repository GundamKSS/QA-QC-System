import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const query = vi.fn();
  const request = vi.fn(() => {
    const parameters: Record<string, unknown> = {};
    const instance = {
      input(name: string, _type: unknown, value: unknown) {
        parameters[name] = value;
        return instance;
      },
      query: (text: string) => query(text, parameters),
    };
    return instance;
  });
  return { query, request, getPool: vi.fn(async () => ({ request })) };
});

vi.mock("@/lib/db/pool", async () => {
  // Retain driver parameter types, but never construct or connect a real pool.
  const { default: sql } = await import("mssql");
  return { sql, getPool: database.getPool };
});

import { resetLocalPin } from "@/lib/auth/local-admin";
import { createPinGuard, pinFormatError, verifyPin } from "@/lib/auth/pin";
import { createSqlLocalStore } from "@/lib/db/local-users";

const PEPPER = "test-only-pepper-".repeat(3);
const createdAt = new Date("2026-10-19T01:00:00Z");
const updatedAt = new Date("2026-10-20T02:00:00Z");
const importedRow = {
  id: "17", employee_code: "F0017", full_name: "สมหญิง ทดสอบ", nickname: "หญิง",
  email: "somying@example.com", department: "QC", pin_hash: null, is_active: true, locked: 0, must_change: false,
  last_login_at: null, created_at: createdAt, updated_at: updatedAt, roles: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  database.query.mockReset();
  database.query.mockResolvedValue({ recordset: [{ ...importedRow }] });
});

describe("SQL field-user management and login views", () => {
  it("lists and finds an imported profile with no PIN while both login lookups reject it", async () => {
    const store = createSqlLocalStore();
    const expected = {
      id: "17", employeeCode: "F0017", fullName: "สมหญิง ทดสอบ", nickname: "หญิง",
      email: "somying@example.com", department: "QC", roles: [], hasPin: false, isActive: true,
      pinLocked: false, mustChangePin: false, lastLoginAt: null, createdAt, updatedAt,
    };
    expect(await store.list()).toEqual([expected]);
    const detail = await store.findDetailById("17");
    expect(detail).toEqual(expected);
    expect(detail).not.toHaveProperty("pinHash");
    expect(detail).not.toHaveProperty("pin_hash");
    expect(await store.findById("17")).toBeNull();
    expect(await store.findByCode("F0017")).toBeNull();
  });

  it("issues the first temporary PIN through the SQL-backed Admin action", async () => {
    const writes: Record<string, unknown>[] = [];
    database.query.mockImplementation(async (_text: string, parameters: Record<string, unknown>) => {
      if ("pin" in parameters) {
        writes.push(parameters);
        return { recordset: [], rowsAffected: [1] };
      }
      return { recordset: [{ ...importedRow }] };
    });
    const result = await resetLocalPin({
      store: createSqlLocalStore(), guard: createPinGuard(), pepper: PEPPER, actor: { id: "900", roles: ["ADMIN"] },
    }, "17");

    expect(result).toMatchObject({ ok: true, employeeCode: "F0017" });
    if (!result.ok) throw new Error("first PIN was not issued");
    expect(pinFormatError(result.tempPin)).toBeNull();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ id: "17", must: true, by: "900", pin: expect.any(String) });
    expect(await verifyPin(result.tempPin, writes[0].pin as string, PEPPER)).toBe(true);
  });

  it("rejects malformed IDs without querying the database", async () => {
    const store = createSqlLocalStore();
    for (const id of ["", "17 OR 1=1", "-1", "1.2", "1".repeat(19)]) {
      expect(await store.findDetailById(id)).toBeNull();
      expect(await store.findById(id)).toBeNull();
    }
    expect(database.getPool).not.toHaveBeenCalled();
  });

  it("keeps absent or CENTRAL accounts out of ID lookups by restricting reads to LOCAL rows", async () => {
    database.query.mockResolvedValue({ recordset: [] });
    const store = createSqlLocalStore();
    expect(await store.findDetailById("88")).toBeNull();
    expect(await store.findById("88")).toBeNull();
    // Check the security boundary, without coupling this test to the complete SELECT.
    for (const [text, parameters] of database.query.mock.calls) {
      expect(text).toMatch(/\bWHERE\s+u\.source\s*=\s*'LOCAL'/i);
      expect(parameters).toEqual({ id: "88" });
    }
  });
});
