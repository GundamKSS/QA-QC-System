import { describe, expect, it } from "vitest";
import { shouldDockMasterFilters } from "@/components/master/filterDock";

describe("Master filter docking boundary", () => {
  it("waits until the filter row reaches the header", () => {
    expect(shouldDockMasterFilters(false, 200, 72)).toBe(false);
    expect(shouldDockMasterFilters(false, 81, 72)).toBe(false);
    expect(shouldDockMasterFilters(false, 80, 72)).toBe(true);
  });
  it("stays docked through small reversals so the row does not flicker", () => {
    expect(shouldDockMasterFilters(true, 81, 72)).toBe(true);
    expect(shouldDockMasterFilters(true, 99, 72)).toBe(true);
    expect(shouldDockMasterFilters(true, 100, 72)).toBe(false);
  });
  it("uses the measured header height on phones and resized screens", () => {
    expect(shouldDockMasterFilters(false, 72, 64)).toBe(true);
    expect(shouldDockMasterFilters(true, 92, 64)).toBe(false);
    expect(shouldDockMasterFilters(false, 104, 96)).toBe(true);
  });
  it("keeps the current location when a transient measurement is invalid", () => {
    expect(shouldDockMasterFilters(true, Number.NaN, 72)).toBe(true);
    expect(shouldDockMasterFilters(false, 80, Infinity)).toBe(false);
  });
});
