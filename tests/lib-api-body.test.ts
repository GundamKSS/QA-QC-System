import { describe, expect, it } from "vitest";
import { readFields } from "@/lib/api/body";

const url = "http://localhost/api/x";
const jsonRequest = (body: string | object) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("readFields — JSON", () => {
  it("reads strings, and turns numbers and booleans into strings", async () => {
    const fields = await readFields(jsonRequest({ name: "สมชาย", qty: 12, active: true, empty: "" }));
    expect(fields.get("name")).toBe("สมชาย");
    expect(fields.get("qty")).toBe("12");
    expect(fields.get("active")).toBe("true");
    expect(fields.get("empty")).toBe("");
  });

  it("gives null / '' / [] for missing or non-scalar values", async () => {
    const fields = await readFields(jsonRequest({ nested: { a: 1 }, nothing: null }));
    expect(fields.get("missing")).toBeNull();
    expect(fields.get("nested")).toBeNull();
    expect(fields.get("nothing")).toBeNull();
    expect(fields.text("missing")).toBe("");
    expect(fields.all("missing")).toEqual([]);
  });

  it("reads a repeated field as a list, and a single value as a one-item list", async () => {
    const fields = await readFields(jsonRequest({ roles: ["QC_INSPECTOR", "QA_INSPECTOR", 3], one: "ADMIN" }));
    expect(fields.all("roles")).toEqual(["QC_INSPECTOR", "QA_INSPECTOR"]);
    expect(fields.all("one")).toEqual(["ADMIN"]);
  });

  it("does not read inherited object keys", async () => {
    const fields = await readFields(jsonRequest('{"a":"1"}'));
    expect(fields.get("constructor")).toBeNull();
    expect(fields.get("__proto__")).toBeNull();
  });

  it("answers empty fields for a malformed, array or missing body instead of throwing", async () => {
    for (const request of [jsonRequest("{not json"), jsonRequest("[1,2]"), jsonRequest("null"), new Request(url, { method: "POST" })]) {
      const fields = await readFields(request);
      expect(fields.get("a")).toBeNull();
      expect(fields.all("a")).toEqual([]);
    }
  });
});

describe("readFields — size limit", () => {
  const sized = (bytes: number, body = '{"a":"1"}') =>
    new Request(url, { method: "POST", headers: { "content-type": "application/json", "content-length": String(bytes) }, body });

  it("reads nothing from a body that declares more than the limit (1 MB unless told otherwise)", async () => {
    expect((await readFields(sized(1024 * 1024 + 1))).get("a")).toBeNull();
    expect((await readFields(sized(1024 * 1024))).get("a")).toBe("1");
  });

  it("takes a tighter limit per route", async () => {
    expect((await readFields(sized(16 * 1024 + 1), { maxBytes: 16 * 1024 })).get("a")).toBeNull();
    expect((await readFields(sized(200), { maxBytes: 16 * 1024 })).get("a")).toBe("1");
  });

  it("does not choke on a missing or unreadable Content-Length", async () => {
    expect((await readFields(jsonRequest({ a: "1" }))).get("a")).toBe("1");
    expect((await readFields(sized(Number.NaN))).get("a")).toBe("1");
  });
});

describe("readFields — plain form posts", () => {
  it("reads a urlencoded form, repeated names included", async () => {
    const request = new Request(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "fullName=%E0%B8%AA%E0%B8%A1%E0%B8%8A%E0%B8%B2%E0%B8%A2&roles=QC_INSPECTOR&roles=QA_INSPECTOR&one=ADMIN",
    });
    const fields = await readFields(request);
    expect(fields.get("fullName")).toBe("สมชาย");
    expect(fields.all("roles")).toEqual(["QC_INSPECTOR", "QA_INSPECTOR"]);
    expect(fields.all("one")).toEqual(["ADMIN"]);
  });

  it("reads a multipart form", async () => {
    const form = new FormData();
    form.set("current", "123456");
    form.append("assignees", "11");
    form.append("assignees", "12");
    const fields = await readFields(new Request(url, { method: "POST", body: form }));
    expect(fields.text("current")).toBe("123456");
    expect(fields.all("assignees")).toEqual(["11", "12"]);
  });
});
