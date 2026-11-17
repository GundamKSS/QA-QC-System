import { describe, expect, it } from "vitest";
import { dbProblem, isDbError } from "./errors";

const mssql = (name: string, code: string, inner?: object) => Object.assign(new Error("x"), { name, code, originalError: inner });

describe("db errors", () => {
  it("recognises mssql errors only", () => {
    expect(isDbError(mssql("ConnectionError", "ESOCKET"))).toBe(true);
    expect(isDbError(new Error("NEXT_REDIRECT"))).toBe(false);
    expect(isDbError("boom")).toBe(false);
  });

  it("finds a self-signed certificate nested under ESOCKET", () => {
    const inner = Object.assign(new Error("socket"), { code: "ESOCKET", cause: Object.assign(new Error("cert"), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" }) });
    expect(dbProblem(mssql("ConnectionError", "ESOCKET", inner))).toBe("tls");
  });

  it("classifies login, network and unknown failures", () => {
    expect(dbProblem(mssql("ConnectionError", "ELOGIN"))).toBe("login");
    expect(dbProblem(mssql("ConnectionError", "ETIMEOUT"))).toBe("unreachable");
    expect(dbProblem(mssql("RequestError", "EREQUEST"))).toBe("other");
  });
});
