import { beforeAll, describe, expect, it } from "vitest";
import { authenticateLocal, NO_LOCAL_ROLE, type LocalAuthDeps } from "./local-auth";
import { createMemoryLocalStore, type LocalUser } from "./local-store";
import { createPinGuard, hashPin } from "./pin";

const PEPPER = "x".repeat(40);
const PIN = "482615";
let pinHash: string;
let dummyHash: string;

beforeAll(async () => {
  pinHash = await hashPin(PIN, PEPPER);
  dummyHash = await hashPin("000000", PEPPER);
});

const user = (overrides: Partial<LocalUser> = {}): LocalUser => ({
  id: "7",
  employeeCode: "F0001",
  fullName: "สมชาย หน้างาน",
  roles: ["QC_INSPECTOR"],
  pinHash,
  isActive: true,
  pinLocked: false,
  mustChangePin: false,
  ...overrides,
});

function setup(users: LocalUser[] = [user()], now = () => 0) {
  const store = createMemoryLocalStore(users);
  const deps: LocalAuthDeps = { store, guard: createPinGuard(now), pepper: PEPPER, dummyHash, ip: "203.0.113.5" };
  return { store, deps };
}

describe("authenticateLocal", () => {
  it("signs in with the right PIN (any case, padded) and marks the session LOCAL", async () => {
    const { deps } = setup();
    const result = await authenticateLocal(" f0001 ", PIN, deps);
    expect(result).toMatchObject({ kind: "success", user: { id: "7", employeeCode: "F0001", roles: ["QC_INSPECTOR"], source: "LOCAL", mustChangePassword: false } });
  });

  it("flags a temporary PIN so the app forces a change", async () => {
    const { deps } = setup([user({ mustChangePin: true })]);
    expect(await authenticateLocal("F0001", PIN, deps)).toMatchObject({ kind: "success", user: { mustChangePassword: true } });
  });

  it("counts down wrong PINs, then locks and persists the lock", async () => {
    const { store, deps } = setup();
    for (let left = 4; left >= 1; left--) {
      expect(await authenticateLocal("F0001", "111222", deps)).toMatchObject({ kind: "invalid", attemptsLeft: left });
    }
    expect(await authenticateLocal("F0001", "111222", deps)).toMatchObject({ kind: "pinLocked", justLocked: true });
    expect((await store.findByCode("F0001"))?.pinLocked).toBe(true);
    // Even the right PIN can't get in now.
    expect(await authenticateLocal("F0001", PIN, deps)).toMatchObject({ kind: "pinLocked", justLocked: false });
  });

  it("keeps a persisted lock across a restart (fresh guard)", async () => {
    const { store } = setup([user({ pinLocked: true })]);
    const deps: LocalAuthDeps = { store, guard: createPinGuard(), pepper: PEPPER, dummyHash };
    expect(await authenticateLocal("F0001", PIN, deps)).toMatchObject({ kind: "pinLocked" });
  });

  it("treats an unknown F code like a wrong PIN, and locks it like a real one", async () => {
    const { deps } = setup();
    expect(await authenticateLocal("F9999", PIN, deps)).toMatchObject({ kind: "invalid", attemptsLeft: 4, account: null });
    for (let i = 0; i < 3; i++) await authenticateLocal("F9999", PIN, deps);
    expect(await authenticateLocal("F9999", PIN, deps)).toMatchObject({ kind: "pinLocked", justLocked: true, account: null });
  });

  it("reveals a deactivated account only after the right PIN", async () => {
    const { deps } = setup([user({ isActive: false })]);
    expect(await authenticateLocal("F0001", "111222", deps)).toMatchObject({ kind: "invalid" });
    expect(await authenticateLocal("F0001", PIN, deps)).toMatchObject({ kind: "disabled" });
  });

  it("never grants roles beyond the field roles", async () => {
    const { deps } = setup([user({ roles: ["QC_INSPECTOR", "ADMIN", "QC_HEAD"] })]);
    const result = await authenticateLocal("F0001", PIN, deps);
    expect(result).toMatchObject({ kind: "success", user: { roles: ["QC_INSPECTOR"] } });
  });

  it("refuses an account whose roles are all outside the field roles", async () => {
    const { deps } = setup([user({ roles: ["ADMIN"] })]);
    expect(await authenticateLocal("F0001", PIN, deps)).toMatchObject({ kind: "forbidden", reason: NO_LOCAL_ROLE });
  });

  it("limits one IP across many accounts, and a success does not refill the budget", async () => {
    const users = Array.from({ length: 40 }, (_, i) => user({ id: String(100 + i), employeeCode: `F${String(2000 + i)}` }));
    const own = user({ id: "1", employeeCode: "F0001" });
    const { deps } = setup([own, ...users]);
    let blocked = false;
    for (let i = 0; i < 45 && !blocked; i++) {
      await authenticateLocal(`F${2000 + (i % 40)}`, "111222", deps);
      // Logging into its own account between guesses must not reset the IP's count.
      if (i % 5 === 4) await authenticateLocal("F0001", PIN, deps);
      const probe = await authenticateLocal("F0001", PIN, deps);
      if (probe.kind === "locked") blocked = true;
    }
    expect(blocked).toBe(true);
  });
});
