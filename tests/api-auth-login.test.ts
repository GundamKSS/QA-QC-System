import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  createSession: vi.fn(),
  audit: vi.fn(),
  touchLogin: vi.fn(),
  syncUserOnLogin: vi.fn(),
  dbConfigured: vi.fn(),
}));
vi.mock("@/lib/auth/authenticate", () => ({ authenticate: mocks.authenticate }));
vi.mock("@/lib/auth/session", () => ({ createSession: mocks.createSession }));
// Keep the real auditContext / auditedCode; only the write is faked.
vi.mock("@/lib/auth/audit", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth/audit")>()), audit: mocks.audit }));
vi.mock("@/lib/auth/local-runtime", () => ({ getLocalStore: () => ({ touchLogin: mocks.touchLogin }) }));
vi.mock("@/lib/db/config", () => ({ dbConfigured: mocks.dbConfigured }));
vi.mock("@/lib/db/users", () => ({ syncUserOnLogin: mocks.syncUserOnLogin }));

import { POST } from "@/app/api/auth/login/route";

const PASSWORD = "S3cret-p@ss word!";
const centralUser = { id: "TRW1001", employeeCode: "TRW1001", fullName: "สมชาย ใจดี", roles: ["QC_INSPECTOR"], mustChangePassword: false };
const fieldUser = { id: "7", employeeCode: "F0007", fullName: "ช่างหน้างาน", roles: ["QC_INSPECTOR"], mustChangePassword: false, source: "LOCAL" };
const account = { id: "u1", employeeCode: "TRW1001" };
const context = { ip: "10.0.0.5", userAgent: "test-agent" };
const unknownCode = expect.stringMatching(/^<unknown:[0-9a-f]{16}>$/);

const send = (body: unknown = { employeeCode: "TRW1001", password: PASSWORD }, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-forwarded-for": "10.0.0.5, 10.0.0.1", "user-agent": "test-agent", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const actions = () => mocks.audit.mock.calls.map(([event]) => event.action);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("QCHECK_AUTH", "central");
  vi.stubEnv("SESSION_SECRET", "ianaW5lojvpJ-ewFY229wTaUgSXZ1FoPu8JyugNNXm0");
  mocks.authenticate.mockResolvedValue({ kind: "success", user: centralUser });
  mocks.touchLogin.mockResolvedValue(undefined);
  mocks.syncUserOnLogin.mockResolvedValue(undefined);
  mocks.dbConfigured.mockReturnValue(false);
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/auth/login — success", () => {
  it("signs in: starts the session, audits it and answers the welcome state with the next page", async () => {
    const response = await send({ employeeCode: "TRW1001", password: PASSWORD, next: "/plans/12?tab=work" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ status: "success", employeeCode: "TRW1001", next: "/plans/12?tab=work", fullName: "สมชาย ใจดี", at: expect.any(Number) });
    expect(mocks.authenticate).toHaveBeenCalledWith("TRW1001", PASSWORD, { ip: "10.0.0.5" });
    expect(mocks.createSession).toHaveBeenCalledWith(centralUser);
    expect(mocks.audit).toHaveBeenCalledWith({ action: "login.success", employeeCode: "TRW1001", userId: "TRW1001" }, context);
  });

  it("does not ask the browser to navigate by itself: the form plays its welcome animation and loads `next` as a full page", async () => {
    expect(await (await send()).json()).not.toHaveProperty("redirectTo");
  });

  it("hands the code to authenticate as typed (it trims and folds case itself) and echoes it trimmed", async () => {
    const response = await send({ employeeCode: "  TRW1001  ", password: PASSWORD });
    expect(mocks.authenticate).toHaveBeenCalledWith("  TRW1001  ", PASSWORD, expect.anything());
    expect((await response.json()).employeeCode).toBe("TRW1001");
  });

  it("never trims or changes the password", async () => {
    await send({ employeeCode: "TRW1001", password: `  ${PASSWORD}  ` });
    expect(mocks.authenticate).toHaveBeenCalledWith("TRW1001", `  ${PASSWORD}  `, expect.anything());
  });

  it("also takes a plain form post", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" },
        body: new URLSearchParams({ employeeCode: "TRW1001", password: PASSWORD, next: "/plans" }),
      }),
    );
    expect(await response.json()).toMatchObject({ status: "success", next: "/plans" });
  });

  it("lists unknown role codes from the central system in the audit trail", async () => {
    mocks.authenticate.mockResolvedValue({ kind: "success", user: centralUser, unknownRoles: ["MAGICIAN"] });
    await send();
    expect(actions()).toEqual(["login.success", "login.unknown_role"]);
    expect(mocks.audit).toHaveBeenLastCalledWith({ action: "login.unknown_role", employeeCode: "TRW1001", userId: "TRW1001", roles: ["MAGICIAN"] }, context);
  });

  describe("where to go next", () => {
    it.each([
      [undefined, "/home"],
      ["", "/home"],
      ["/plans/12?tab=work", "/plans/12?tab=work"],
      ["//evil.example", "/home"],
      ["https://evil.example", "/home"],
      ["/\\evil.example", "/home"],
      ["/login", "/home"],
      ["/change-password", "/home"],
      ["/api/auth/logout", "/home"],
      ["/api/notifications", "/home"],
      ["/home/../login", "/home"],
      [42, "/home"],
    ])("next = %j → %s", async (next, expected) => {
      expect((await (await send({ employeeCode: "TRW1001", password: PASSWORD, next })).json()).next).toBe(expected);
    });

    it("sends someone who still owes a PIN change to the change page, whatever `next` says", async () => {
      mocks.authenticate.mockResolvedValue({ kind: "success", user: { ...fieldUser, mustChangePassword: true } });
      const response = await send({ employeeCode: "F0007", password: "482915", next: "/plans" });
      expect((await response.json()).next).toBe("/change-password");
      expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({ mustChangePassword: true }));
    });
  });

  describe("database and field users", () => {
    it("saves a central user's snapshot when a database is configured", async () => {
      mocks.dbConfigured.mockReturnValue(true);
      await send();
      expect(mocks.syncUserOnLogin).toHaveBeenCalledWith(centralUser);
    });

    it("does not touch the database for a central user when none is configured", async () => {
      await send();
      expect(mocks.syncUserOnLogin).not.toHaveBeenCalled();
    });

    it("still signs office staff in when the snapshot fails (the central system already vouched), and audits the outage", async () => {
      mocks.dbConfigured.mockReturnValue(true);
      mocks.syncUserOnLogin.mockRejectedValue(new Error("db down"));
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const response = await send();
      expect((await response.json()).status).toBe("success");
      expect(mocks.createSession).toHaveBeenCalledTimes(1);
      expect(actions()).toEqual(["login.unavailable", "login.success"]);
      expect(mocks.audit).toHaveBeenCalledWith({ action: "login.unavailable", employeeCode: "TRW1001", userId: "TRW1001", reason: "database user sync" }, context);
      log.mockRestore();
    });

    it("records a field user's last login and never syncs them to the central snapshot", async () => {
      mocks.dbConfigured.mockReturnValue(true);
      mocks.authenticate.mockResolvedValue({ kind: "success", user: fieldUser });
      await send({ employeeCode: "F0007", password: "482915" });
      expect(mocks.touchLogin).toHaveBeenCalledWith("7");
      expect(mocks.syncUserOnLogin).not.toHaveBeenCalled();
      expect(mocks.createSession).toHaveBeenCalledWith(fieldUser);
    });

    it("signs a field user in even if recording the last login fails", async () => {
      mocks.authenticate.mockResolvedValue({ kind: "success", user: fieldUser });
      mocks.touchLogin.mockRejectedValue(new Error("db down"));
      expect((await (await send({ employeeCode: "F0007", password: "482915" })).json()).status).toBe("success");
      expect(mocks.createSession).toHaveBeenCalledTimes(1);
    });

    it("demo mode (QCHECK_AUTH=mock) never saves a snapshot, and folds the typed code to its canonical form", async () => {
      vi.stubEnv("QCHECK_AUTH", "mock");
      mocks.dbConfigured.mockReturnValue(true);
      const response = await send({ employeeCode: " trw 1001 ", password: PASSWORD });
      expect((await response.json()).employeeCode).toBe("TRW1001");
      expect(mocks.syncUserOnLogin).not.toHaveBeenCalled();
    });
  });
});

