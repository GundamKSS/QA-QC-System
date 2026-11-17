import { beforeAll, describe, expect, it } from "vitest";
import { authenticateLocal } from "@/lib/auth/local-auth";
import { canUnlockLocalUser, changeOwnPin, createLocalUser, generateTempPin, resetLocalPin, setLocalActive, unlockLocalPin, updateLocalUser, type AdminDeps } from "@/lib/auth/local-admin";
import { createMemoryLocalStore } from "@/lib/auth/local-store";
import { createPinGuard, hashPin, pinFormatError } from "@/lib/auth/pin";

const PEPPER = "x".repeat(40);
let dummyHash: string;
beforeAll(async () => {
  dummyHash = await hashPin("000000", PEPPER);
});

function setup(actorRoles: AdminDeps["actor"]["roles"] = ["ADMIN"]) {
  const store = createMemoryLocalStore();
  const guard = createPinGuard();
  const deps: AdminDeps = { store, pepper: PEPPER, guard, actor: { id: "900", roles: actorRoles } };
  const login = (code: string, pin: string) => authenticateLocal(code, pin, { store, guard, pepper: PEPPER, dummyHash });
  return { store, guard, deps, login };
}

const NEW = { fullName: "  สมชาย ใจดี ", nickname: "ชาย", email: "chai@example.com", department: "QC", roles: ["QC_INSPECTOR"] };

describe("generateTempPin", () => {
  it("always satisfies the PIN rules", () => {
    for (let i = 0; i < 300; i++) expect(pinFormatError(generateTempPin())).toBeNull();
  });
  it("skips trivial candidates", () => {
    const candidates = [111111, 123456, 482615];
    expect(generateTempPin(() => candidates.shift()!)).toBe("482615");
  });
});

describe("createLocalUser", () => {
  it("creates F0001 with a temporary PIN that works once and forces a change", async () => {
    const { deps, login, store } = setup();
    const result = await createLocalUser(deps, NEW);
    expect(result).toMatchObject({ ok: true, user: { employeeCode: "F0001", fullName: "สมชาย ใจดี", roles: ["QC_INSPECTOR"], isActive: true, mustChangePin: true } });
    if (!result.ok) throw new Error("unreachable");
    expect(await login("F0001", result.tempPin)).toMatchObject({ kind: "success", user: { mustChangePassword: true } });
    const second = await createLocalUser(deps, { ...NEW, fullName: "คนที่สอง" });
    expect(second).toMatchObject({ ok: true, user: { employeeCode: "F0002" } });
    expect((await store.list()).map((u) => u.employeeCode)).toEqual(["F0001", "F0002"]);
  });

  it("only an Admin may create, and only with field roles", async () => {
    expect(await createLocalUser(setup(["QC_HEAD"]).deps, NEW)).toEqual({ ok: false, error: "forbidden" });
    expect(await createLocalUser(setup().deps, { ...NEW, roles: ["QC_INSPECTOR", "ADMIN"] })).toMatchObject({ ok: false, error: "roles_rejected", rejected: ["ADMIN"] });
    expect(await createLocalUser(setup().deps, { ...NEW, roles: [] })).toEqual({ ok: false, error: "roles_required" });
  });

  it("validates the name and e-mail", async () => {
    const { deps } = setup();
    expect(await createLocalUser(deps, { ...NEW, fullName: "   " })).toEqual({ ok: false, error: "name_required" });
    expect(await createLocalUser(deps, { ...NEW, email: "not-an-email" })).toEqual({ ok: false, error: "email_invalid" });
    expect(await createLocalUser(deps, { ...NEW, email: "", nickname: " " })).toMatchObject({ ok: true, user: { email: null, nickname: null } });
  });
});

