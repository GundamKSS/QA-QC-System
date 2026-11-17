import "server-only";
import { canAccessPage } from "@/lib/auth/page-access";
import type { SessionUser } from "@/lib/auth/types";
import { resolveActorId } from "@/lib/db/actor";
import { dbConfigured } from "@/lib/db/config";
import { getPlanStore } from "@/lib/plans/runtime";
import type { PlanStore } from "@/lib/plans/store";
import type { NotificationSnapshot } from "./types";
import { workNotifications } from "./work";

type NotificationDependencies = {
  store: Pick<PlanStore, "jobs">;
  resolveUserId: (sessionId: string) => Promise<string | null>;
};

/** The caller supplies the verified session user; identity is never accepted from a request parameter. */
export async function getWorkNotifications(user: SessionUser, dependencies?: NotificationDependencies): Promise<NotificationSnapshot> {
  const empty = { userId: user.id, items: [], total: 0 };
  // Alerts are available to everyone; only people allowed to open /jobs have work-order alerts.
  if (user.mustChangePassword || !canAccessPage(user.roles, "jobs")) return empty;

  const resolveUserId = dependencies?.resolveUserId ?? (async (id: string) => dbConfigured() ? resolveActorId(id) : id);
  const actorId = await resolveUserId(user.id);
  // Never pass null to jobs(): null deliberately means everyone's work for the QC Head page.
  if (!actorId) return empty;

  const store = dependencies?.store ?? getPlanStore();
  const jobs = await store.jobs(actorId, { activeOnly: true });
  const items = workNotifications(jobs.filter((job) => job.assignees.some((person) => person.userId === actorId)));
  return { userId: user.id, items, total: items.length };
}
