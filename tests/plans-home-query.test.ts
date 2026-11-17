import { describe, expect, it } from "vitest";
import { HOME_DEADLINE_LIMIT, HOME_RECENT_LIMIT, parseHomeQuery } from "@/lib/plans/home-query";

describe("parseHomeQuery", () => {
  it("is empty without a q", () => {
    expect(parseHomeQuery({})).toBe("");
    expect(parseHomeQuery({ q: undefined })).toBe("");
    expect(parseHomeQuery({ page: "2" })).toBe("");
  });

  it("trims the words and cuts them at 200 characters", () => {
    expect(parseHomeQuery({ q: "  XM2525  " })).toBe("XM2525");
    expect(parseHomeQuery({ q: "x".repeat(300) })).toHaveLength(200);
    expect(parseHomeQuery({ q: "   " })).toBe("");
  });

  it("counts one value only: a repeated q is no search", () => {
    expect(parseHomeQuery({ q: ["a", "b"] })).toBe("");
  });
});

describe("the dashboard's list sizes", () => {
  it("shows the 8 newest plans and the 5 nearest deadlines", () => {
    expect(HOME_RECENT_LIMIT).toBe(8);
    expect(HOME_DEADLINE_LIMIT).toBe(5);
  });
});
