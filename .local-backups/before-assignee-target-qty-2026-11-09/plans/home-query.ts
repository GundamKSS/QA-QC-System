/** How many plans the "recent plans" table and the "nearest 90-day deadlines" panel of /home show. */
export const HOME_RECENT_LIMIT = 8;
export const HOME_DEADLINE_LIMIT = 5;

/** The address of /home, or of `GET /api/home`, as a page's `searchParams` gives it. */
export type HomeQuery = Record<string, string | string[] | undefined>;

/** The search words of the recent-plans table (`?q=`): one value only, trimmed and cut at 200 characters. */
export function parseHomeQuery(query: HomeQuery): string {
  return typeof query.q === "string" ? query.q.trim().slice(0, 200) : "";
}
