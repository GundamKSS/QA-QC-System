import { describe, expect, it } from "vitest";
import { fillFromQr, parsePumpQr, type PumpQr } from "@/lib/plans/qr";

/** Decoded from the right-hand QR of a real sticker (22 Oct 2026), exactly as the scanner reads it. */
const SAMPLE =
  "5x3 HP 260L. (PP-23P) + MOTOR MITSUBISHI 3 HP 380V. + Maxn. HITACHI 3 HP 380V.|FG1004-000675|WC:WMT-409|MODEL:PP-23P|FIC:FG-MT-00156|Date:2569/10/22|WO1274/69|SN69/00014-15";

/** SAMPLE with one `|` field replaced (0-based: 0 description … 7 serial). */
function sampleWith(index: number, value: string): string {
  return SAMPLE.split("|").map((part, at) => (at === index ? value : part)).join("|");
}

const rejected = (text: string) => {
  const result = parsePumpQr(text);
  if (result.ok) throw new Error(`expected a refusal for ${JSON.stringify(text)}`);
  return result.message;
};

describe("parsePumpQr", () => {
  it("reads the real sticker", () => {
    expect(parsePumpQr(SAMPLE)).toEqual({
      ok: true,
      data: {
        description: "5x3 HP 260L. (PP-23P) + MOTOR MITSUBISHI 3 HP 380V. + Maxn. HITACHI 3 HP 380V.",
        productId: "FG1004-000675",
        department: "409",
        modelCode: "PP-23P",
        productionDate: "2026-10-22",
        woNo: "WO1274/69",
        serial: "SN69/00014-15",
        lotQty: 15,
      },
    });
  });

  it.each(["\n", "\r\n", "  ", "﻿"])("ignores the Enter, spaces or BOM a scanner adds (%j)", (extra) => {
    expect(parsePumpQr(`${extra}${SAMPLE}${extra}`)).toMatchObject({ ok: true, data: { woNo: "WO1274/69" } });
  });

  it("does not use FIC, whatever it holds", () => {
    expect(parsePumpQr(sampleWith(4, ""))).toMatchObject({ ok: true });
    expect(parsePumpQr(sampleWith(4, "FIC:anything at all"))).toMatchObject({ ok: true });
  });

  it("tells the left-hand QR (a web address) from the right one", () => {
    expect(rejected("https://www.tirawatgroup.com")).toContain("ฝั่งขวา");
  });

  it.each(["", "   ", "\n"])("asks for another scan when nothing came (%j)", (text) => {
    expect(rejected(text)).toContain("สแกนใหม่");
  });

  it("refuses a code without exactly 8 fields and hints at the keyboard language", () => {
    const message = rejected(SAMPLE.split("|").slice(0, 7).join("|"));
    expect(message).toContain("8 ช่อง");
    expect(message).toContain("ภาษาอังกฤษ");
    expect(rejected(`${SAMPLE}|extra`)).toContain("8 ช่อง");
    expect(rejected("PP-23P")).toContain("8 ช่อง");
  });

  describe("department (WC)", () => {
    it.each([
      ["WC:WMT-409", "409"],
      ["WC:WMT-408", "408"],
      ["wc:wmt-408", "408"],
      ["WC:MT-409", "409"],
    ])("%s → %s", (center, department) => {
      expect(parsePumpQr(sampleWith(2, center))).toMatchObject({ ok: true, data: { department } });
    });

    it("refuses a department the system does not have", () => {
      expect(rejected(sampleWith(2, "WC:WMT-410"))).toContain("410");
    });

    it.each(["", "WMT-409", "WC:WMT409", "WC:WXX-409", "WC:WMT-4090"])("refuses the work centre %j", (center) => {
      expect(rejected(sampleWith(2, center))).toContain("WC");
    });
  });

  describe("model", () => {
    it("takes whatever follows MODEL:, trimmed", () => {
      expect(parsePumpQr(sampleWith(3, "MODEL: XM-2525 "))).toMatchObject({ ok: true, data: { modelCode: "XM-2525" } });
    });

    it.each(["", "MODEL:", "MODEL:  ", "PP-23P"])("refuses %j", (model) => {
      expect(rejected(sampleWith(3, model))).toContain("Model");
    });
  });

  describe("production date", () => {
    it.each([
      ["Date:2569/10/22", "2026-10-22"],
      ["Date:2569/1/5", "2026-01-05"],
      ["Date:2026/10/22", "2026-10-22"],
      ["Date:2571/02/29", "2028-02-29"],
    ])("%s → %s", (date, productionDate) => {
      expect(parsePumpQr(sampleWith(5, date))).toMatchObject({ ok: true, data: { productionDate } });
    });

    // 2568 is 2025, not a leap year; 2569/02/30 never exists.
    it.each(["", "2569/10/22", "Date:2569-10-22", "Date:2569/13/01", "Date:2569/10/32", "Date:2569/02/30", "Date:2568/02/29", "Date:69/10/22"])("refuses %j", (date) => {
      expect(rejected(sampleWith(5, date))).toContain("วันที่ผลิต");
    });
  });

  describe("production order (WO)", () => {
    it.each(["WO1274/69", "wo1274/69", "WO12345/69", "WO1274-69"])("accepts %s as it is", (wo) => {
      expect(parsePumpQr(sampleWith(6, wo))).toMatchObject({ ok: true, data: { woNo: wo } });
    });

    it.each(["", "1274/69", "WO", "WO 1274/69", `WO${"1".repeat(63)}`])("refuses %j", (wo) => {
      expect(rejected(sampleWith(6, wo))).toContain("WO");
    });
  });

  describe("serial and lot size", () => {
    it.each([
      ["SN69/00014-15", 15],
      ["SN69/00001-1", 1],
      ["SN2569/00100-120", 120],
    ])("%s → %i machines", (serial, lotQty) => {
      expect(parsePumpQr(sampleWith(7, serial))).toMatchObject({ ok: true, data: { serial, lotQty } });
    });

    it.each(["", "SN69/00014", "SN69/00014-0", "SN69/00014-", "69/00014-15", "SN69/00014-1000000"])("refuses %j", (serial) => {
      expect(rejected(sampleWith(7, serial))).toContain("Serial");
    });
  });
});

