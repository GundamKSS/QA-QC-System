import { describe, expect, it } from "vitest";
import { masterTableApiQuery, masterTableHref, MASTER_PAGE_SIZE, parseMasterTableQuery, type MasterTableValues } from "@/lib/master/table-query";

const base: MasterTableValues = { q: "", status: "all", page: 1, editId: null, creating: false, saved: null };

describe("parseMasterTableQuery", () => {
  it("falls back to no filter and nothing open for an empty address", () => {
    expect(parseMasterTableQuery({})).toEqual(base);
  });

  it("reads every value of the address", () => {
    expect(parseMasterTableQuery({ q: "ปั๊ม", status: "inactive", page: "3", edit: "12", new: "1", saved: "7" })).toEqual({ q: "ปั๊ม", status: "inactive", page: 3, editId: 12, creating: true, saved: 7 });
  });

  it("takes the first of a repeated name", () => {
    expect(parseMasterTableQuery({ q: ["a", "b"], status: ["active", "inactive"] })).toMatchObject({ q: "a", status: "active" });
  });

  it.each(["", "all", "ACTIVE", "x", "__proto__"])("treats status %j as 'all'", (status) => {
    expect(parseMasterTableQuery({ status }).status).toBe("all");
  });

  it("cuts the search text at 100 characters", () => {
    expect(parseMasterTableQuery({ q: "x".repeat(300) }).q).toHaveLength(100);
  });

  it.each([["0", 1], ["-4", 1], ["abc", 1], ["2.9", 2], ["99999999", 10_000]])("reads page %j as %i", (page, expected) => {
    expect(parseMasterTableQuery({ page }).page).toBe(expected);
  });

  it.each(["", "abc", "-1", "1.5", "1234567890", "0x1"])("ignores edit and saved %j that are not a row id", (value) => {
    expect(parseMasterTableQuery({ edit: value, saved: value })).toMatchObject({ editId: null, saved: null });
  });

  it("opens the create form only for new=1", () => {
    expect(parseMasterTableQuery({ new: "1" }).creating).toBe(true);
    expect(parseMasterTableQuery({ new: "true" }).creating).toBe(false);
  });

  it("uses the page size of the lists", () => {
    expect(MASTER_PAGE_SIZE).toBe(50);
  });
});

describe("masterTableApiQuery", () => {
  it("is empty for the plain list, so the URL stays short", () => {
    expect(masterTableApiQuery(base)).toBe("");
  });

  it("carries the filters and the open form, but never `saved`", () => {
    const query = masterTableApiQuery({ q: "ก", status: "active", page: 2, editId: 5, creating: true, saved: 9 });
    expect(Object.fromEntries(new URLSearchParams(query))).toEqual({ q: "ก", status: "active", page: "2", edit: "5", new: "1" });
  });

  it("round-trips through the parser", () => {
    const values: MasterTableValues = { q: "a&b=c", status: "inactive", page: 4, editId: 3, creating: false, saved: null };
    expect(parseMasterTableQuery(Object.fromEntries(new URLSearchParams(masterTableApiQuery(values))))).toEqual(values);
  });
});

describe("masterTableHref", () => {
  it("is the bare path when nothing is set", () => {
    expect(masterTableHref("brands", base)).toBe("/master/brands");
  });

  it("keeps the filters and adds the changes", () => {
    expect(masterTableHref("brands", { q: "x", status: "active", page: 3 }, { edit: 8 })).toBe("/master/brands?q=x&status=active&page=3&edit=8");
    expect(masterTableHref("brands", base, { new: "1" })).toBe("/master/brands?new=1");
  });

  it("lets a change replace the page and drops empty values", () => {
    expect(masterTableHref("brands", { q: "x", status: "all", page: 3 }, { page: 2 })).toBe("/master/brands?q=x&page=2");
    expect(masterTableHref("brands", { q: "x", status: "all", page: 3 }, { page: null })).toBe("/master/brands?q=x");
  });

  it("encodes the search text", () => {
    expect(masterTableHref("brands", { ...base, q: "a&b" })).toBe("/master/brands?q=a%26b");
  });
});
