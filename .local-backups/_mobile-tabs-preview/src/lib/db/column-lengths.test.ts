import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLAN_STATUSES, WORK_ORDER_STATUSES } from "@/lib/plans/rules";

/**
 * 009 declared work_orders.status VARCHAR(10) with a default of 'IN_PROGRESS' (11), so no work order
 * could be saved on SQL Server (fixed in 010). The memory store can't see column sizes, so check the
 * .sql files: the length a column ends up with after every migration must hold its default and every
 * value the app writes into it.
 */
const dir = join(process.cwd(), "db");
const files = readdirSync(dir).filter((name) => /^\d{3}_[\w-]+\.sql$/.test(name)).sort();

/** table.column → final VARCHAR/NVARCHAR/CHAR length, and the string default declared with it. */
const columns = new Map<string, { length: number; defaultValue?: string }>();
for (const file of files) {
  const sql = readFileSync(join(dir, file), "utf8");
  for (const [, table, body] of sql.matchAll(/CREATE TABLE dbo\.(\w+)\s*\(([\s\S]*?)\n\s*\);/gi)) {
    for (const [, column, length, rest] of body.matchAll(/^\s*(\w+)\s+N?(?:VAR)?CHAR\((\d+)\)([^\n]*)/gim)) {
      columns.set(`${table}.${column}`, { length: Number(length), defaultValue: /DEFAULT \('([^']*)'\)/i.exec(rest)?.[1] });
    }
  }
  for (const [, table, column, length] of sql.matchAll(/ALTER TABLE dbo\.(\w+) ALTER COLUMN (\w+) N?(?:VAR)?CHAR\((\d+)\)/gi)) {
    const current = columns.get(`${table}.${column}`);
    columns.set(`${table}.${column}`, { ...current, length: Number(length) });
  }
}

const longest = (values: readonly string[]) => Math.max(...values.map((value) => value.length));

describe("db column lengths", () => {
  it("parses the migrations (guards the parser itself)", () => {
    expect(columns.get("work_orders.status")?.length).toBeGreaterThan(0);
    expect(columns.get("plans.status")?.defaultValue).toBe("OPEN");
  });

  it("every string default fits its column", () => {
    const tooLong = [...columns].filter(([, column]) => column.defaultValue !== undefined && column.defaultValue.length > column.length);
    expect(tooLong.map(([name, column]) => `${name} ${column.length} < '${column.defaultValue}'`)).toEqual([]);
  });

  it.each([
    ["work_orders.status", WORK_ORDER_STATUSES],
    ["work_orders.type", ["QC", "CALLIN_FIX"]],
    ["plans.status", PLAN_STATUSES],
    ["plan_status_history.from_status", PLAN_STATUSES],
    ["plan_status_history.to_status", PLAN_STATUSES],
  ] as const)("%s holds every value the app writes", (name, values) => {
    expect(columns.get(name)?.length ?? 0).toBeGreaterThanOrEqual(longest(values));
  });
});
