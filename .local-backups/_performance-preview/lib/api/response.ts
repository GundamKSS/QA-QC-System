/**
 * Every API answer depends on who is signed in, so no cache (browser, proxy) may keep or share it.
 * Same headers as `app/api/notifications/route.ts`.
 */
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

/**
 * One JSON body for the form to render. Bodies mirror the `status`-tagged states the screens
 * already switch on (`done`, `error`, …); an optional `redirectTo` asks the browser to go there.
 */
export function apiJson<T extends { status: string }>(body: T, status = 200): Response {
  return Response.json(body, { status, headers: privateHeaders });
}

/**
 * A read's answer (`GET`): the data itself, with the same no-cache headers. Failures still go through
 * `apiError`, so the browser tells the two apart by the HTTP status (see `readApi`).
 */
export function apiData<T extends object>(body: T): Response {
  return Response.json(body, { headers: privateHeaders });
}

/** A failure the person can act on: `message` is shown as-is, `extra` carries field errors / typed values. */
export function apiError(status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return apiJson({ status: "error", message, ...extra }, status);
}
