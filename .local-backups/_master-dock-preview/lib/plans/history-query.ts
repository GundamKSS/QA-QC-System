import { thaiToday } from "./rules";
import type { JobHistoryFilter } from "./store";

export const HISTORY_PAGE_SIZE = 50;
export const HISTORY_RANGES = { "30": "30 วันล่าสุด", "90": "90 วันล่าสุด", all: "ทั้งหมด" } as const;
export const HISTORY_KINDS = { all: "ทั้งหมด", done: "ส่งแล้ว", cancelled: "ยกเลิก" } as const;

/** The address of /history, or of `GET /api/history`, as a page's `searchParams` gives it. */
export type HistoryQuery = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export type HistoryValues = { kind: keyof typeof HISTORY_KINDS; range: keyof typeof HISTORY_RANGES; mine: boolean; page: number };

/** URL → filter for /history (docs/18). Unknown values fall back to the defaults instead of failing. */
export function parseHistoryQuery(query: HistoryQuery, today: string): { values: HistoryValues; filter: Omit<JobHistoryFilter, "userId"> } {
  const kind = one(query.kind);
  const range = one(query.range);
  const values: HistoryValues = {
    kind: Object.hasOwn(HISTORY_KINDS, kind) ? (kind as HistoryValues["kind"]) : "all",
    range: Object.hasOwn(HISTORY_RANGES, range) ? (range as HistoryValues["range"]) : "30",
    mine: one(query.view) === "mine",
    page: Math.min(10_000, Math.max(1, Number.parseInt(one(query.page), 10) || 1)),
  };
  return { values, filter: { kind: values.kind, fromDate: values.range === "all" ? null : daysBefore(today, Number(values.range)), page: values.page, pageSize: HISTORY_PAGE_SIZE } };
}

function daysBefore(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

/** The query string for these values (`kind=…&range=…&view=mine&page=…`); defaults are left out. /history and `GET /api/history` read the same one. */
export function historyQuery(values: HistoryValues): string {
  const params = new URLSearchParams();
  if (values.kind !== "all") params.set("kind", values.kind);
  if (values.range !== "30") params.set("range", values.range);
  if (values.mine) params.set("view", "mine");
  if (values.page > 1) params.set("page", String(values.page));
  return params.toString();
}

/** Link to /history with some values changed; defaults are left out. */
export function historyHref(values: HistoryValues, changes: Partial<HistoryValues> = {}): string {
  const text = historyQuery({ ...values, ...changes });
  return text ? `/history?${text}` : "/history";
}

export const historyToday = () => thaiToday(new Date());
