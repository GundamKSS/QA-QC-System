import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DEC-14: the severity and Disposition that decide a unit's result live on the item × defect × part link
 * (db/014), because QA's defect lists give the same defect different rules per pump type and part.
 * The defect-level columns stay as defaults that get copied into new links, so both sides must accept
 * exactly the same values — otherwise copying a default would fail on SQL Server.
 */
const read = (file: string) => readFileSync(join(process.cwd(), "db", file), "utf8");
const defects = read("006_master_defects.sql");
const rules = read("014_item_defect_rules.sql");

/** Values allowed by `CONSTRAINT <name> CHECK (<column> IN ('A', 'B'))`. */
function checkValues(sql: string, constraint: string): string[] {
  const match = new RegExp(`CONSTRAINT ${constraint} CHECK \\(\\w+ IN \\(([^)]*)\\)\\)`).exec(sql);
  if (!match) throw new Error(`${constraint} not found`);
  return [...match[1].matchAll(/'([^']*)'/g)].map((value) => value[1]);
}

const linkDispositions = /CREATE TABLE dbo\.item_defect_dispositions\s*\(([\s\S]*?)\n\s*\);/.exec(rules)?.[1] ?? "";

describe("item defect rules (db/014)", () => {
  it("adds part, seq and a required severity to item_defects", () => {
    expect(rules).toMatch(/ALTER TABLE dbo\.item_defects ADD part NVARCHAR\(100\) NULL/);
    expect(rules).toMatch(/ALTER TABLE dbo\.item_defects ADD seq INT NULL/);
    expect(rules).toMatch(/ALTER TABLE dbo\.item_defects ALTER COLUMN severity VARCHAR\(8\) NOT NULL/);
  });

  it("fills severity for existing links before making it NOT NULL", () => {
    const fill = rules.indexOf("SET severity = d.severity");
    expect(fill).toBeGreaterThan(-1);
    expect(fill).toBeLessThan(rules.indexOf("ALTER COLUMN severity"));
  });

  it("allows the same severities as defects", () => {
    expect(checkValues(rules, "CK_item_defects_severity")).toEqual(checkValues(defects, "CK_defects_severity"));
  });

  it("lets one item offer the same defect for several parts", () => {
    expect(rules).toMatch(/DROP CONSTRAINT UQ_item_defects;/);
    expect(rules).toMatch(/CONSTRAINT UQ_item_defects_part UNIQUE \(item_id, defect_id, part\)/);
  });

  it("keys link dispositions by brand group only — each checklist already belongs to one role", () => {
    expect(linkDispositions).not.toBe("");
    expect(linkDispositions).not.toMatch(/^\s*role\b/m);
    expect(linkDispositions).toMatch(/CONSTRAINT UQ_item_defect_dispositions UNIQUE \(item_defect_id, brand_group\)/);
  });

  it("accepts the same brand groups and dispositions as the defect-level defaults", () => {
    expect(checkValues(rules, "CK_item_defect_dispositions_group")).toEqual(checkValues(defects, "CK_defect_dispositions_group"));
    expect(checkValues(rules, "CK_item_defect_dispositions_value")).toEqual(checkValues(defects, "CK_defect_dispositions_value"));
  });

  it("copies defaults only into links with no disposition yet, using the checklist's role", () => {
    expect(rules).toMatch(/dd\.role = t\.role/);
    expect(rules).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM dbo\.item_defect_dispositions AS x WHERE x\.item_defect_id = l\.id\);/);
  });
});
