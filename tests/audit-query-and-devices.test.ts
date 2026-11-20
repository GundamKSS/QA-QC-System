import { describe, expect, it } from "vitest";
import {
  auditActionLabel,
  auditQueryString,
  bangkokDayEndExclusiveUtc,
  bangkokDayStartUtc,
  parseAuditQuery,
} from "@/lib/audit/query";
import { parseRegisterDeviceInput, parseUpdateDeviceInput } from "@/lib/auth/device-validation";

describe("audit query parsing & formatting", () => {
  it("normalizes query parameters and rejects invalid groups/dates/pages", () => {
    expect(
      parseAuditQuery({
        q: "  TRW1001 ",
        group: "invalid_group",
        from: "2026-11-19",
        to: "bad-date",
        page: "-3",
      }),
    ).toEqual({
      q: "TRW1001",
      group: "",
      from: "2026-11-19",
      to: "",
      page: 1,
    });

    expect(
      auditQueryString({ q: "F0001", group: "user", from: "2026-11-01", to: "2026-11-19", page: 2 }),
    ).toBe("?q=F0001&group=user&from=2026-11-01&to=2026-11-19&page=2");
  });

  it("converts Bangkok dates cleanly to UTC inclusive/exclusive bounds", () => {
    expect(bangkokDayStartUtc("2026-11-19")).toBe("2026-11-18T17:00:00.000Z");
    expect(bangkokDayEndExclusiveUtc("2026-11-19")).toBe("2026-11-19T17:00:00.000Z");
    expect(bangkokDayStartUtc("not-a-date")).toBeNull();
  });

  it("provides Thai labels for known audit actions and falls back to raw code", () => {
    expect(auditActionLabel("login.success")).toBe("เข้าสู่ระบบสำเร็จ");
    expect(auditActionLabel("logout.idle")).toContain("Idle");
    expect(auditActionLabel("device.register")).toContain("อุปกรณ์");
    expect(auditActionLabel("custom.action")).toBe("custom.action");
  });
});

describe("shared device input validation", () => {
  it("normalizes valid register input and rejects invalid codes or idle bounds", () => {
    const ok = parseRegisterDeviceInput({
      deviceCode: " tab-qc-01 ",
      deviceName: " แท็บเล็ตจุดตรวจ 1 ",
      location: " แผนก 408 ",
      deviceKind: "shared",
      idleMinutes: "30",
    });
    expect(ok).toEqual({
      ok: true,
      value: {
        deviceCode: "TAB-QC-01",
        deviceName: "แท็บเล็ตจุดตรวจ 1",
        location: "แผนก 408",
        deviceKind: "shared",
        idleMinutes: 30,
      },
    });

    expect(parseRegisterDeviceInput({ deviceCode: "a", deviceName: "Tablet", idleMinutes: 30 }).ok).toBe(false);
    expect(parseRegisterDeviceInput({ deviceCode: "TAB-01", deviceName: "Tablet", idleMinutes: 2 }).ok).toBe(false);
    expect(parseRegisterDeviceInput({ deviceCode: "TAB-01", deviceName: "Tablet", idleMinutes: 999 }).ok).toBe(false);
  });

  it("validates partial updates cleanly", () => {
    expect(parseUpdateDeviceInput({}).ok).toBe(false);
    expect(parseUpdateDeviceInput({ isActive: "false", idleMinutes: "45" })).toEqual({
      ok: true,
      value: { isActive: false, idleMinutes: 45 },
    });
  });
});
