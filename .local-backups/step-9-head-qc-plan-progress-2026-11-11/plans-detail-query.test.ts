import { describe, expect, it } from "vitest";
import { parsePlanDetailQuery, PLAN_TABS } from "@/lib/plans/detail-query";

describe("parsePlanDetailQuery", () => {
  it("opens the info tab when the address names none", () => {
    expect(parsePlanDetailQuery({})).toEqual({ tab: "info", opened: "" });
  });

  it.each(Object.keys(PLAN_TABS))("reads the tab %s", (tab) => {
    expect(parsePlanDetailQuery({ tab }).tab).toBe(tab);
  });

  it.each(["", "WORK", "x", "toString", "__proto__", "constructor", "hasOwnProperty"])("falls back to info for the tab %j", (tab) => {
    expect(parsePlanDetailQuery({ tab }).tab).toBe("info");
  });

  it("takes the first of a repeated name", () => {
    expect(parsePlanDetailQuery({ tab: ["history", "work"], opened: ["A-1", "B-2"] })).toEqual({ tab: "history", opened: "A-1" });
  });

  it("reads the work order that was just opened, cut at 40 characters", () => {
    expect(parsePlanDetailQuery({ opened: "QP-2610-0001-3" }).opened).toBe("QP-2610-0001-3");
    expect(parsePlanDetailQuery({ opened: "x".repeat(100) }).opened).toHaveLength(40);
  });

  it("has the three tabs the page draws", () => {
    expect(PLAN_TABS).toEqual({ info: "ข้อมูล", work: "ใบงาน", history: "ประวัติ" });
  });
});
