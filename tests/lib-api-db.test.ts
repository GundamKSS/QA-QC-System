import { afterEach, describe, expect, it, vi } from "vitest";
import { dbProblemMessages } from "@/lib/db/errors";
import { dbFailure } from "@/lib/api/db";

afterEach(() => vi.restoreAllMocks());

/** What the mssql driver throws: recognised by name, classified by code. */
const driverError = (name: string, code: string) => Object.assign(new Error("raw driver text with a server name"), { name, code });

describe("dbFailure", () => {
  it("turns a database error into a 503 with the screen's sentence, never the raw text", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = dbFailure(driverError("ConnectionError", "ETIMEOUT"), "change pin");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "error", message: dbProblemMessages.unreachable });
    expect(log).toHaveBeenCalledWith("[db] change pin failed", "raw driver text with a server name");
  });

  it("carries extra fields (what the form should keep) into the body", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = dbFailure(driverError("RequestError", "ESOCKET"), "master write", { values: { name: "Puma" }, at: 5 });
    expect(await response.json()).toEqual({ status: "error", message: dbProblemMessages.unreachable, values: { name: "Puma" }, at: 5 });
  });

  it("rethrows anything that is not a database error so bugs are not hidden", () => {
    expect(() => dbFailure(new TypeError("bug"), "x")).toThrow("bug");
  });
});
