import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ dbConfigured: vi.fn(), masterCounts: vi.fn(), poolDb: vi.fn() }));
vi.mock("@/lib/db/config", () => ({ dbConfigured: mocks.dbConfigured }));
vi.mock("@/lib/master/repo", () => ({ poolDb: mocks.poolDb, masterCounts: mocks.masterCounts }));

import { loadMasterCounts } from "@/lib/master/counts";
import { MASTERS, type MasterDef } from "@/lib/master/registry";

const db = { name: "pool" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.dbConfigured.mockReturnValue(true);
  mocks.poolDb.mockReturnValue(db);
  mocks.masterCounts.mockImplementation(async (_db: unknown, def: MasterDef) => ({ total: def.slug.length, active: def.slug.length - 1 }));
});

describe("loadMasterCounts", () => {
  it("says there is no database, and touches none, when DB_SERVER is not set (demo mode)", async () => {
    mocks.dbConfigured.mockReturnValue(false);
    expect(await loadMasterCounts()).toEqual({ kind: "no_database" });
    expect(mocks.poolDb).not.toHaveBeenCalled();
    expect(mocks.masterCounts).not.toHaveBeenCalled();
  });

  it("counts every table of the registry, keyed by slug", async () => {
    const result = await loadMasterCounts();
    if (result.kind !== "counted") throw new Error("expected counts");
    expect(Object.keys(result.payload.counts)).toEqual(MASTERS.map((def) => def.slug));
    for (const def of MASTERS) expect(result.payload.counts[def.slug]).toEqual({ total: def.slug.length, active: def.slug.length - 1 });
  });

  it("asks the same connection about each table once", async () => {
    await loadMasterCounts();
    expect(mocks.poolDb).toHaveBeenCalledTimes(1);
    expect(mocks.masterCounts).toHaveBeenCalledTimes(MASTERS.length);
    for (const [usedDb, def] of mocks.masterCounts.mock.calls) {
      expect(usedDb).toBe(db);
      expect(MASTERS).toContain(def);
    }
  });

  it("lets a database error through for the route to answer", async () => {
    const outage = new Error("down");
    mocks.masterCounts.mockRejectedValueOnce(outage);
    await expect(loadMasterCounts()).rejects.toBe(outage);
  });
});