describe("POST /api/auth/login — a body that is not a login", () => {
  it.each([
    [{ password: PASSWORD }, { employeeCode: true, password: false }],
    [{ employeeCode: "TRW1001" }, { employeeCode: false, password: true }],
    [{ employeeCode: "TRW1001", password: "" }, { employeeCode: false, password: true }],
    [{ employeeCode: "   ", password: PASSWORD }, { employeeCode: true, password: false }],
    [{}, { employeeCode: true, password: true }],
    ["not json at all", { employeeCode: true, password: true }],
  ])("%j → 422 naming the missing fields, with nothing checked or written", async (body, fieldErrors) => {
    const response = await send(body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ status: "invalid", attemptsLeft: null, fieldErrors });
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("keeps the typed code in the answer so the field stays filled", async () => {
    expect((await (await send({ employeeCode: "TRW1001" })).json()).employeeCode).toBe("TRW1001");
  });

  it("refuses an over-long password as plain 'wrong code or password' without checking it", async () => {
    const response = await send({ employeeCode: "TRW1001", password: "x".repeat(257) });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ status: "invalid", employeeCode: "TRW1001", attemptsLeft: null, at: expect.any(Number) });
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("cuts an over-long code to the field's maximum", async () => {
    mocks.authenticate.mockResolvedValue({ kind: "invalid", attemptsLeft: 4, account: null });
    const response = await send({ employeeCode: "A".repeat(100), password: PASSWORD });
    expect((await response.json()).employeeCode).toBe("A".repeat(32));
  });

  it("reads nothing from a body that declares more than 16 KB", async () => {
    const response = await send({ employeeCode: "TRW1001", password: PASSWORD }, { "content-length": String(16 * 1024 + 1) });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ fieldErrors: { employeeCode: true, password: true } });
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/login — requests from other sites", () => {
  it.each([
    [{ "sec-fetch-site": "cross-site" }],
    [{ "sec-fetch-site": "same-site" }],
    [{ "sec-fetch-site": "", origin: "https://evil.example", host: "localhost:3000" }],
  ])("%j → 403 with a message the form can show, before anything is read or checked", async (headers) => {
    const response = await send({ employeeCode: "TRW1001", password: PASSWORD }, headers);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "forbidden", employeeCode: "", message: "คำขอไม่ถูกต้อง — ส่งได้เฉพาะจากหน้าของ QA & QC System", at: expect.any(Number) });
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/login — every way sign-in can be refused", () => {
  it("wrong code or password: 401, and the attempts left only show near the lock", async () => {
    mocks.authenticate.mockResolvedValue({ kind: "invalid", attemptsLeft: 3, account: null });
    const far = await send();
    expect(far.status).toBe(401);
    expect(await far.json()).toEqual({ status: "invalid", employeeCode: "TRW1001", attemptsLeft: null, at: expect.any(Number) });

    mocks.authenticate.mockResolvedValue({ kind: "invalid", attemptsLeft: 2, account: null });
    expect((await (await send()).json()).attemptsLeft).toBe(2);
    expect(actions()).toEqual(["login.failure", "login.failure"]);
  });

  it("audits a failure under the real account's code when the code matched one, else under a keyed fingerprint", async () => {
    mocks.authenticate.mockResolvedValue({ kind: "invalid", attemptsLeft: 4, account });
    await send();
    expect(mocks.audit).toHaveBeenLastCalledWith({ action: "login.failure", employeeCode: "TRW1001", userId: "u1" }, context);

    mocks.authenticate.mockResolvedValue({ kind: "invalid", attemptsLeft: 4, account: null });
    await send({ employeeCode: "typo-or-a-password", password: PASSWORD });
    expect(mocks.audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: "login.failure", employeeCode: unknownCode }), context);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("typo-or-a-password");
  });

  it("locked now: 423 with the unlock time, audited as a failure and a lockout", async () => {
    mocks.authenticate.mockResolvedValue({ kind: "locked", lockedUntil: 1_900_000_000_000, justLocked: true, account });
    const response = await send();
    expect(response.status).toBe(423);
    expect(await response.json()).toEqual({ status: "locked", employeeCode: "TRW1001", lockedUntil: 1_900_000_000_000, at: expect.any(Number) });
    expect(actions()).toEqual(["login.failure", "login.lockout"]);
    expect(mocks.audit).toHaveBeenLastCalledWith({ action: "login.lockout", employeeCode: "TRW1001", userId: "u1", lockedUntil: 1_900_000_000_000 }, context);
  });

  it("already locked: 423, audited once as `login.locked`", async () => {
    mocks.authenticate.mockResolvedValue({ kind: "locked", lockedUntil: 1_900_000_000_000, justLocked: false, account });
    expect((await send()).status).toBe(423);
    expect(actions()).toEqual(["login.locked"]);
  });

  it("field user's PIN locked: 423, no timer, audited as pin failure + lockout the first time and `login.pin_locked` after", async () => {
    mocks.authenticate.mockResolvedValue({ kind: "pinLocked", justLocked: true, account });
    const first = await send({ employeeCode: "F0007", password: "000000" });
    expect(first.status).toBe(423);
    expect(await first.json()).toEqual({ status: "pinLocked", employeeCode: "F0007", at: expect.any(Number) });
    expect(actions()).toEqual(["login.pin_failure", "login.pin_lockout"]);

    mocks.audit.mockClear();
    mocks.authenticate.mockResolvedValue({ kind: "pinLocked", justLocked: false, account });
    await send({ employeeCode: "F0007", password: "000000" });
    expect(actions()).toEqual(["login.pin_locked"]);
  });

  it("closed account: 403 `disabled`", async () => {
    mocks.authenticate.mockResolvedValue({ kind: "disabled", account });
    const response = await send();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "disabled", employeeCode: "TRW1001", at: expect.any(Number) });
    expect(actions()).toEqual(["login.disabled"]);
  });

  it("no permission for this program: 403 with the central system's reason, plus any unknown roles in the audit", async () => {
    mocks.authenticate.mockResolvedValue({ kind: "forbidden", reason: "ไม่มีสิทธิ์ PRG003", account, unknownRoles: ["MAGICIAN"] });
    const response = await send();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "forbidden", employeeCode: "TRW1001", message: "ไม่มีสิทธิ์ PRG003", at: expect.any(Number) });
    expect(actions()).toEqual(["login.forbidden", "login.unknown_role"]);
  });

  it("central system down: 503 `unavailable` with the cause only in the audit", async () => {
    mocks.authenticate.mockResolvedValue({ kind: "unavailable", message: "fetch failed", account: null });
    const response = await send();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable", employeeCode: "TRW1001", at: expect.any(Number) });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "login.unavailable", reason: "fetch failed" }), context);
  });

  it("scripted parallel requests (busy) get exactly the answer of a wrong password, so they learn nothing", async () => {
    mocks.authenticate.mockResolvedValue({ kind: "invalid", attemptsLeft: 4, account: null });
    const wrong = await send();
    mocks.authenticate.mockResolvedValue({ kind: "busy", account: null });
    const busy = await send();
    expect(busy.status).toBe(wrong.status);
    expect({ ...(await busy.json()), at: 0 }).toEqual({ ...(await wrong.json()), at: 0 });
    expect(actions()).toEqual(["login.failure", "login.throttled"]);
  });

  it.each([
    [{ kind: "invalid", attemptsLeft: 1, account: null }],
    [{ kind: "locked", lockedUntil: 1_900_000_000_000, justLocked: true, account }],
    [{ kind: "pinLocked", justLocked: true, account }],
    [{ kind: "disabled", account }],
    [{ kind: "forbidden", reason: "no", account }],
    [{ kind: "unavailable", message: "down", account: null }],
    [{ kind: "busy", account: null }],
  ])("%j starts no session", async (outcome) => {
    mocks.authenticate.mockResolvedValue(outcome);
    await send();
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.touchLogin).not.toHaveBeenCalled();
    expect(mocks.syncUserOnLogin).not.toHaveBeenCalled();
  });

  it("lets a real bug surface as an error (the form then says it could not reach the server) and starts no session", async () => {
    mocks.authenticate.mockRejectedValue(new TypeError("bug"));
    await expect(send()).rejects.toThrow("bug");
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/login — the password stays secret", () => {
  const outcomes = [
    { kind: "success", user: centralUser },
    { kind: "invalid", attemptsLeft: 1, account },
    { kind: "locked", lockedUntil: 1_900_000_000_000, justLocked: true, account },
    { kind: "pinLocked", justLocked: true, account },
    { kind: "disabled", account },
    { kind: "forbidden", reason: "no", account },
    { kind: "unavailable", message: "down", account },
    { kind: "busy", account },
  ];

  it.each(outcomes)("$kind: neither the answer nor any audit row contains it", async (outcome) => {
    mocks.authenticate.mockResolvedValue(outcome);
    const text = await (await send({ employeeCode: "TRW1001", password: PASSWORD, next: "/plans" })).text();
    expect(text).not.toContain(PASSWORD);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(PASSWORD);
  });

  it("also for a request that is refused before it is read", async () => {
    const text = await (await send({ employeeCode: "TRW1001", password: PASSWORD }, { "sec-fetch-site": "cross-site" })).text();
    expect(text).not.toContain(PASSWORD);
  });
});
