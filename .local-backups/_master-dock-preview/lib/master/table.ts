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
  if (!dbConfigured()) {
    const all: MasterRowItem[] = Array.from({length: 14}, (_, index) => ({
      id: index + 1, values: {name: `ผู้ผลิตตัวอย่าง ${(index + 1).toString().padStart(2, "0")}`, country: index % 2 ? "จีน" : "ไทย"},
      labels: {}, isActive: index % 3 !== 1, createdAt: "2026-10-20T02:00:00Z", updatedAt: "2026-10-26T02:00:00Z", createdBy: "ผู้ทดสอบ", updatedBy: "ผู้ทดสอบ",
    }));
    const rows = all.filter(row => (!values.q || String(row.values.name).includes(values.q)) && (values.status === "all" || row.isActive === (values.status === "active")));
    return {kind: "loaded", payload: {rows, total: values.q || values.status !== "all" ? rows.length : 85, page: values.page, pageSize: 50, editing: values.editId === null ? null : rows.find(row => row.id === values.editId) ?? null, options: canEdit && (values.creating || values.editId !== null) ? {} : null}};
  }
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
