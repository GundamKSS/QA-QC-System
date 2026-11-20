import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadLocalUsers } from "@/lib/auth/admin-users";
import { createMemoryLocalStore } from "@/lib/auth/local-store";

const seed = (store: ReturnType<typeof createMemoryLocalStore>) => {
  store.add({ id: "1", employeeCode: "F0001", fullName: "สมชาย", roles: ["QC_INSPECTOR"], pinHash: "SECRET-HASH-1", isActive: true, pinLocked: true, mustChangePin: true, nickname: "ชาย", email: "s@example.com", department: "QC", lastLoginAt: new Date("2026-10-20T03:00:00Z"), createdAt: new Date("2026-10-01T01:00:00Z"), updatedAt: new Date("2026-10-02T02:00:00Z") });
  store.add({ id: "2", employeeCode: "F0002", fullName: "สมหญิง", roles: ["QA_INSPECTOR"], pinHash: "", isActive: false, pinLocked: true });
};

describe("loadLocalUsers", () => {
  it("sends only what the page draws: no pin hash, dates as ISO strings", async () => {
    const store = createMemoryLocalStore();
    seed(store);
    const payload = await loadLocalUsers(store, ["ADMIN"]);
    expect(JSON.stringify(payload)).not.toContain("SECRET-HASH");
    expect(Object.keys(payload.users[0]).sort()).toEqual(
      ["canUnlock", "createdAt", "department", "email", "employeeCode", "fullName", "hasPin", "id", "isActive", "lastLoginAt", "mustChangePin", "nickname", "pinLocked", "roles", "updatedAt"],
    );
    expect(payload.users[0]).toMatchObject({
      id: "1", employeeCode: "F0001", hasPin: true, pinLocked: true, mustChangePin: true,
      createdAt: "2026-10-01T01:00:00.000Z", updatedAt: "2026-10-02T02:00:00.000Z", lastLoginAt: "2026-10-20T03:00:00.000Z",
    });
    expect(payload.users[1]).toMatchObject({ hasPin: false, lastLoginAt: null });
  });

  it("Admin manages everything and may unlock any row", async () => {
    const store = createMemoryLocalStore();
    seed(store);
    const payload = await loadLocalUsers(store, ["ADMIN"]);
    expect(payload.canManage).toBe(true);
    expect(payload.users.map((user) => user.canUnlock)).toEqual([true, true]);
  });

  it("a QC Head manages nothing and may unlock only QC inspectors", async () => {
    const store = createMemoryLocalStore();
    seed(store);
    const payload = await loadLocalUsers(store, ["QC_HEAD"]);
    expect(payload.canManage).toBe(false);
    expect(payload.users.map((user) => [user.employeeCode, user.canUnlock])).toEqual([["F0001", true], ["F0002", false]]);
  });

  it("a QA Head manages nothing and may unlock only QA inspectors", async () => {
    const store = createMemoryLocalStore();
    seed(store);
    const payload = await loadLocalUsers(store, ["QA_HEAD"]);
    expect(payload.canManage).toBe(false);
    expect(payload.users.map((user) => [user.employeeCode, user.canUnlock])).toEqual([["F0001", false], ["F0002", true]]);
  });

  it("gives no unlock right to a role that may not even open the page", async () => {
    const store = createMemoryLocalStore();
    seed(store);
    const payload = await loadLocalUsers(store, ["PM"]);
    expect(payload.users.some((user) => user.canUnlock)).toBe(false);
  });

  it("answers an empty list", async () => {
    expect(await loadLocalUsers(createMemoryLocalStore(), ["ADMIN"])).toEqual({ canManage: true, users: [] });
  });

  it("lets a store failure through for the route to answer as 503", async () => {
    const store = createMemoryLocalStore();
    store.list = () => Promise.reject(new Error("down"));
    await expect(loadLocalUsers(store, ["ADMIN"])).rejects.toThrow("down");
  });
});
