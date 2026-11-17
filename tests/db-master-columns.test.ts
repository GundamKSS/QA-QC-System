import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Standing rule (docs/03 §3.0): every master table carries วันที่เพิ่ม (created_at), วันที่แก้ไข
 * (updated_at) and สถานะ (is_active, or a `status` for tables with their own lifecycle).
 * A new table in db/*.sql must either have them or be listed here with the reason it is exempt,
 * so nobody can forget the columns by accident.
 */
const EXEMPT: Record<string, string> = {
  audit_logs: "append-only log, not master data (has its own `at`)",
  user_roles: "link table owned by users; the user row carries the dates and status",
  doc_counters: "running-number counter (BR-10), not master data",
  receipt_docs: "transaction document (Invoice/PO); its plans carry the status",
  plan_status_history: "append-only log of plan status changes (has its own `at`)",
  work_order_assignees: "link table owned by work_orders; the work order carries the dates and status",
};

const dir = join(process.cwd(), "db");
const files = readdirSync(dir).filter((name) => /^\d{3}_[\w-]+\.sql$/.test(name)).sort();

type Table = { file: string; name: string; body: string };
const tables: Table[] = files.flatMap((file) => {
  const sql = readFileSync(join(dir, file), "utf8");
  return [...sql.matchAll(/CREATE TABLE dbo\.(\w+)\s*\(([\s\S]*?)\n\s*\);/gi)].map((match) => ({ file, name: match[1], body: match[2] }));
});

describe("db migrations", () => {
  it("finds the tables (guards the parser itself)", () => {
    expect(tables.map((table) => table.name)).toEqual(expect.arrayContaining(["users", "user_roles", "audit_logs"]));
  });

  it.each(tables.filter((table) => !(table.name in EXEMPT)))("$name ($file) has created_at, updated_at and a status column", ({ body }) => {
    expect(body, "created_at (วันที่เพิ่ม)").toMatch(/\bcreated_at\b/);
    expect(body, "updated_at (วันที่แก้ไข)").toMatch(/\bupdated_at\b/);
    expect(body, "is_active / status (สถานะ)").toMatch(/\b(is_active|status)\b/);
  });

  it("only exempts tables that exist", () => {
    for (const name of Object.keys(EXEMPT)) expect(tables.map((table) => table.name)).toContain(name);
  });

  it("uses unique migration names", () => {
    expect(new Set(files).size).toBe(files.length);
  });

  it("has balanced parentheses in every file (outside comments and strings)", () => {
    for (const file of files) {
      const sql = readFileSync(join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''");
      const depth = [...sql].reduce((count, char) => count + (char === "(" ? 1 : char === ")" ? -1 : 0), 0);
      expect(depth, file).toBe(0);
    }
  });

  it("keeps constraint names unique except explicitly guarded repairs of the same object", () => {
    // 008 completes the earlier users schema. Reusing these exact definitions is
    // valid only with the missing-column/constraint guard; fresh installs already have them.
    const repair = readFileSync(join(dir, "008_users_schema_repair.sql"), "utf8");
    expect(repair).toMatch(/IF COL_LENGTH\(N'dbo\.users', N'pin_must_change'\) IS NULL\s+ALTER TABLE dbo\.users ADD pin_must_change BIT NOT NULL\s+CONSTRAINT DF_users_pin_must_change DEFAULT \(0\)/);
    expect(repair).toMatch(/IF OBJECT_ID\(N'dbo\.FK_users_updated_by', N'F'\) IS NULL\s+ALTER TABLE dbo\.users ADD CONSTRAINT FK_users_updated_by\s+FOREIGN KEY \(updated_by\) REFERENCES dbo\.users \(id\)/);
    const repaired = new Set(["df_users_pin_must_change", "fk_users_updated_by"]);
    const names = files.flatMap((file) => {
      const sql = readFileSync(join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
      return [...sql.matchAll(/CONSTRAINT\s+(\w+)\s+(?:PRIMARY|UNIQUE|CHECK|FOREIGN|DEFAULT)/gi)].map((match) => match[1].toLowerCase())
        .concat([...sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?(?:NONCLUSTERED\s+)?INDEX\s+(\w+)/gi)].map((match) => match[1].toLowerCase()))
        .filter((name) => file !== "008_users_schema_repair.sql" || !repaired.has(name));
    });
    // A constraint may be re-created after an explicit DROP CONSTRAINT (e.g. 003 widens CK_users_source).
    const dropped = new Set(files.flatMap((file) => [...readFileSync(join(dir, file), "utf8").matchAll(/DROP\s+CONSTRAINT\s+(\w+)/gi)].map((match) => match[1].toLowerCase())));
    const seen = new Set<string>();
    const duplicates = names.filter((name) => (seen.has(name) && !dropped.has(name) ? true : (seen.add(name), false)));
    expect(duplicates).toEqual([]);
  });

  it("parses foreign keys to tables that exist", () => {
    const names = new Set(tables.map((table) => table.name.toLowerCase()));
    for (const file of files) {
      const sql = readFileSync(join(dir, file), "utf8");
      for (const match of sql.matchAll(/REFERENCES\s+dbo\.(\w+)/gi)) expect(names, `${file}: ${match[1]}`).toContain(match[1].toLowerCase());
    }
  });
});
