import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultValues, displayValue, parseMasterForm } from "./form";
import { MASTERS, masterBySlug, type MasterDef } from "./registry";
import { buildCount, buildInsert, buildList, buildSetActive, buildUpdate } from "./sql";

const brands = masterBySlug("brands")!;
const models = masterBySlug("models")!;
const defects = masterBySlug("defects")!;
const form = (def: MasterDef, entries: Record<string, string>) => parseMasterForm(def, (key) => entries[key] ?? null);

describe("registry ↔ migrations", () => {
  const dir = join(process.cwd(), "db");
  const sql = readdirSync(dir)
    .filter((name) => /^\d{3}_[\w-]+\.sql$/.test(name))
    .sort()
    .map((name) => readFileSync(join(dir, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, ""))
    .join("\n");

  /** `name TYPE …` lines of the table's CREATE (plus columns added later with ALTER … ADD). */
  function columns(table: string) {
    const created = new RegExp(`CREATE TABLE dbo\\.${table}\\s*\\(([\\s\\S]*?)\\n\\s*\\);`, "i").exec(sql)?.[1] ?? "";
    const found = new Map<string, string>();
    for (const line of created.split("\n")) {
      const match = /^\s+(\w+)\s+(\w+(?:\([\w,\s]+\))?)(.*)$/.exec(line.replace(/--.*/, ""));
      if (match && !/^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK)$/i.test(match[1])) found.set(match[1], `${match[2]}${match[3]}`);
    }
    for (const alter of sql.matchAll(new RegExp(`ALTER TABLE dbo\\.${table} ADD ([^;]*?);`, "gi"))) {
      for (const match of alter[1].matchAll(/\b(\w+)\s+(BIGINT|INT|BIT|NVARCHAR\(\w+\)|VARCHAR\(\w+\)|DATETIME2\(\d\)|TINYINT)\b([^,]*)/gi)) found.set(match[1], `${match[2]}${match[3]}`);
    }
    return { found, created };
  }

  it("has unique slugs, tables and field keys", () => {
    expect(new Set(MASTERS.map((m) => m.slug)).size).toBe(MASTERS.length);
    expect(new Set(MASTERS.map((m) => m.table)).size).toBe(MASTERS.length);
    for (const def of MASTERS) expect(new Set(def.fields.map((f) => f.key)).size, def.slug).toBe(def.fields.length);
  });

  it.each(MASTERS.map((def) => [def.slug, def] as const))("%s matches its table definition", (_slug, def) => {
    const { found, created } = columns(def.table);
    expect(created, `${def.table} CREATE TABLE not found`).not.toBe("");
    // The standard master columns (docs/03 §3.0) are all present.
    for (const standard of ["is_active", "created_at", "created_by", "updated_at", "updated_by"]) expect([...found.keys()], standard).toContain(standard);
    for (const field of def.fields) {
      const column = found.get(field.key);
      expect(column, `${def.table}.${field.key} missing`).toBeDefined();
      if (field.kind !== "bool") expect(/\bNOT NULL\b/i.test(column!), `${def.table}.${field.key} required vs NOT NULL`).toBe(Boolean(field.required));
      if (field.kind === "text") expect(column, `${def.table}.${field.key} length`).toMatch(new RegExp(`VARCHAR\\(${field.max}\\)`, "i"));
      if (field.kind === "enum") {
        const check = new RegExp(`${field.key}\\s+IN\\s*\\(([^)]*)\\)`, "i").exec(created.replace(/\n/g, " ")) ?? new RegExp(`CHECK \\([^)]*${field.key}\\s+IN\\s*\\(([^)]*)\\)`, "i").exec(sql);
        const allowed = [...(check?.[1] ?? "").matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
        expect(field.options.map((o) => o.value).sort(), `${def.table}.${field.key} options vs CHECK`).toEqual(allowed);
      }
      if (field.kind === "ref") {
        expect(columns(field.ref.table).found.has(field.ref.labelColumn), `${field.ref.table}.${field.ref.labelColumn}`).toBe(true);
        expect(MASTERS.some((m) => m.table === field.ref.table), `${field.ref.table} is itself a master`).toBe(true);
      }
    }
  });
});

describe("parseMasterForm", () => {
  it("accepts a valid brand and trims", () => {
    expect(form(brands, { name: "  PUMA ", brand_group: "PUMA" })).toEqual({ ok: true, values: { name: "PUMA", brand_group: "PUMA" } });
  });

  it("reports required, length and choice errors per field", () => {
    const result = form(brands, { name: "x".repeat(65), brand_group: "BOSS" });
    expect(result).toMatchObject({ ok: false, errors: { name: expect.stringContaining("64"), brand_group: expect.any(String) } });
    expect(form(brands, { name: "", brand_group: "" })).toMatchObject({ ok: false, errors: { name: expect.any(String), brand_group: expect.any(String) } });
  });

  it("treats optional empties as null and checkboxes as booleans", () => {
    const result = form(models, { code: "M-1", brand_id: "3", origin: "DOMESTIC", is_scannable: "on" });
    expect(result).toEqual({ ok: true, values: { code: "M-1", description: null, brand_id: 3, pump_type_id: null, origin: "DOMESTIC", default_aql_level: null, is_scannable: true, barcode_pattern: null } });
  });

  it("validates numbers and references", () => {
    const base = { code: "D1", name_th: "รั่ว", severity: "MAJOR", cause_type_default: "UNKNOWN" };
    expect(form(defects, { ...base, complexity: "5" })).toMatchObject({ ok: false, errors: { complexity: expect.stringContaining("1") } });
    expect(form(defects, { ...base, complexity: "2.5" })).toMatchObject({ ok: false, errors: { complexity: expect.any(String) } });
    expect(form(defects, { ...base, complexity: "3" })).toMatchObject({ ok: true, values: { complexity: 3, requires_video: false, is_claimable: false } });
    expect(form(models, { code: "M", brand_id: "abc", origin: "IMPORTED" })).toMatchObject({ ok: false, errors: { brand_id: expect.any(String) } });
  });

  it("gives the new-row form sensible defaults", () => {
    expect(defaultValues(defects)).toMatchObject({ severity: "MINOR", complexity: 1, is_claimable: true, requires_video: false, cause_type_default: "UNKNOWN" });
  });

  it("formats values for display", () => {
    expect(displayValue(models.fields[4], "DOMESTIC")).toBe("ผลิตเอง");
    expect(displayValue(models.fields[6], true)).toBe("ใช่");
    expect(displayValue(models.fields[2], 3, "PUMA")).toBe("PUMA");
    expect(displayValue(models.fields[1], null)).toBe("—");
  });
});

describe("SQL builders", () => {
  it("lists with joins for references, paging and the standard columns", () => {
    const query = buildList(models, { page: 3, pageSize: 20 });
    expect(query.text).toContain("LEFT JOIN dbo.brands r0 ON r0.id = t.brand_id");
    expect(query.text).toContain("LEFT JOIN dbo.pump_types r1 ON r1.id = t.pump_type_id");
    expect(query.text).toContain("t.is_active, t.created_at, t.updated_at");
    expect(query.text).toContain("OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY");
    expect(query.params).toEqual(expect.arrayContaining([{ name: "offset", kind: "int", value: 40 }, { name: "limit", kind: "int", value: 20 }]));
  });

  it("filters by status and escapes LIKE wildcards in the search", () => {
    const query = buildList(brands, { status: "inactive", q: "50%_[x" });
    expect(query.text).toContain("t.is_active = 0");
    expect(query.text).toContain("t.name LIKE @q ESCAPE '\\'");
    expect(query.params.find((p) => p.name === "q")?.value).toBe("%50\\%\\_\\[x%");
    expect(buildCount(brands, { status: "active" }).text).toBe("SELECT COUNT(*) AS total FROM dbo.brands t WHERE t.is_active = 1");
  });

  it("clamps the page size and never goes below page 1", () => {
    expect(buildList(brands, { page: -4, pageSize: 100000 }).params).toEqual(expect.arrayContaining([{ name: "offset", kind: "int", value: 0 }, { name: "limit", kind: "int", value: 200 }]));
  });

  it("inserts and updates only registry columns, stamping who and when", () => {
    const values = { name: "TIGER", brand_group: "OTHER" };
    const insert = buildInsert(brands, values, "2");
    expect(insert.text).toBe("INSERT INTO dbo.brands (name, brand_group, created_by, updated_by) OUTPUT inserted.id VALUES (@f_name, @f_brand_group, @by, @by)");
    expect(insert.params).toEqual([
      { name: "f_name", kind: "nvarchar", value: "TIGER" },
      { name: "f_brand_group", kind: "nvarchar", value: "OTHER" },
      { name: "by", kind: "bigint", value: "2" },
    ]);
    const update = buildUpdate(brands, 7, values, null);
    expect(update.text).toBe("UPDATE dbo.brands SET name = @f_name, brand_group = @f_brand_group, updated_at = SYSUTCDATETIME(), updated_by = @by WHERE id = @id");
    expect(update.params.slice(-2)).toEqual([{ name: "id", kind: "int", value: 7 }, { name: "by", kind: "bigint", value: null }]);
  });

  it("disables instead of deleting", () => {
    const query = buildSetActive(brands, 7, false, "2");
    expect(query.text).toContain("SET is_active = @active, updated_at = SYSUTCDATETIME(), updated_by = @by");
    expect(query.text).not.toMatch(/DELETE/i);
  });
});
