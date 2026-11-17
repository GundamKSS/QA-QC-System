import { describe, expect, it } from "vitest";
import { createPinGuard, hashPin, pinFormatError, pinKey, verifyPin } from "./pin";

const PEPPER = "p".repeat(40);

describe("pinFormatError", () => {
  it("accepts non-trivial 6-digit PINs", () => {
    for (const pin of ["482615", "739104", "250813"]) expect(pinFormatError(pin)).toBeNull();
  });

  it("rejects wrong length, non-digits, repeats and runs", () => {
    expect(pinFormatError("1234")).toBe("length");
    expect(pinFormatError("4826151")).toBe("length");
    expect(pinFormatError("")).toBe("length");
    expect(pinFormatError("48261a")).toBe("digits");
    expect(pinFormatError("111111")).toBe("repeated");
    expect(pinFormatError("123456")).toBe("sequence");
    expect(pinFormatError("654321")).toBe("sequence");
    expect(pinFormatError("345678")).toBe("sequence");
  });
});

describe("pin guard", () => {
  const fail = (guard: ReturnType<typeof createPinGuard>, code = "F0001") => {
    const ticket = guard.beginAccount(code);
    if (ticket.kind !== "started") throw new Error(`expected started, got ${ticket.kind}`);
    return ticket.settle(false);
  };

  it("normalises the key", () => {
    expect(pinKey(" f0001 ")).toBe("pin:F0001");
  });

  it("locks an account after five wrong PINs and does not time out", () => {
    let now = 0;
    const guard = createPinGuard(() => now);
    for (let i = 1; i <= 4; i++) expect(fail(guard)).toMatchObject({ kind: "invalid", attemptsLeft: 5 - i });
    expect(fail(guard)).toMatchObject({ kind: "locked", justLocked: true });
    now += 23 * 60 * 60_000;
    expect(guard.beginAccount("f0001").kind).toBe("locked");
  });

  it("keeps accounts independent", () => {
    const guard = createPinGuard(() => 0);
    for (let i = 0; i < 5; i++) fail(guard);
    expect(guard.beginAccount("F0002").kind).toBe("started");
  });

  it("limits one IP across many accounts, and that limit times out", () => {
    let now = 0;
    const guard = createPinGuard(() => now);
    const spend = () => {
      const ticket = guard.beginIp("203.0.113.9");
      if (ticket.kind === "started") ticket.settle(false);
      return ticket.kind;
    };
    for (let i = 0; i < 30; i++) expect(spend()).toBe("started");
    expect(spend()).toBe("locked");
    now += 16 * 60_000;
    expect(spend()).toBe("started");
  });
});

describe("hashPin / verifyPin", () => {
  it("verifies the right PIN only, and salts each hash", async () => {
    const a = await hashPin("482615", PEPPER);
    const b = await hashPin("482615", PEPPER);
    expect(a).not.toBe(b);
    expect(await verifyPin("482615", a, PEPPER)).toBe(true);
    expect(await verifyPin("482616", a, PEPPER)).toBe(false);
  });

  it("is useless without the same pepper", async () => {
    const stored = await hashPin("482615", PEPPER);
    expect(await verifyPin("482615", stored, "q".repeat(40))).toBe(false);
  });

  it("refuses a short pepper", async () => {
    await expect(hashPin("482615", "short")).rejects.toThrow("PIN_PEPPER");
  });
});
