import type { MasterDef, MasterField } from "./registry";
import { isEditable, isSearchable } from "./registry";
import type { MasterValues } from "./form";

/** A query parameter described without importing the driver, so the builders stay pure and testable. */
export type Param = { name: string; kind: "nvarchar" | "int" | "bigint" | "bit" | "decimal"; value: string | number | boolean | null };
export type Query = { text: string; params: Param[] };

export type ListOptions = { q?: string; status?: "all" | "active" | "inactive"; page?: number; pageSize?: number };

const paramKind = (field: MasterField): Param["kind"] =>
  field.kind === "bool"
    ? "bit"
    : field.kind === "number"
      ? (field.step && field.step < 1 ? "decimal" : "int")
      : field.kind === "ref"
        ? "int"
        : "nvarchar";

/** Aliases for the joined reference tables: r0, r1, … in field order. */
function refs(def: MasterDef) {
  return def.fields.filter((field): field is Extract<MasterField, { kind: "ref" }> => field.kind === "ref").map((field, index) => ({ field, alias: `r${index}` }));
}

const columns = (def: MasterDef) => def.fields.map((field) => `t.${field.key}`).join(", ");

function where(def: MasterDef, { q, status = "all" }: ListOptions, params: Param[]): string {
  const clauses: string[] = [];
  if (status === "active") clauses.push("t.is_active = 1");
  if (status === "inactive") clauses.push("t.is_active = 0");
  const term = (q ?? "").trim();
  const searchable = def.fields.filter(isSearchable);
  if (term && searchable.length > 0) {
    // Escape LIKE wildcards so a search for "50%" matches "50%", not everything.
    params.push({ name: "q", kind: "nvarchar", value: `%${term.replace(/[\\%_[]/g, (char) => `\\${char}`)}%` });
    clauses.push(`(${searchable.map((field) => `t.${field.key} LIKE @q ESCAPE '\\'`).join(" OR ")})`);
  }
  return clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
}

const FROM = (def: MasterDef) =>
  ` FROM dbo.${def.table} t LEFT JOIN dbo.users cu ON cu.id = t.created_by LEFT JOIN dbo.users uu ON uu.id = t.updated_by` +
  refs(def).map(({ field, alias }) => ` LEFT JOIN dbo.${field.ref.table} ${alias} ON ${alias}.id = t.${field.key}`).join("");

const SELECT = (def: MasterDef) =>
  `SELECT t.id, ${columns(def)}, t.is_active, t.created_at, t.updated_at, cu.employee_code AS created_by_code, cu.full_name AS created_by_name, uu.employee_code AS updated_by_code, uu.full_name AS updated_by_name` +
  refs(def).map(({ field, alias }) => `, ${alias}.${field.ref.labelColumn} AS ${field.key}__label`).join("");

export function buildList(def: MasterDef, options: ListOptions = {}): Query {
  const params: Param[] = [];
  const clause = where(def, options, params);
  const pageSize = Math.min(Math.max(options.pageSize ?? 50, 1), 200);
  const offset = (Math.max(options.page ?? 1, 1) - 1) * pageSize;
  params.push({ name: "offset", kind: "int", value: offset }, { name: "limit", kind: "int", value: pageSize });
  return { text: `${SELECT(def)}${FROM(def)}${clause} ORDER BY ${def.orderBy}, t.id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`, params };
}

export function buildCount(def: MasterDef, options: ListOptions = {}): Query {
  const params: Param[] = [];
  return { text: `SELECT COUNT(*) AS total FROM dbo.${def.table} t${where(def, options, params)}`, params };
}

export function buildGet(def: MasterDef, id: number): Query {
  return { text: `${SELECT(def)}${FROM(def)} WHERE t.id = @id`, params: [{ name: "id", kind: "int", value: id }] };
}

const editable = (def: MasterDef) => def.fields.filter(isEditable);

const fieldParams = (def: MasterDef, values: MasterValues): Param[] =>
  editable(def).map((field) => ({ name: `f_${field.key}`, kind: paramKind(field), value: values[field.key] ?? null }));

/** `by` is a users.id (or null when the actor has no row), see db/actor.ts. */
export function buildInsert(def: MasterDef, values: MasterValues, by: string | null): Query {
  const names = editable(def).map((field) => field.key);
  return {
    text: `INSERT INTO dbo.${def.table} (${names.join(", ")}, created_by, updated_by) OUTPUT inserted.id VALUES (${names.map((name) => `@f_${name}`).join(", ")}, @by, @by)`,
    params: [...fieldParams(def, values), { name: "by", kind: "bigint", value: by }],
  };
}

export function buildUpdate(def: MasterDef, id: number, values: MasterValues, by: string | null): Query {
  const sets = editable(def).map((field) => `${field.key} = @f_${field.key}`).join(", ");
  return {
    text: `UPDATE dbo.${def.table} SET ${sets}, updated_at = SYSUTCDATETIME(), updated_by = @by WHERE id = @id`,
    params: [...fieldParams(def, values), { name: "id", kind: "int", value: id }, { name: "by", kind: "bigint", value: by }],
  };
}

/** Disable instead of delete (FR-MD-13): rows are referenced by past inspections. */
export function buildSetActive(def: MasterDef, id: number, active: boolean, by: string | null): Query {
  return {
    text: `UPDATE dbo.${def.table} SET is_active = @active, updated_at = SYSUTCDATETIME(), updated_by = @by WHERE id = @id`,
    params: [{ name: "active", kind: "bit", value: active }, { name: "id", kind: "int", value: id }, { name: "by", kind: "bigint", value: by }],
  };
}

export function buildOptions(table: string, labelColumn: string, filter?: { column: string; value: string }): Query {
  if (filter) {
    return {
      text: `SELECT id, ${labelColumn} AS label, is_active FROM dbo.${table} WHERE ${filter.column} = @filterVal ORDER BY ${labelColumn}`,
      params: [{ name: "filterVal", kind: "nvarchar", value: filter.value }],
    };
  }
  return { text: `SELECT id, ${labelColumn} AS label, is_active FROM dbo.${table} ORDER BY ${labelColumn}`, params: [] };
}

export function buildCounts(def: MasterDef): Query {
  return { text: `SELECT COUNT(*) AS total, ISNULL(SUM(CAST(is_active AS INT)), 0) AS active FROM dbo.${def.table}`, params: [] };
}
