import { beforeEach, describe, expect, it } from "vitest";
import { authPolicy } from "@/lib/config/auth";
import { createAttemptTracker, visibleAttemptsLeft, type AttemptTracker } from "@/lib/auth/attempts";
import { auditedCode } from "@/lib/auth/audit";
import { normalizeEmployeeCode, safeNextPath } from "@/lib/auth/employee-code";
import { authenticate, resetMockAuthForTests, type AuthResult } from "@/lib/auth/mock-adapter";
import { MOCK_PASSWORD } from "@/lib/auth/mock-users";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { isSameOriginRequest } from "@/lib/auth/same-origin";

describe("auth policy (FR-AUTH acceptance criteria)", () => {
  it("locks after 5 failures for 15 minutes and warns on the last 2 attempts", () => {
    expect(authPolicy.maxAttempts).toBe(5);
    expect(authPolicy.lockMinutes).toBe(15);
    expect([4, 3, 2, 1].map(visibleAttemptsLeft)).toEqual([null, null, 2, 1]);
  });
});

describe("normalizeEmployeeCode", () => {
  it("uppercases, strips spaces and NFKC-normalises", () => {
    expect(normalizeEmployeeCode(" trw 1001 ")).toBe("TRW1001");
    expect(normalizeEmployeeCode("ＴＲＷ１００１")).toBe("TRW1001");
  });
  it("rejects non-strings", () => {
    expect(normalizeEmployeeCode(null)).toBe("");
    expect(normalizeEmployeeCode(42)).toBe("");
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/home", "/home"],
    ["/plans/12?tab=qc", "/plans/12?tab=qc"],
    ["//evil.example", "/home"],
    ["/\\evil.example", "/home"],
    ["https://evil.example", "/home"],
    ["/login", "/home"],
    ["/login?next=/home", "/home"],
    ["/home/../login", "/home"],
    ["/%6Cogin", "/home"],
    ["/auth/logout", "/home"],
    ["/api/auth/logout", "/home"],
    ["/api/notifications", "/home"],
    ["/%61pi/plans", "/home"],
    ["/apiary", "/apiary"],
    ["/change-password", "/home"],
    ["/home\nx", "/home"],
    ["/%E0%A4%A", "/home"],
    ["", "/home"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input, "/home")).toBe(expected);
  });
});

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("s3cret");
    expect(await verifyPassword("s3cret", hash)).toBe(true);
    expect(await verifyPassword("S3cret", hash)).toBe(false);
    expect(await verifyPassword("s3cret", "garbage")).toBe(false);
  });
});

describe("attempt tracker", () => {
  let clock = 0;
  const tracker = () => createAttemptTracker({ maxAttempts: 5, lockMinutes: 15 }, () => clock);

  function attempt(t: AttemptTracker, key: string, passwordOk: boolean) {
    const ticket = t.begin(key);
    return ticket.kind === "started" ? ticket.settle(passwordOk) : ticket;
  }

  beforeEach(() => {
    clock = 1_000_000;
  });

  it("counts down attempts and locks on the 5th failure for 15 minutes", () => {
    const t = tracker();
    for (let i = 1; i <= 4; i++) {
      expect(attempt(t, "A", false)).toEqual({ kind: "invalid", attemptsLeft: 5 - i });
    }
    expect(attempt(t, "A", false)).toEqual({ kind: "locked", lockedUntil: clock + 15 * 60_000, justLocked: true });
    clock += 15 * 60_000 - 1;
    expect(attempt(t, "A", true)).toEqual({ kind: "locked", lockedUntil: clock + 1 });
    clock += 1;
    expect(t.status("A")).toEqual({ locked: false, failures: 0, attemptsLeft: 5 });
  });

  it("keeps accounts independent and resets on success", () => {
    const t = tracker();
    attempt(t, "A", false);
    attempt(t, "A", false);
    expect(t.status("B")).toEqual({ locked: false, failures: 0, attemptsLeft: 5 });
    expect(attempt(t, "A", true)).toEqual({ kind: "ok" });
    expect(t.status("A")).toEqual({ locked: false, failures: 0, attemptsLeft: 5 });
  });

  it("forgets failures older than the lock duration", () => {
    const t = tracker();
    for (let i = 0; i < 4; i++) attempt(t, "A", false);
    clock += 15 * 60_000;
    expect(attempt(t, "A", false)).toEqual({ kind: "invalid", attemptsLeft: 4 });
  });

  it("never lets more than maxAttempts checks run at once for one code", () => {
    const t = tracker();
    attempt(t, "A", false);
    const tickets = Array.from({ length: 6 }, () => t.begin("A"));
    expect(tickets.map((ticket) => ticket.kind)).toEqual(["started", "started", "started", "started", "busy", "busy"]);
  });

  it("counts checks still in flight against the attempts left", () => {
    const t = tracker();
    for (let i = 0; i < 4; i++) attempt(t, "A", false);
    const last = t.begin("A");
    if (last.kind !== "started") throw new Error("expected the 5th slot");
    expect(t.begin("A")).toEqual({ kind: "busy" });
    expect(last.settle(false)).toMatchObject({ kind: "locked", justLocked: true });
    expect(t.begin("A")).toMatchObject({ kind: "locked" });
  });

  it("gives the slot back when verification throws", () => {
    const t = tracker();
    for (let i = 0; i < 5; i++) {
      const ticket = t.begin("A");
      if (ticket.kind === "started") ticket.release();
    }
    expect(t.status("A")).toEqual({ locked: false, failures: 0, attemptsLeft: 5 });
    expect(t.size()).toBe(0);
  });

  it("sweeps stale entries so random codes can't grow memory forever", () => {
    const t = tracker();
    for (let i = 0; i < 1_200; i++) attempt(t, `RANDOM${i}`, false);
    expect(t.size()).toBe(1_200);
    clock += 16 * 60_000;
    attempt(t, "FRESH", false);
    expect(t.size()).toBe(1);
  });
});

