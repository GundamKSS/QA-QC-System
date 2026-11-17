import { describe, expect, it } from "vitest";
import { parseOpenedId, parseOpenPlanPrefill } from "@/lib/plans/open-query";

describe("parseOpenedId", () => {
  it("reads the plan that was just opened", () => {
    expect(parseOpenedId({ opened: "42" })).toBe(42);
    expect(parseOpenedId({ opened: ["7", "9"] })).toBe(7);
  });

  it.each(["", "abc", "-1", "1.5", "1234567890123", "0x10", "42 "])("ignores %j, which can't be a plan id", (opened) => {
    expect(parseOpenedId({ opened })).toBeNull();
  });

  it("is null without the parameter", () => {
    expect(parseOpenedId({})).toBeNull();
  });
});

describe("parseOpenPlanPrefill", () => {
  it("starts from an empty Invoice form when the address says nothing", () => {
    expect(parseOpenPlanPrefill({})).toEqual({ prefill: { docType: "INVOICE", vendorId: "", docNo: "" }, hasDocType: false });
  });

  it("carries the document of 'open the next model in this Invoice'", () => {
    expect(parseOpenPlanPrefill({ docType: "PO", vendorId: "12", docNo: "PO-7" })).toEqual({ prefill: { docType: "PO", vendorId: "12", docNo: "PO-7" }, hasDocType: true });
  });

  it.each(["po", "X", "INVOICE "])("falls back to Invoice for the type %j, but still knows the address named one", (docType) => {
    expect(parseOpenPlanPrefill({ docType })).toMatchObject({ prefill: { docType: "INVOICE" }, hasDocType: true });
  });

  it.each(["", "abc", "-3", "1234567890", "null"])("drops a vendor id that isn't one: %j", (vendorId) => {
    expect(parseOpenPlanPrefill({ vendorId }).prefill.vendorId).toBe("");
  });

  it("cuts the document number at 64 characters", () => {
    expect(parseOpenPlanPrefill({ docNo: "x".repeat(200) }).prefill.docNo).toHaveLength(64);
  });

  it("takes the first of a repeated name", () => {
    expect(parseOpenPlanPrefill({ docNo: ["A", "B"] }).prefill.docNo).toBe("A");
  });
});
