import "server-only";
import type { Role, SessionUser } from "@/lib/auth/types";
import { resolveActorId } from "@/lib/db/actor";
import { dbConfigured } from "@/lib/db/config";
import { getInspectionStore } from "@/lib/inspections/runtime";
import type { InspectionDraft, InspectorProgress, PendingReworkItem } from "@/lib/inspections/types";
import { OPEN_WORK_ORDER_STATUSES } from "./rules";
import { getPlanStore } from "./runtime";
import type { JobCard } from "./store";

/**
 * "งานของฉัน" for `GET /api/jobs` (FR-JOB-03/04, docs/16 §5). The browser side (components/jobs) imports
 * only the types from this file, never a value — it reaches the database.
 */

export type JobsViewName = "all" | "mine";

/** QC Head / QA Head / Super Admin sees everyone's work orders unless they ask for their own (W6); anyone else only ever gets their own. */
export function jobsView(
  roles: readonly Role[],
  requested: string | string[] | null | undefined,
  side?: "QC" | "QA",
): JobsViewName {
  if (side === "QA") {
    return (roles.includes("QA_HEAD") || roles.includes("ADMIN")) && requested !== "mine" ? "all" : "mine";
  }
  return (roles.includes("QC_HEAD") || roles.includes("ADMIN")) && requested !== "mine" ? "all" : "mine";
}

/** A work order as the jobs screen draws it. Only what is drawn leaves the server (no remarks, plan number or employee codes). */
export type JobAssignee = {
  userId: string;
  name: string;
  targetQty?: number | null;
  doneQty?: number;
  passedQty?: number;
  reworkPending?: number;
  rejectedQty?: number;
  /** Only on the signed-in person's own row: machines they opened but have not submitted — "ตรวจต่อ" goes straight back to them. */
  drafts?: InspectionDraft[];
};

export type JobItem = Pick<
  JobCard,
  "id" | "planId" | "woNo" | "type" | "calledQty" | "calledDate" | "qtyNeed" | "qtyDone" | "status" | "modelCode" | "description" | "docType" | "docNo" | "vendorName"
> & { assignees: JobAssignee[]; reworkCount: number };

/** `me` is the person's `users.id` (null when they have no row yet); without a database it is the session id. */
export type JobsPayload = { view: JobsViewName; me: string | null; jobs: JobItem[]; reworks: PendingReworkItem[] };

const toJobItem = (job: JobCard, reworkCount = 0, progress?: Map<string, InspectorProgress>, me?: string | null): JobItem => ({
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
  assignees: job.assignees.map(({ userId, name, targetQty }) => {
    const p = progress?.get(`${job.id}:${String(userId)}`);
    return {
      userId,
      name,
      targetQty,
      ...(progress ? { doneQty: p?.done ?? 0, passedQty: p?.passed ?? 0, reworkPending: p?.reworkPending ?? 0, rejectedQty: p?.rejected ?? 0 } : {}),
      ...(me && String(userId) === String(me) && p?.drafts?.length ? { drafts: p.drafts } : {}),
    };
  }),
  reworkCount,
});

/**
 * Work orders that are still in someone's hands first, then the recent finished ones. Work orders show up as
 * soon as a QC Head picks the person — no accept button (J4). Throws the database's own errors; the route turns them into a 503.
 */
export async function loadJobs(
  user: SessionUser,
  requested: string | null,
  side?: "QC" | "QA",
): Promise<JobsPayload> {
  const view = jobsView(user.roles, requested, side);
  const all = view === "all";
  const me = dbConfigured() ? await resolveActorId(user.id) : user.id;

  let jobs: JobCard[] = [];
  let reworks: PendingReworkItem[] = [];
  let progress: Map<string, InspectorProgress> | undefined;

  if (all || me) {
    const store = getPlanStore();
    const actorId = all ? null : me;
    // Every active notification must have a card to open, even beyond the history's 200-row limit.
    const [active, recent] = await Promise.all([
      store.jobs(actorId, side ? { activeOnly: true, side } : { activeOnly: true }),
      side ? store.jobs(actorId, { side }) : store.jobs(actorId),
    ]);
    jobs = [...active, ...recent.filter((job) => !OPEN_WORK_ORDER_STATUSES.includes(job.status))];

    try {
      const inspectionStore = getInspectionStore();
      const [reworkItems, inspectorProgress] = await Promise.all([
        inspectionStore.getPendingReworks(actorId),
        inspectionStore.getInspectorProgress
          ? inspectionStore.getInspectorProgress(jobs.map((j) => j.id))
          : Promise.resolve(undefined),
      ]);
      if (side) {
        const jobIds = new Set(jobs.map((j) => j.id));
        reworks = reworkItems.filter((rw) => jobIds.has(rw.workOrderId) || rw.role === side);
      } else {
        reworks = reworkItems;
      }
      progress = inspectorProgress;
    } catch {
      reworks = [];
    }
  }

  const reworkCounts = new Map<string, number>();
  for (const rw of reworks) {
    reworkCounts.set(rw.workOrderId, (reworkCounts.get(rw.workOrderId) ?? 0) + 1);
  }

  return { view, me, jobs: jobs.map((job) => toJobItem(job, reworkCounts.get(job.id) ?? 0, progress, me)), reworks };
}
