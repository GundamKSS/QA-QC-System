/**
 * Integration check against the real SQL Server — OFF by default. Every case runs inside a
 * transaction that is always rolled back, so nothing is persisted (identity counters may skip).
 *   QCHECK_DB_TESTS=on node --env-file=.env.local node_modules/.bin/vitest run src/lib/master/master.db.test.ts
 */
import sql from "mssql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbConfigFromEnv } from "@/lib/db/config";
import { defaultValues, type MasterValues } from "./form";
import { MASTERS, type MasterDef } from "./registry";
import { createMaster, getMaster, listMaster, masterCounts, refOptions, setMasterActive, transactionDb, updateMaster, type Db } from "./repo";

const enabled = process.env.QCHECK_DB_TESTS === "on";

describe.skipIf(!enabled)("master repo on the real database (rolled back)", () => {
  let pool: sql.ConnectionPool;
  beforeAll(async () => {
    pool = await new sql.ConnectionPool(dbConfigFromEnv()).connect();
  });
  afterAll(async () => {
    await pool?.close();
  });

  async function inTransaction(run: (db: Db) => Promise<void>) {
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await run(transactionDb(tx));
    } finally {
      await tx.rollback();
    }
  }

  /** Valid values for any master, creating referenced rows first (inside the same transaction). */
  async function sample(db: Db, def: MasterDef, tag: string): Promise<MasterValues> {
    const values = defaultValues(def);
    for (const field of def.fields) {
      if (field.kind === "text") values[field.key] = `T${tag}-${field.key}`.slice(0, field.max);
      if (field.kind === "ref") {
        const target = MASTERS.find((m) => m.table === field.ref.table)!;
        values[field.key] = await createMaster(db, target, await sample(db, target, `${tag}r`), null);
      }
    }
    return values;
  }

  it.each(MASTERS.map((def) => [def.slug, def] as const))("%s: create, read, list, update, disable", async (_slug, def) => {
    await inTransaction(async (db) => {
      const before = await masterCounts(db, def);
      const values = await sample(db, def, "x");
      const id = await createMaster(db, def, values, null);
      const row = await getMaster(db, def, id);
      expect(row).toMatchObject({ id, isActive: true, values });
      for (const field of def.fields) if (field.kind === "ref") expect(row!.labels[field.key]).toBeTruthy();

      const listed = await listMaster(db, def, { q: String(values[def.fields.find((f) => f.kind === "text")!.key]), status: "active" });
      expect(listed.rows.map((r) => r.id)).toContain(id);

      const changed = { ...values, [def.fields[0].key]: def.fields[0].kind === "text" ? `U${String(values[def.fields[0].key])}`.slice(0, def.fields[0].max) : values[def.fields[0].key] };
      await updateMaster(db, def, id, changed, null);
      expect((await getMaster(db, def, id))?.values).toEqual(changed);

      await setMasterActive(db, def, id, false, null);
      expect((await getMaster(db, def, id))?.isActive).toBe(false);
      expect((await listMaster(db, def, { status: "inactive" })).rows.map((r) => r.id)).toContain(id);
      expect((await masterCounts(db, def)).total).toBeGreaterThan(before.total);
    });
  });

  it("rejects a duplicate unique value", async () => {
    const brands = MASTERS.find((m) => m.table === "brands")!;
    await inTransaction(async (db) => {
      await createMaster(db, brands, { name: "TDUP", brand_group: "OTHER" }, null);
      await expect(createMaster(db, brands, { name: "tdup", brand_group: "OTHER" }, null)).rejects.toMatchObject({ number: 2627 });
    });
  });

  it("loads reference options", async () => {
    await inTransaction(async (db) => {
      const brands = MASTERS.find((m) => m.table === "brands")!;
      await createMaster(db, brands, { name: "TOPT", brand_group: "PUMA" }, null);
      expect((await refOptions(db, "brands", "name")).some((o) => o.label === "TOPT")).toBe(true);
    });
  });
});
