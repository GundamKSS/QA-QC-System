import { isSitePath } from "./call";
import { apiMessages } from "./messages";

/** What a `GET` to an API route came back with: the data, or the sentence to show (and where to go if the session ended). */
export type ApiReadResult<T> = { ok: true; data: T } | { ok: false; message: string; redirectTo: string | null };

/**
 * Reads an API route with `GET` and never throws, like `callApi` does for writes. A failure carries the
 * route's own `{ status: "error", message, redirectTo? }` when it sent one (401 → the sign-in address,
 * 503 → the database sentence); a dropped network or an answer that is not our JSON becomes the shared
 * sentences in `apiMessages`. Pass a signal to cancel a request that a newer one replaces.
 */
export async function readApi<T extends object>(url: string, { signal }: { signal?: AbortSignal } = {}): Promise<ApiReadResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, { method: "GET", credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal });
  } catch {
    return { ok: false, message: apiMessages.network, redirectTo: null };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // not JSON — handled below
  }
  const object = body && typeof body === "object" ? (body as Record<string, unknown>) : null;

  if (!response.ok) {
    return {
      ok: false,
      message: typeof object?.message === "string" && object.message ? object.message : apiMessages.unexpected,
      redirectTo: isSitePath(object?.redirectTo) ? object.redirectTo : null,
    };
  }
  if (!object) return { ok: false, message: apiMessages.unexpected, redirectTo: null };
  return { ok: true, data: object as T };
}

/** The newest answer `useApiRead` holds; `key` names the request it belongs to. */
export type ReadSettled<T> = { key: string; data: T | null; error: string | null };

/**
 * What to keep when an answer arrives. The data of an earlier request stays when a later one fails, so a
 * failed reload leaves the list on screen under an alert instead of blanking it.
 */
export function settleRead<T>(previous: ReadSettled<T> | null, key: string, result: ApiReadResult<T>): ReadSettled<T> {
  if (result.ok) return { key, data: result.data, error: null };
  return { key, data: previous?.data ?? null, error: result.message };
}

/**
 * What the screen shows for request `key` right now. Until its answer arrives `loading` is true, the data
 * of the previous request stays (so a filter change dims the list instead of blanking it) and an error that
 * belonged to an earlier request is not shown.
 */
export function readView<T>(settled: ReadSettled<T> | null, key: string): { data: T | null; error: string | null; loading: boolean } {
  const current = settled !== null && settled.key === key;
  return { data: settled?.data ?? null, error: current ? settled.error : null, loading: !current };
}
