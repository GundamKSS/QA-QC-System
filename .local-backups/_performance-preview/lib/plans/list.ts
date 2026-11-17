import "server-only";
import { parsePlanListQuery, type PlanListQuery } from "./list-query";
import { thaiToday } from "./rules";
import { getPlanStore } from "./runtime";
import type { PlanFilterOptions, PlanListRow } from "./store";

/**
 * รายการแผนตรวจ (docs/15 §2) for `GET /api/plans`. The browser side (components/plans) imports only the types
 * from this file, never a value — it reaches the database.
 */

/** A row of the list as the screen draws it. JSON has no Date, so `openedAt` travels as an ISO instant. */
export type PlanListItem = Omit<PlanListRow, "openedAt"> & { openedAt: string };

/**
 * One page of the list. `page` is the page `rows` belong to, `total` counts every match, `options` fill the
 * Vendor and pump-type filters, and `today` (the Thai date) is what the 90-day countdowns count from.
 */
export type PlanListPayload = { rows: PlanListItem[]; total: number; page: number; options: PlanFilterOptions; today: string };

export const toListItem = (row: PlanListRow): PlanListItem => ({
  id: row.id,
  planNo: row.planNo,
  status: row.status,
  docType: row.docType,
  docNo: row.docNo,
  vendorName: row.vendorName,
  modelCode: row.modelCode,
  pumpType: row.pumpType,
  lotQty: row.lotQty,
  qcDoneTotal: row.qcDoneTotal,
  qcRequired: row.qcRequired,
  qcDeadline: row.qcDeadline,
  waitingGoods: row.waitingGoods,
  openedAt: row.openedAt.toISOString(),
});

/** One page of plans for `query` (unknown or malformed values fall back to "no filter"). Throws the database's own errors; the route turns them into a 503. */
export async function loadPlanList(query: PlanListQuery): Promise<PlanListPayload> {
  const { filter } = parsePlanListQuery(query);
  const store = getPlanStore();
  const [found, options] = await Promise.all([store.listPlans(filter), store.planFilterOptions()]);
  return { rows: found.rows.map(toListItem), total: found.total, page: filter.page, options, today: thaiToday(new Date()) };
}
