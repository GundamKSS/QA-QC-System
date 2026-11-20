import "server-only";
import type { Role, SessionUser } from "@/lib/auth/types";
import { resolveActorId } from "@/lib/db/actor";
import { dbConfigured } from "@/lib/db/config";
import { historyToday, parseHistoryQuery, type HistoryQuery } from "./history-query";
import { getPlanStore } from "./runtime";
import type { JobCard } from "./store";

/**
 * ประวัติ (docs/18) for `GET /api/history`: work orders that are no longer in anyone's hands (sent, closed,
 * cancelled). The browser side (components/history) imports only the types from this file, never a value —
 * it reaches the database.
 */

/** QC Head, QA Head and Super Admin see everyone's and can narrow to their own ("ของฉัน"), and can open the plan behind a work order. Everyone else sees their own only. */
export const isHistoryHead = (roles: readonly Role[]) =>
  roles.includes("QC_HEAD") || roles.includes("QA_HEAD") || roles.includes("ADMIN");

/** A work order as the history screen draws it. Only what is drawn leaves the server (no remarks, plan number or employee codes). */
export type HistoryItem = Pick<
  JobCard,
  "id" | "planId" | "woNo" | "type" | "calledQty" | "calledDate" | "qtyNeed" | "qtyDone" | "status" | "cancelReason" | "modelCode" | "docType" | "docNo" | "vendorName"
> & { assignees: { userId: string; name: string }[] };

/**
 * `view` says whose work orders `rows` are. `me` is the person's `users.id`, looked up only for "mine" (null for
 * "all", or when they have no row yet — then `rows` is empty). `page` is the page `rows` belong to.
 */
export type HistoryPayload = { view: "all" | "mine"; me: string | null; page: number; total: number; rows: HistoryItem[] };

const toHistoryItem = (job: JobCard): HistoryItem => ({
  id: job.id,
  planId: job.planId,
  woNo: job.woNo,
  type: job.type,
  calledQty: job.calledQty,
  calledDate: job.calledDate,
  qtyNeed: job.qtyNeed,
  qtyDone: job.qtyDone,
  status: job.status,
  cancelReason: job.cancelReason,
  modelCode: job.modelCode,
  docType: job.docType,
  docNo: job.docNo,
  vendorName: job.vendorName,
  assignees: job.assignees.map(({ userId, name }) => ({ userId, name })),
});

/** One page of the history for `query` (unknown values fall back to the defaults). Throws the database's own errors; the route turns them into a 503. */
export async function loadHistory(user: SessionUser, query: HistoryQuery): Promise<HistoryPayload> {
  const { values, filter } = parseHistoryQuery(query, historyToday());
  const everyone = isHistoryHead(user.roles) && !values.mine;
  const me = everyone ? null : dbConfigured() ? await resolveActorId(user.id) : user.id;
  const found = everyone || me ? await getPlanStore().jobHistory({ ...filter, userId: everyone ? null : me }) : { rows: [], total: 0 };
  return { view: everyone ? "all" : "mine", me, page: values.page, total: found.total, rows: found.rows.map(toHistoryItem) };
}
