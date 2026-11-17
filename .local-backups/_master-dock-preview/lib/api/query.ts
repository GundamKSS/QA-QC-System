/**
 * The query string of a request as the object a page's `searchParams` would be: a name that appears once is a
 * string, a repeated name is an array. The query parsers written for pages (`parseHistoryQuery` …) take that
 * shape, so a `GET` route and the page it replaces read the address the same way.
 */
export function readQuery(request: Request): Record<string, string | string[]> {
  const params = new URL(request.url).searchParams;
  return Object.fromEntries(
    [...new Set(params.keys())].map((key) => {
      const values = params.getAll(key);
      return [key, values.length === 1 ? values[0] : values];
    }),
  );
}
