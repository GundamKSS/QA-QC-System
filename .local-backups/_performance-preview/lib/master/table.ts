import "server-only";
import { dbConfigured } from "@/lib/db/config";
import type { MasterDef } from "./registry";
import { getMaster, listMaster, poolDb, refOptions, type MasterRow, type RefOption } from "./repo";
import { MASTER_PAGE_SIZE, type MasterTableValues } from "./table-query";

/**
 * One master table's list for `GET /api/master/<table>` (FR-MD-01…09): a page of rows and, for the one who may
 * edit, the row being edited and the options of the reference fields. The browser side (components/master)
 * imports only the types from this file, never a value — it reaches the database.
 */

/** A row as the screen draws it; dates are ISO 8601 because JSON has no `Date`. */
export type MasterRowItem = Omit<MasterRow, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };

/** Per reference field (by its key): the rows it can point at. */
export type MasterFieldOptions = Record<string, RefOption[]>;

export type MasterTablePayload = {
  rows: MasterRowItem[];
  total: number;
  page: number;
  pageSize: number;
  /** The row of `?edit=` — only for whoever may edit, and null when there is no such row. */
  editing: MasterRowItem | null;
  /** Filled only when a form is open (`?new=1` or an existing `?edit=`) and the person may edit; otherwise null. */
  options: MasterFieldOptions | null;
};

export type MasterTableResult = { kind: "loaded"; payload: MasterTablePayload } | { kind: "no_database" };

const toItem = (row: MasterRow): MasterRowItem => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });

/** Throws the database's own errors; the route turns them into a 503. Master data lives in SQL Server only, so the demo mode answers `no_database`. */
export async function loadMasterTable(def: MasterDef, canEdit: boolean, values: MasterTableValues): Promise<MasterTableResult> {
  if (!dbConfigured()) return { kind: "no_database" };
  const db = poolDb();
  const list = await listMaster(db, def, { q: values.q, status: values.status, page: values.page, pageSize: MASTER_PAGE_SIZE });
  const editing = canEdit && values.editId !== null ? await getMaster(db, def, values.editId) : null;
  let options: MasterFieldOptions | null = null;
  if (canEdit && (values.creating || editing)) {
    options = {};
    for (const field of def.fields) if (field.kind === "ref") options[field.key] = await refOptions(db, field.ref.table, field.ref.labelColumn);
  }
  return { kind: "loaded", payload: { rows: list.rows.map(toItem), total: list.total, page: values.page, pageSize: MASTER_PAGE_SIZE, editing: editing ? toItem(editing) : null, options } };
}
