import "server-only";
import { canAccessPage } from "@/lib/auth/page-access";
import type { Role, SessionUser } from "@/lib/auth/types";
import { HOME_DEADLINE_LIMIT, HOME_RECENT_LIMIT, parseHomeQuery, type HomeQuery } from "./home-query";
import { toListItem, type PlanListItem } from "./list";
import { PLAN_STATUSES, thaiToday } from "./rules";
import { getPlanStore } from "./runtime";
import type { PlanSummary } from "./store";

/**
 * The plan part of the home page for `GET /api/home`. The browser side (components/home) imports only the
 * types from this file, never a value — it reaches the database.
 */

/**
 * Who sees what on /home: plan viewers get the totals and the plan rows (the rows link to plan pages), the
 * dashboard roles get the totals only, and anyone else — an inspector, Master Admin — gets neither.
 */
export function homeAccess(roles: readonly Role[]) {
  const seesPlans = canAccessPage(roles, "plans");
  return { seesPlans, seesSummary: seesPlans || canAccessPage(roles, "dashboard") };
}

export type HomeDashboardPayload = {
  summary: PlanSummary;
  /** The plans opened most recently (cancelled ones left out) that match the search; null for roles that only see the totals. */
  recent: { rows: PlanListItem[]; total: number } | null;
  /** The live Invoice plans whose 90-day deadline is nearest (PO plans have none); null for roles that only see the totals. */
  deadlines: PlanListItem[] | null;
  /** The Thai date the totals and the countdowns count from. */
  today: string;
};

export type HomeDashboardResult = { kind: "loaded"; payload: HomeDashboardPayload } | { kind: "forbidden" };

const LIVE_STATUSES = PLAN_STATUSES.filter((status) => status !== "CANCELLED" && status !== "COMPLETED");

/** The dashboard for `user` and the search words in `query`. Throws the database's own errors; the route turns them into a 503. */
export async function loadHomeDashboard(user: SessionUser, query: HomeQuery): Promise<HomeDashboardResult> {
  const { seesPlans, seesSummary } = homeAccess(user.roles);
  if (!seesSummary) return { kind: "forbidden" };

  const q = parseHomeQuery(query);
  const today = thaiToday(new Date());
  const store = getPlanStore();
  const summary = await store.planSummary(today);
  if (!seesPlans) return { kind: "loaded", payload: { summary, recent: null, deadlines: null, today } };

  const [recent, byDeadline] = await Promise.all([
    store.listPlans({ q: q || undefined, sort: "opened", page: 1, pageSize: HOME_RECENT_LIMIT }),
    store.listPlans({ statuses: LIVE_STATUSES, sort: "deadline", page: 1, pageSize: HOME_DEADLINE_LIMIT }),
  ]);
  return {
    kind: "loaded",
    payload: {
      summary,
      recent: { rows: recent.rows.map(toListItem), total: recent.total },
      // Nearest 90-day deadlines first; PO plans (no deadline) sort last and are dropped.
      deadlines: byDeadline.rows.filter((row) => row.qcDeadline).map(toListItem),
      today,
    },
  };
}
