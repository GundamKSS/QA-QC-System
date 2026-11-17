import type { JobAssignee, JobItem } from "@/lib/plans/jobs";

/**
 * Checks whether this work order is already completed for the specific user.
 * Returns true if:
 * 1. The work order is completely filled across all inspectors (qtyDone >= qtyNeed), OR
 * 2. The inspector has an individual targetQty and has inspected >= targetQty with 0 pending rework.
 */
export function isJobCompletedForUser(
  job: Pick<JobItem, "qtyNeed" | "qtyDone"> & { assignees?: readonly JobAssignee[] },
  userId: string | null,
): boolean {
  if (job.qtyNeed > 0 && job.qtyDone >= job.qtyNeed) {
    return true;
  }
  if (!userId || !job.assignees) {
    return false;
  }
  const person = job.assignees.find((p) => p.userId === userId);
  if (!person) {
    return false;
  }
  const target = person.targetQty ?? null;
  const done = person.doneQty ?? 0;
  const rework = person.reworkPending ?? 0;
  return target != null && done >= target && rework === 0;
}
