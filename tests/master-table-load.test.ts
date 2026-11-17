import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ dbConfigured: vi.fn(), poolDb: vi.fn(), listMaster: vi.fn(), getMaster: vi.fn(), refOptions: vi.fn() }));
vi.mock("@/lib/db/config", () => ({ dbConfigured: mocks.dbConfigured }));
vi.mock("@/lib/master/repo", () => ({ poolDb: mocks.poolDb, listMaster: mocks.listMaster, getMaster: mocks.getMaster, refOptions: mocks.refOptions }));

import { masterBySlug } from "@/lib/master/registry";
import { loadMasterTable } from "@/lib/master/table";
import type { MasterTableValues } from "@/lib/master/table-query";

const values: MasterTableValues = { q: "", status: "all", page: 1, editId: null, creating: false, saved: null };
const row = (id: number) => ({
  id, values: { name: `ยี่ห้อ ${id}` }, labels: {}, isActive: true,
  createdAt: new Date("2026-10-01T01:00:00Z"), updatedAt: new Date("2026-10-02T02:00:00Z"), createdBy: "ผู้ดูแล", updatedBy: null,
});
// `models` points at brands and pump types, so a form for it needs options.
const withRef = masterBySlug("models")!;
const brands = masterBySlug("brands")!;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.dbConfigured.mockReturnValue(true);
  mocks.poolDb.mockReturnValue("db");
  mocks.listMaster.mockResolvedValue({ rows: [row(1), row(2)], total: 2 });
  mocks.getMaster.mockResolvedValue(row(2));
  mocks.refOptions.mockResolvedValue([{ value: 1, label: "A", isActive: true }]);
});

describe("loadMasterTable", () => {
  it("touches nothing without a database (the demo mode)", async () => {
    mocks.dbConfigured.mockReturnValue(false);
    expect(await loadMasterTable(brands, true, values)).toEqual({ kind: "no_database" });
    expect(mocks.poolDb).not.toHaveBeenCalled();
    expect(mocks.listMaster).not.toHaveBeenCalled();
  });

  it("asks for the filtered page of 50 and echoes what it answered", async () => {
    const result = await loadMasterTable(brands, false, { ...values, q: "ก", status: "active", page: 3 });
    expect(mocks.listMaster).toHaveBeenCalledWith("db", brands, { q: "ก", status: "active", page: 3, pageSize: 50 });
    expect(result).toMatchObject({ kind: "loaded", payload: { total: 2, page: 3, pageSize: 50, editing: null, options: null } });
  });

  it("sends dates as ISO strings and the rest of the row as it is", async () => {
    const result = await loadMasterTable(brands, false, values);
    if (result.kind !== "loaded") throw new Error("unreachable");
    expect(result.payload.rows[0]).toEqual({ id: 1, values: { name: "ยี่ห้อ 1" }, labels: {}, isActive: true, createdAt: "2026-10-01T01:00:00.000Z", updatedAt: "2026-10-02T02:00:00.000Z", createdBy: "ผู้ดูแล", updatedBy: null });
    expect(() => JSON.stringify(result.payload)).not.toThrow();
  });

  it("gives someone who may not edit no edit row and no options, and doesn't read them", async () => {
    const result = await loadMasterTable(withRef, false, { ...values, editId: 2, creating: true });
    expect(result).toMatchObject({ payload: { editing: null, options: null } });
    expect(mocks.getMaster).not.toHaveBeenCalled();
    expect(mocks.refOptions).not.toHaveBeenCalled();
  });

  it("reads the options for the create form", async () => {
    const result = await loadMasterTable(withRef, true, { ...values, creating: true });
    const refs = withRef.fields.filter((field) => field.kind === "ref");
    expect(mocks.refOptions).toHaveBeenCalledTimes(refs.length);
    if (result.kind !== "loaded") throw new Error("unreachable");
    expect(Object.keys(result.payload.options!)).toEqual(refs.map((field) => field.key));
    expect(result.payload.editing).toBeNull();
    expect(mocks.getMaster).not.toHaveBeenCalled();
  });

  it("reads the row of ?edit= and the options for the edit form", async () => {
    const result = await loadMasterTable(withRef, true, { ...values, editId: 2 });
    expect(mocks.getMaster).toHaveBeenCalledWith("db", withRef, 2);
    expect(result).toMatchObject({ payload: { editing: { id: 2, createdAt: "2026-10-01T01:00:00.000Z" } } });
    expect(mocks.refOptions).toHaveBeenCalled();
  });

  it("answers no editing row and no options when ?edit= names a row that doesn't exist", async () => {
    mocks.getMaster.mockResolvedValue(null);
    const result = await loadMasterTable(withRef, true, { ...values, editId: 99 });
    expect(result).toMatchObject({ payload: { editing: null, options: null } });
    expect(mocks.refOptions).not.toHaveBeenCalled();
  });

  it("reads no options when no form is open", async () => {
    await loadMasterTable(withRef, true, values);
    expect(mocks.refOptions).not.toHaveBeenCalled();
    expect(mocks.getMaster).not.toHaveBeenCalled();
  });

  it("answers an empty options object for a table with no reference fields while a form is open", async () => {
    expect(brands.fields.some((field) => field.kind === "ref")).toBe(false);
    const result = await loadMasterTable(brands, true, { ...values, creating: true });
    expect(result).toMatchObject({ payload: { options: {} } });
  });

  it("lets a database failure through for the route to answer as 503", async () => {
    mocks.listMaster.mockRejectedValue(new Error("down"));
    await expect(loadMasterTable(brands, true, values)).rejects.toThrow("down");
  });
});
