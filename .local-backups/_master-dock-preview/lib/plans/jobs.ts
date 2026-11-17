import "server-only";
import type { Role, SessionUser } from "@/lib/auth/types";
import { resolveActorId } from "@/lib/db/actor";
import { dbConfigured } from "@/lib/db/config";
import { OPEN_WORK_ORDER_STATUSES } from "./rules";
import { getPlanStore } from "./runtime";
import type { JobCard } from "./store";

/**
 * "งานของฉัน" for `GET /api/jobs` (FR-JOB-03/04, docs/16 §5). The browser side (components/jobs) imports
 * only the types from this file, never a value — it reaches the database.
 */

export type JobsViewName = "all" | "mine";

/** QC Head sees everyone's work orders unless they ask for their own (W6); anyone else only ever gets their own. */
export function jobsView(roles: readonly Role[], requested: string | string[] | null | undefined): JobsViewName {
  return roles.includes("QC_HEAD") && requested !== "mine" ? "all" : "mine";
}

/** A work order as the jobs screen draws it. Only what is drawn leaves the server (no remarks, plan number or employee codes). */
export type JobItem = Pick<
  JobCard,
  "id" | "planId" | "woNo" | "type" | "calledQty" | "calledDate" | "qtyNeed" | "qtyDone" | "status" | "modelCode" | "description" | "docType" | "docNo" | "vendorName"
> & { assignees: { userId: string; name: string }[] };

/** `me` is the person's `users.id` (null when they have no row yet); without a database it is the session id. */
export type JobsPayload = { view: JobsViewName; me: string | null; jobs: JobItem[] };

const toJobItem = (job: JobCard): JobItem => ({
  id: job.id,
  planId: job.planId,
  woNo: job.woNo,
  type: job.type,
  calledQty: job.calledQty,
  calledDate: job.calledDate,
  qtyNeed: job.qtyNeed,
  qtyDone: job.qtyDone,
  status: job.status,
  modelCode: job.modelCode,
  description: job.description,
  docType: job.docType,
  docNo: job.docNo,
  vendorName: job.vendorName,
  assignees: job.assignees.map(({ userId, name }) => ({ userId, name })),
});

/**
 * Work orders that are still in someone's hands first, then the recent finished ones. Work orders show up as
 * soon as a QC Head picks the person — no accept button (J4). Throws the database's own errors; the route turns them into a 503.
 */
export async function loadJobs(user: SessionUser, requested: string | null): Promise<JobsPayload> {
  const view = jobsView(user.roles, requested);
  const all = view === "all";
  const me = dbConfigured() ? await resolveActorId(user.id) : user.id;

  let jobs: JobCard[] = [];
  if (all || me) {
    const store = getPlanStore();
    const actorId = all ? null : me;
    // Every active notification must have a card to open, even beyond the history's 200-row limit.
    const [active, recent] = await Promise.all([store.jobs(actorId, { activeOnly: true }), store.jobs(actorId)]);
    jobs = [...active, ...recent.filter((job) => !OPEN_WORK_ORDER_STATUSES.includes(job.status))];
  }
  return { view, me, jobs: jobs.map(toJobItem) };
}
