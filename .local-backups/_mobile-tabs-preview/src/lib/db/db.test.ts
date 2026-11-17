import { describe, expect, it } from "vitest";
import { checksum, migrationFiles, splitBatches } from "../../../scripts/migrate-lib.mjs";
import { dbConfigFromEnv, dbConfigured } from "./config";

describe("db config", () => {
  it("is off without DB_SERVER", () => {
    expect(dbConfigured({})).toBe(false);
    expect(dbConfigured({ DB_SERVER: "  " })).toBe(false);
    expect(() => dbConfigFromEnv({})).toThrow("DB_SERVER");
  });

  it("builds a config with safe defaults", () => {
    const c = dbConfigFromEnv({ DB_SERVER: "db1", DB_USER: "u", DB_PASSWORD: "p" });
    expect(c).toMatchObject({ server: "db1", port: 1433, database: "QCheck" });
    expect(c.options).toMatchObject({ encrypt: true, trustServerCertificate: false, useUTC: true });
  });

  it("honors overrides and rejects bad input", () => {
    const base = { DB_SERVER: "db1", DB_USER: "u", DB_PASSWORD: "p" };
    expect(dbConfigFromEnv({ ...base, DB_PORT: "14330", DB_TRUST_CERT: "on", DB_ENCRYPT: "off" })).toMatchObject({
      port: 14330,
      options: { encrypt: false, trustServerCertificate: true },
    });
    expect(() => dbConfigFromEnv({ ...base, DB_PORT: "abc" })).toThrow("DB_PORT");
    expect(() => dbConfigFromEnv({ DB_SERVER: "db1" })).toThrow("DB_USER");
  });
});

describe("migration helpers", () => {
  it("splits on GO lines only", () => {
    expect(splitBatches("SELECT 1\nGO\nSELECT 'GO'\r\ngo\n\nSELECT 3")).toEqual(["SELECT 1", "SELECT 'GO'", "SELECT 3"]);
  });

  it("checksum ignores line-ending style", () => {
    expect(checksum("a\r\nb")).toBe(checksum("a\nb"));
    expect(checksum("a")).not.toBe(checksum("b"));
  });

  it("keeps numbered .sql files in order", () => {
    expect(migrationFiles(["002_b.sql", "README.md", "001_users.sql", "x.sql"])).toEqual(["001_users.sql", "002_b.sql"]);
  });
});
