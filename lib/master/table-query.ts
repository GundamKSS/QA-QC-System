/** Same page size as the plan lists. */
export const MASTER_PAGE_SIZE = 50;

/** The address of `/master/<table>`, or of `GET /api/master/<table>`, as a page's `searchParams` gives it. */
export type MasterTableQuery = Record<string, string | string[] | undefined>;

export type MasterStatusFilter = "all" | "active" | "inactive";

/** What the address of a master table's page says (?q=&status=&page=&edit=&new=1&saved=). */
export type MasterTableValues = {
  q: string;
  status: MasterStatusFilter;
  page: number;
  /** The row whose edit form is open. */
  editId: number | null;
  /** The create form is open. */
  creating: boolean;
  /** The row that was just saved (`?saved=<id>`): only the screen uses it, the API never reads it. */
  saved: number | null;
};

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
const rowId = (value: string) => (/^\d{1,9}$/.test(value) ? Number(value) : null);

/** Unknown or malformed values fall back to "no filter / nothing open" instead of an error page. */
export function parseMasterTableQuery(query: MasterTableQuery): MasterTableValues {
  const status = one(query.status);
  return {
    q: one(query.q).slice(0, 100),
    status: status === "active" || status === "inactive" ? status : "all",
    page: Math.min(10_000, Math.max(1, Number.parseInt(one(query.page), 10) || 1)),
    editId: rowId(one(query.edit)),
    creating: one(query.new) === "1",
    saved: rowId(one(query.saved)),
  };
}

/** The query string `GET /api/master/<table>` is asked with: the list filters and which form is open — not `saved`, which the API has no use for. */
export function masterTableApiQuery(values: MasterTableValues): string {
  const params = new URLSearchParams();
  if (values.q) params.set("q", values.q);
  if (values.status !== "all") params.set("status", values.status);
  if (values.page > 1) params.set("page", String(values.page));
  if (values.editId !== null) params.set("edit", String(values.editId));
  if (values.creating) params.set("new", "1");
  return params.toString();
}

/** Link to the table's page with the list filters kept and `changes` added (`edit`, `new`, a new `page`); empty values are left out so URLs stay short. */
export function masterTableHref(slug: string, values: Pick<MasterTableValues, "q" | "status" | "page">, changes: Record<string, string | number | null> = {}): string {
  const params = new URLSearchParams();
  const merged = { q: values.q, status: values.status === "all" ? "" : values.status, page: values.page > 1 ? String(values.page) : "", ...changes };
  for (const [key, value] of Object.entries(merged)) if (value !== null && value !== "") params.set(key, String(value));
  const text = params.toString();
  return text ? `/master/${slug}?${text}` : `/master/${slug}`;
}
