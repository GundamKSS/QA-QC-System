import { describe, expect, it } from "vitest";
import { activeReadIds, notificationReadKey, parseReadIds } from "./read-state";

describe("device notification receipts", () => {
  it("isolates accounts and safely handles unavailable or corrupt storage", () => {
    expect(notificationReadKey("person-1")).not.toBe(notificationReadKey("person-2"));
    for (const value of [null, "{", "null", "{}", "42"]) expect([...parseReadIds(value)]).toEqual([]);
    expect([...parseReadIds('["work:1",null,42,"work:1"]')]).toEqual(["work:1"]);
  });

  it("keeps outstanding work read but allows a returned or reassigned item to alert", () => {
    const read = new Set(["work:1:IN_PROGRESS", "work:2:IN_PROGRESS"]);
    expect([...activeReadIds(read, [{ id: "work:1:IN_PROGRESS" }, { id: "work:2:RETURNED" }])]).toEqual(["work:1:IN_PROGRESS"]);
    expect(activeReadIds(read, []).has("work:1:IN_PROGRESS")).toBe(false);
  });
});
