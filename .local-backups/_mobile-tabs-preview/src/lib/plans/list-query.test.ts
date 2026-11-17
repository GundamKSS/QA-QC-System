import { describe, expect, it } from "vitest";
import { activeFilterCount, parsePlanListQuery, planListHref, PLAN_PAGE_SIZE } from "./list-query";

describe("parsePlanListQuery (docs/15 §2)", () => {
  it("defaults to live plans, newest first, page 1", () => {
    const { values, filter } = parsePlanListQuery({});
    expect(values).toEqual({ q: "", status: "", vendor: "", ptype: "", from: "", to: "", sort: "opened", page: 1 });
    expect(filter).toEqual({ q: "", statuses: null, vendorId: null, pumpType: null, from: null, to: null, sort: "opened", page: 1, pageSize: PLAN_PAGE_SIZE });
  });

  it("maps a checklist status to its plan statuses", () => {
    expect(parsePlanListQuery({ status: "NOT_INSPECTED" }).filter.statuses).toEqual(["OPEN", "ASSIGNED"]);
    expect(parsePlanListQuery({ status: "CANCELLED" }).filter.statuses).toEqual(["CANCELLED"]);
  });

  it("drops malformed values instead of failing", () => {
    const { values } = parsePlanListQuery({ status: "toString", vendor: "1; DROP", from: "2026-02-30", sort: "evil", page: "-3" });
    expect(values).toMatchObject({ status: "", vendor: "", from: "", sort: "opened", page: 1 });
  });

  it("swaps a reversed date range and takes the first of repeated params", () => {
    const { values } = parsePlanListQuery({ from: "2026-10-31", to: "2026-10-01", q: [" INV ", "x"] });
    expect(values).toMatchObject({ from: "2026-10-01", to: "2026-10-31", q: "INV" });
  });
});

describe("planListHref", () => {
  it("keeps only non-default values and resets nothing it wasn't asked to", () => {
    const { values } = parsePlanListQuery({ q: "XM", status: "NOT_INSPECTED", sort: "deadline", page: "2" });
    expect(planListHref(values)).toBe("/plans?q=XM&status=NOT_INSPECTED&sort=deadline&page=2");
    expect(planListHref(values, { page: 1, sort: "opened" })).toBe("/plans?q=XM&status=NOT_INSPECTED");
    expect(planListHref(parsePlanListQuery({}).values)).toBe("/plans");
  });

  it("counts the filters hidden behind the mobile button", () => {
    expect(activeFilterCount(parsePlanListQuery({ q: "x" }).values)).toBe(0);
    expect(activeFilterCount(parsePlanListQuery({ status: "DONE", vendor: "2", from: "2026-10-01" }).values)).toBe(3);
  });
});