describe("managing existing users", () => {
  async function withUser(roles: AdminDeps["actor"]["roles"] = ["ADMIN"]) {
    const ctx = setup(roles);
    const admin = setup(["ADMIN"]);
    const created = await createLocalUser({ ...admin.deps, store: ctx.store, guard: ctx.guard }, NEW);
    if (!created.ok) throw new Error("setup failed");
    return { ...ctx, id: created.user.id, tempPin: created.tempPin };
  }

  it("updates profile and roles and reports before/after", async () => {
    const { deps, id, store } = await withUser();
    const result = await updateLocalUser(deps, id, { fullName: "ชื่อใหม่", roles: ["QA_INSPECTOR", "QC_INSPECTOR"] });
    expect(result).toEqual({ ok: true, before: ["QC_INSPECTOR"], after: ["QC_INSPECTOR", "QA_INSPECTOR"] });
    expect((await store.list())[0]).toMatchObject({ fullName: "ชื่อใหม่", roles: ["QC_INSPECTOR", "QA_INSPECTOR"] });
  });

  it("a reset issues a fresh temporary PIN, unlocks, and invalidates the old PIN", async () => {
    const { deps, id, login, tempPin } = await withUser();
    for (let i = 0; i < 5; i++) await login("F0001", "111222");
    expect(await login("F0001", tempPin)).toMatchObject({ kind: "pinLocked" });
    const reset = await resetLocalPin(deps, id);
    if (!reset.ok) throw new Error("reset failed");
    expect(reset.tempPin).not.toBe(tempPin);
    expect(await login("F0001", tempPin)).toMatchObject({ kind: "invalid" });
    expect(await login("F0001", reset.tempPin)).toMatchObject({ kind: "success", user: { mustChangePassword: true } });
  });

  it("unlocking keeps the PIN: Admin always, QC Head only for QC inspectors", async () => {
    const asHead = await withUser(["QC_HEAD"]);
    for (let i = 0; i < 5; i++) await asHead.login("F0001", "111222");
    expect(await unlockLocalPin(asHead.deps, asHead.id)).toEqual({ ok: true, employeeCode: "F0001" });
    expect(await asHead.login("F0001", asHead.tempPin)).toMatchObject({ kind: "success" });

    const asQaHead = await withUser(["QA_HEAD"]);
    expect(await unlockLocalPin(asQaHead.deps, asQaHead.id)).toEqual({ ok: false, error: "forbidden" });
    expect(canUnlockLocalUser(["QC_HEAD"], { roles: ["QA_INSPECTOR"] })).toBe(false);
    expect(canUnlockLocalUser(["ADMIN"], { roles: ["QA_INSPECTOR"] })).toBe(true);
  });

  it("a QC Head cannot reset PINs, edit, or deactivate", async () => {
    const { deps, id } = await withUser(["QC_HEAD"]);
    expect(await resetLocalPin(deps, id)).toEqual({ ok: false, error: "forbidden" });
    expect(await updateLocalUser(deps, id, { fullName: "x", roles: ["QC_INSPECTOR"] })).toEqual({ ok: false, error: "forbidden" });
    expect(await setLocalActive(deps, id, false)).toEqual({ ok: false, error: "forbidden" });
  });

  it("deactivating blocks login even with the right PIN, and reactivating restores it", async () => {
    const { deps, id, login, tempPin } = await withUser();
    await setLocalActive(deps, id, false);
    expect(await login("F0001", tempPin)).toMatchObject({ kind: "disabled" });
    await setLocalActive(deps, id, true);
    expect(await login("F0001", tempPin)).toMatchObject({ kind: "success" });
  });

  it("reports an unknown user", async () => {
    const { deps } = setup();
    expect(await resetLocalPin(deps, "404")).toEqual({ ok: false, error: "not_found" });
  });
});

