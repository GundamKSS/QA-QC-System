import { describe, expect, it } from "vitest";
import { readQuery } from "@/lib/api/query";

const request = (query: string) => new Request(`http://localhost:3000/api/x${query}`);

describe("readQuery", () => {
  it("gives a name that appears once as a string and a repeated name as an array, like a page's searchParams", () => {
    expect(readQuery(request("?kind=done&page=2&tag=a&tag=b"))).toEqual({ kind: "done", page: "2", tag: ["a", "b"] });
  });

  it("is empty when there is no query", () => {
    expect(readQuery(request(""))).toEqual({});
    expect(readQuery(request("?"))).toEqual({});
  });

  it("keeps an empty value and decodes percent-encoding", () => {
    expect(readQuery(request("?q=&name=%E0%B8%AA%E0%B8%A1%E0%B8%8A%E0%B8%B2%E0%B8%A2&sp=a+b"))).toEqual({ q: "", name: "สมชาย", sp: "a b" });
  });

  it("treats `__proto__` as an ordinary name, not as a way to change the object", () => {
    const query = readQuery(request("?__proto__=x&a=1"));
    expect(Object.keys(query)).toEqual(["__proto__", "a"]);
    expect(Object.getPrototypeOf(query)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).a).toBeUndefined();
  });
});
