import "server-only";
import { dbConfigured } from "@/lib/db/config";
import { MASTERS } from "./registry";
import { masterCounts, poolDb } from "./repo";

/**
 * How many rows each master table has, for the cards of `/master` (`GET /api/master`). The browser side
 * (components/master) imports only the types from this file, never a value — it reaches the database.
 */

/** `active` are the rows still in use; `total` also counts the ones switched off (master rows are never deleted). */
export type MasterCount = { total: number; active: number };

/** Keyed by the table's slug (`/master/<slug>`), so a table added to the registry needs no change on the screen. */
export type MasterCountsPayload = { counts: Record<string, MasterCount> };

export type MasterCountsResult = { kind: "counted"; payload: MasterCountsPayload } | { kind: "no_database" };

/** Master data lives in SQL Server only; the demo mode has none. */
export const MASTER_NO_DATABASE = "ยังไม่ได้ตั้งค่าฐานข้อมูล (DB_SERVER) — ข้อมูลหลักต้องใช้ SQL Server";

/** Counts every table of the registry. Throws the database's own errors; the route turns them into a 503. */
export async function loadMasterCounts(): Promise<MasterCountsResult> {
  if (!dbConfigured()) return { kind: "no_database" };
  const db = poolDb();
  const counted = await Promise.all(MASTERS.map((def) => masterCounts(db, def)));
  return { kind: "counted", payload: { counts: Object.fromEntries(MASTERS.map((def, index) => [def.slug, counted[index]])) } };
}