describe("managing imported users before their first PIN", () => {
  function withImportedUser() {
    const store = createMemoryLocalStore([{
      id: "17", employeeCode: "F0017", fullName: "สมหญิง ทดสอบ", nickname: "หญิง",
      email: "somying@example.com", department: "QC", roles: [], pinHash: "", isActive: true, pinLocked: false,
    }]);
    const guard = createPinGuard();
    const deps: AdminDeps = { store, guard, pepper: PEPPER, actor: { id: "900", roles: ["ADMIN"] } };
    const login = (pin: string) => authenticateLocal("F0017", pin, { store, guard, pepper: PEPPER, dummyHash });
    return { store, guard, deps, login };
  }

  it("lets an Admin edit an imported profile and issue its first temporary PIN for login", async () => {
    const { store, deps, login } = withImportedUser();
    expect(await store.findByCode("F0017")).toBeNull();
    expect(await store.findById("17")).toBeNull();
    expect(await login("482615")).toMatchObject({ kind: "invalid", account: null });
    expect(await updateLocalUser(deps, "17", {
      fullName: "สมหญิง ทดสอบใหม่", nickname: "หญิง", email: "somying.new@example.com", department: "QA", roles: ["QA_INSPECTOR"],
    })).toEqual({ ok: true, before: [], after: ["QA_INSPECTOR"] });
    const detail = await store.findDetailById("17");
    expect(detail).toMatchObject({
      fullName: "สมหญิง ทดสอบใหม่", email: "somying.new@example.com", department: "QA", roles: ["QA_INSPECTOR"], hasPin: false,
    });
    expect(detail).not.toHaveProperty("pinHash");
    expect(await store.findById("17")).toBeNull();
    expect(await store.findByCode("F0017")).toBeNull();

    const issued = await resetLocalPin(deps, "17");
    expect(issued).toMatchObject({ ok: true, employeeCode: "F0017" });
    if (!issued.ok) throw new Error("first PIN was not issued");
    expect(pinFormatError(issued.tempPin)).toBeNull();
    expect(await store.findDetailById("17")).toMatchObject({ hasPin: true, mustChangePin: true, roles: ["QA_INSPECTOR"] });
    expect(await login(issued.tempPin)).toMatchObject({ kind: "success", user: { id: "17", source: "LOCAL", mustChangePassword: true } });
  });

  it("lets an Admin deactivate, reactivate and unlock the imported profile without issuing a PIN", async () => {
    const { store, deps } = withImportedUser();
    expect(await setLocalActive(deps, "17", false)).toEqual({ ok: true, employeeCode: "F0017" });
    expect(await store.findDetailById("17")).toMatchObject({ isActive: false, hasPin: false });
    expect(await setLocalActive(deps, "17", true)).toEqual({ ok: true, employeeCode: "F0017" });
    await store.lockPin("17");
    expect(await unlockLocalPin(deps, "17")).toEqual({ ok: true, employeeCode: "F0017" });
    expect(await store.findDetailById("17")).toMatchObject({ isActive: true, pinLocked: false, hasPin: false, roles: [] });
    expect(await store.findById("17")).toBeNull();
  });

  it("does not let an imported user set their own first PIN through changeOwnPin", async () => {
    const { store, guard } = withImportedUser();
    expect(await changeOwnPin({ store, guard, pepper: PEPPER, userId: "17" }, {
      current: "482615", next: "739104", confirm: "739104",
    })).toEqual({ ok: false, error: "not_found" });
    expect(await store.findDetailById("17")).toMatchObject({ hasPin: false, mustChangePin: false });
    expect(await store.findById("17")).toBeNull();
  });
});

describe("changeOwnPin", () => {
  async function withUser() {
    const ctx = setup();
    const created = await createLocalUser(ctx.deps, NEW);
    if (!created.ok) throw new Error("setup failed");
    return { ...ctx, id: created.user.id, tempPin: created.tempPin, own: { store: ctx.store, guard: ctx.guard, pepper: PEPPER, userId: created.user.id } };
  }

  it("replaces the temporary PIN and clears the forced-change flag", async () => {
    const { own, login, tempPin } = await withUser();
    expect(await changeOwnPin(own, { current: tempPin, next: "739104", confirm: "739104" })).toEqual({ ok: true });
    expect(await login("F0001", tempPin)).toMatchObject({ kind: "invalid" });
    expect(await login("F0001", "739104")).toMatchObject({ kind: "success", user: { mustChangePassword: false } });
  });

  it("rejects weak, mismatched and unchanged PINs without touching the old one", async () => {
    const { own, login, tempPin } = await withUser();
    expect(await changeOwnPin(own, { current: tempPin, next: "123456", confirm: "123456" })).toEqual({ ok: false, error: "pin_format" });
    expect(await changeOwnPin(own, { current: tempPin, next: "739104", confirm: "739105" })).toEqual({ ok: false, error: "pin_mismatch" });
    expect(await changeOwnPin(own, { current: tempPin, next: tempPin, confirm: tempPin })).toEqual({ ok: false, error: "pin_same" });
    expect(await login("F0001", tempPin)).toMatchObject({ kind: "success" });
  });

  it("limits guesses of the current PIN like login does", async () => {
    const { own, login, tempPin } = await withUser();
    for (let i = 0; i < 4; i++) expect(await changeOwnPin(own, { current: "111222", next: "739104", confirm: "739104" })).toEqual({ ok: false, error: "pin_wrong" });
    expect(await changeOwnPin(own, { current: "111222", next: "739104", confirm: "739104" })).toEqual({ ok: false, error: "pin_locked" });
    expect(await login("F0001", tempPin)).toMatchObject({ kind: "pinLocked" });
  });
});