describe("mock adapter", () => {
  beforeEach(() => {
    resetMockAuthForTests();
  });

  const kinds = (results: AuthResult[]) =>
    results.reduce<Record<string, number>>((count, { kind }) => ({ ...count, [kind]: (count[kind] ?? 0) + 1 }), {});

  it("signs in a seeded user regardless of code case", async () => {
    const result = await authenticate("trw1001", MOCK_PASSWORD);
    expect(result).toMatchObject({ kind: "success", user: { employeeCode: "TRW1001", mustChangePassword: false } });
  });

  it("flags first-login users for a password change", async () => {
    const result = await authenticate("PUMA3001", MOCK_PASSWORD);
    expect(result).toMatchObject({ kind: "success", user: { mustChangePassword: true } });
  });

  it("refuses deactivated users only after the password matches", async () => {
    expect(await authenticate("TRW9001", MOCK_PASSWORD)).toMatchObject({ kind: "disabled" });
    expect(await authenticate("TRW9001", "wrong")).toMatchObject({ kind: "invalid" });
  });

  it("answers unknown codes exactly like wrong passwords, and locks them too", async () => {
    const unknown: AuthResult[] = [];
    const known: AuthResult[] = [];
    for (let i = 0; i < 5; i++) {
      unknown.push(await authenticate("NOBODY1", "x"));
      known.push(await authenticate("TRW1001", "x"));
    }
    const shape = (result: AuthResult) =>
      result.kind === "invalid" ? result.attemptsLeft : result.kind === "locked" ? "locked" : result.kind;
    expect(unknown.map(shape)).toEqual([4, 3, 2, 1, "locked"]);
    expect(known.map(shape)).toEqual(unknown.map(shape));
    // Locked accounts are refused even with the right password, without re-checking it.
    expect((await authenticate("NOBODY1", MOCK_PASSWORD)).kind).toBe("locked");
  });

  it("only reports the matched account for real codes (audit never logs typed text)", async () => {
    expect(await authenticate("TRW1001", "x")).toMatchObject({ account: { employeeCode: "TRW1001" } });
    expect(await authenticate("my-password-typed-here", "x")).toMatchObject({ account: null });
  });

  it("locks a real account after 5 failures even if the 6th try is correct", async () => {
    for (let i = 0; i < 5; i++) await authenticate("ADM0001", "wrong");
    expect((await authenticate("ADM0001", MOCK_PASSWORD)).kind).toBe("locked");
  });

  it("checks at most 5 passwords when guesses arrive in parallel", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => authenticate("TRW1001", "wrong")));
    expect(kinds(results)).toEqual({ invalid: 4, locked: 1, busy: 15 });
  });

  it("never lets a correct guess inside a parallel burst sign in or clear the lock", async () => {
    const burst = [...Array.from({ length: 50 }, () => "wrong"), MOCK_PASSWORD];
    const results = await Promise.all(burst.map((password) => authenticate("TRW2001", password)));
    expect(results.some((result) => result.kind === "success")).toBe(false);
    expect((await authenticate("TRW2001", MOCK_PASSWORD)).kind).toBe("locked");
  });
});

describe("auditedCode", () => {
  it("logs real employee codes, and only a keyed fingerprint of anything else typed", () => {
    process.env.SESSION_SECRET ??= "test-secret";
    expect(auditedCode({ employeeCode: "TRW1001" }, "TRW1001")).toBe("TRW1001");
    const masked = auditedCode(null, "QCHECK-TEST-2026");
    expect(masked).toMatch(/^<unknown:[0-9a-f]{16}>$/);
    expect(masked).not.toContain("QCHECK");
    expect(auditedCode(null, "QCHECK-TEST-2026")).toBe(masked);
  });
});

describe("isSameOriginRequest (logout CSRF check)", () => {
  const check = (headers: Record<string, string>) => isSameOriginRequest(new Headers(headers));

  it("accepts the host the browser actually used — LAN IP or proxy hostname", () => {
    expect(check({ host: "192.168.1.50:3000", origin: "http://192.168.1.50:3000" })).toBe(true);
    expect(check({ host: "192.168.0.248", origin: "http://192.168.0.248:8082" })).toBe(true);
    expect(
      check({ host: "localhost:3000", "x-forwarded-host": "qcheck.example.com", origin: "https://qcheck.example.com" }),
    ).toBe(true);
    expect(check({ host: "localhost:3000", "sec-fetch-site": "same-origin", origin: "http://localhost:3000" })).toBe(true);
  });

  it("rejects other sites, opaque origins and cross-site fetch metadata", () => {
    expect(check({ host: "qcheck.example.com", origin: "https://evil.example" })).toBe(false);
    expect(check({ host: "qcheck.example.com", origin: "null" })).toBe(false);
    expect(check({ host: "qcheck.example.com", "sec-fetch-site": "cross-site" })).toBe(false);
  });
});