describe("fillFromQr", () => {
  const data = (parsePumpQr(SAMPLE) as { ok: true; data: PumpQr }).data;
  const models = [
    { id: 3, code: "XM2525", origin: "IMPORTED", isActive: true, description: "ปั๊มนำเข้า" },
    { id: 7, code: "PP-23P", origin: "DOMESTIC", isActive: true, description: "ปั๊มลม PP-23P ของ Model" },
  ] as const;

  it("sets what the form needs for a PO plan", () => {
    expect(fillFromQr(data, models)).toEqual({
      docType: "PO",
      docNo: "WO1274/69",
      department: "409",
      docDate: "2026-10-22",
      modelId: "7",
      description: data.description,
      lotQty: "15",
      warnings: [],
    });
  });

  it("finds the Model whatever the case or spacing of its code", () => {
    expect(fillFromQr({ ...data, modelCode: " pp-23p " }, models).modelId).toBe("7");
  });

  it("falls back to the Model's description only when the sticker has none", () => {
    expect(fillFromQr({ ...data, description: "" }, models).description).toBe("ปั๊มลม PP-23P ของ Model");
  });

  it("leaves the Model empty and says so when there is no such Model", () => {
    const fill = fillFromQr({ ...data, modelCode: "ZZ-99" }, models);
    expect(fill.modelId).toBe("");
    expect(fill.warnings).toHaveLength(1);
    expect(fill.warnings[0]).toContain("ZZ-99");
    // The rest of the sticker is still filled in.
    expect(fill).toMatchObject({ docNo: "WO1274/69", department: "409", lotQty: "15" });
  });

  it("does not take an imported Model for an in-house pump", () => {
    const fill = fillFromQr({ ...data, modelCode: "XM2525" }, models);
    expect(fill.modelId).toBe("");
    expect(fill.warnings[0]).toContain("นำเข้า");
  });

  it("does not take a Model that is switched off", () => {
    const fill = fillFromQr(data, [{ ...models[1], isActive: false }]);
    expect(fill.modelId).toBe("");
    expect(fill.warnings).toHaveLength(1);
  });
});
