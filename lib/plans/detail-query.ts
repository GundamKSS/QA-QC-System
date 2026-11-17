/** The address of `/plans/[id]` as a page's `searchParams` gives it. */
export type PlanDetailQuery = Record<string, string | string[] | undefined>;

/** The tabs of the plan page, by their `?tab=` value. Lives here, not in the client view, so the server page can read it as plain data. */
export const PLAN_TABS = { info: "ข้อมูล", work: "ใบงาน", inspections: "ผลการตรวจ", history: "ประวัติ" } as const;
export type PlanTab = keyof typeof PLAN_TABS;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

/** `?tab=` and `?opened=<woNo>`; an unknown tab falls back to "ข้อมูล" instead of an error page. */
export function parsePlanDetailQuery(query: PlanDetailQuery): { tab: PlanTab; opened: string } {
  const tab = one(query.tab);
  return { tab: Object.hasOwn(PLAN_TABS, tab) ? (tab as PlanTab) : "info", opened: one(query.opened).slice(0, 40) };
}
