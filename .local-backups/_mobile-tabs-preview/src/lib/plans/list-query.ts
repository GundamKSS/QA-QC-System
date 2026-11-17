import { CHECKLIST_STATUSES, type ChecklistStatus } from "./rules";
import { PLAN_SORTS, type PlanListFilter, type PlanSort } from "./store";

/** Same page size as the master-data lists. */
export const PLAN_PAGE_SIZE = 50;

type Query = Record<string, string | string[] | undefined>;

/** The plan-list filters as they sit in the URL (?q=&status=&vendor=&ptype=&from=&to=&sort=&page=) — docs/15 §2. */
export type PlanListValues = {
  q: string;
  /** "" = every status except ยกเลิก (P3). */
  status: ChecklistStatus | "";
  vendor: string;
  ptype: string;
  from: string;
  to: string;
  sort: PlanSort;
  page: number;
};

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

const isoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : "";
};

/** Unknown or malformed values fall back to "no filter" instead of an error page. */
export function parsePlanListQuery(query: Query): { values: PlanListValues; filter: PlanListFilter } {
  const status = one(query.status);
  const sort = one(query.sort);
  let from = isoDate(one(query.from));
  let to = isoDate(one(query.to));
  if (from && to && from > to) [from, to] = [to, from];
  const values: PlanListValues = {
    q: one(query.q).trim().slice(0, 100),
    status: Object.hasOwn(CHECKLIST_STATUSES, status) ? (status as ChecklistStatus) : "",
    vendor: /^\d{1,9}$/.test(one(query.vendor)) ? one(query.vendor) : "",
    ptype: one(query.ptype).slice(0, 100),
    from,
    to,
    sort: (PLAN_SORTS as readonly string[]).includes(sort) ? (sort as PlanSort) : "opened",
    page: Math.min(10_000, Math.max(1, Number.parseInt(one(query.page), 10) || 1)),
  };
  return {
    values,
    filter: {
      q: values.q,
      statuses: values.status ? CHECKLIST_STATUSES[values.status].statuses : null,
      vendorId: values.vendor ? Number(values.vendor) : null,
      pumpType: values.ptype || null,
      from: values.from || null,
      to: values.to || null,
      sort: values.sort,
      page: values.page,
      pageSize: PLAN_PAGE_SIZE,
    },
  };
}

/** How many filters besides the search box are set — shown on the mobile "ตัวกรอง" button. */
export const activeFilterCount = (values: PlanListValues) => [values.status, values.vendor, values.ptype, values.from, values.to].filter(Boolean).length;

/** Link to the list with some values changed; defaults are left out so URLs stay short. */
export function planListHref(values: PlanListValues, changes: Partial<PlanListValues> = {}): string {
  const merged = { ...values, ...changes };
  const params = new URLSearchParams();
  for (const key of ["q", "status", "vendor", "ptype", "from", "to"] as const) if (merged[key]) params.set(key, merged[key]);
  if (merged.sort !== "opened") params.set("sort", merged.sort);
  if (merged.page > 1) params.set("page", String(merged.page));
  const text = params.toString();
  return text ? `/plans?${text}` : "/plans";
}
