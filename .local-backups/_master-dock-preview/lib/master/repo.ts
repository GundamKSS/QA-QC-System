import "server-only";
import { sql, getPool } from "@/lib/db/pool";
import type { MasterValue, MasterValues } from "./form";
import type { MasterDef } from "./registry";
import { buildCount, buildCounts, buildGet, buildInsert, buildList, buildOptions, buildSetActive, buildUpdate, type ListOptions, type Param, type Query } from "./sql";

type Record_ = Record<string, unknown>;

/** Runs one built query. The pool in the app; a transaction in the DB test (always rolled back). */
export type Db = { run(query: Query): Promise<Record_[]> };

function bind(request: InstanceType<typeof sql.Request>, params: Param[]) {
  for (const param of params) {
    const type = param.kind === "nvarchar" ? sql.NVarChar(4000) : param.kind === "int" ? sql.Int : param.kind === "bigint" ? sql.BigInt : sql.Bit;
    request.input(param.name, type, param.value);
  }
  return request;
}

export function poolDb(): Db {
  return {
    async run(query) {
      const pool = await getPool();
      return (await bind(pool.request(), query.params).query<Record_>(query.text)).recordset ?? [];
    },
  };
}

export function transactionDb(tx: InstanceType<typeof sql.Transaction>): Db {
  return { run: async (query) => (await bind(new sql.Request(tx), query.params).query<Record_>(query.text)).recordset ?? [] };
}

export type MasterRow = {
  id: number;
  values: MasterValues;
  /** Display labels of reference fields (e.g. brand name for brand_id). */
  labels: Record<string, string | null>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
};

const who = (name: unknown, code: unknown) => (typeof name === "string" && name ? name : typeof code === "string" && code ? code : null);

function toRow(def: MasterDef, record: Record_): MasterRow {
  const values: MasterValues = {};
  const labels: Record<string, string | null> = {};
  for (const field of def.fields) {
    const raw = record[field.key];
    values[field.key] = field.kind === "bool" ? Boolean(raw) : (raw as MasterValue) ?? null;
    if (field.kind === "ref") labels[field.key] = (record[`${field.key}__label`] as string | null) ?? null;
  }
  return {
    id: Number(record.id),
    values,
    labels,
    isActive: Boolean(record.is_active),
    createdAt: record.created_at as Date,
    updatedAt: record.updated_at as Date,
    createdBy: who(record.created_by_name, record.created_by_code),
    updatedBy: who(record.updated_by_name, record.updated_by_code),
  };
}

export async function listMaster(db: Db, def: MasterDef, options: ListOptions = {}) {
  // Sequential on purpose: a transaction (DB test) can't run two requests at once.
  const rows = await db.run(buildList(def, options));
  const count = await db.run(buildCount(def, options));
  return { rows: rows.map((record) => toRow(def, record)), total: Number(count[0]?.total ?? 0) };
}

export async function getMaster(db: Db, def: MasterDef, id: number): Promise<MasterRow | null> {
  const [record] = await db.run(buildGet(def, id));
  return record ? toRow(def, record) : null;
}

export async function createMaster(db: Db, def: MasterDef, values: MasterValues, by: string | null): Promise<number> {
  const [record] = await db.run(buildInsert(def, values, by));
  return Number(record.id);
}

export async function updateMaster(db: Db, def: MasterDef, id: number, values: MasterValues, by: string | null) {
  await db.run(buildUpdate(def, id, values, by));
}

export async function setMasterActive(db: Db, def: MasterDef, id: number, active: boolean, by: string | null) {
  await db.run(buildSetActive(def, id, active, by));
}

export type RefOption = { value: number; label: string; isActive: boolean };

export async function refOptions(db: Db, table: string, labelColumn: string): Promise<RefOption[]> {
  return (await db.run(buildOptions(table, labelColumn))).map((record) => ({ value: Number(record.id), label: String(record.label), isActive: Boolean(record.is_active) }));
}

export async function masterCounts(db: Db, def: MasterDef) {
  const [record] = await db.run(buildCounts(def));
  return { total: Number(record?.total ?? 0), active: Number(record?.active ?? 0) };
}

/** SQL Server error numbers the forms explain in words instead of a crash. */
export function masterWriteProblem(error: unknown): "duplicate" | "invalid" | null {
  for (let current: unknown = error, depth = 0; current && depth < 5; depth++) {
    const { number, originalError, cause } = current as { number?: unknown; originalError?: unknown; cause?: unknown };
    if (number === 2627 || number === 2601) return "duplicate";
    if (number === 547) return "invalid";
    current = originalError ?? cause;
  }
  return null;
}
