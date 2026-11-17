"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { callApi, type ApiMethod } from "./call";
import { apiReadVersion, invalidateApiReads, subscribeApiReads } from "./invalidate";
import { readApi, readView, settleRead, type ReadSettled } from "./read";

/**
 * What an answer asks the page to do afterwards: go to `redirectTo`, or reload this page's server data
 * after a plain `done` or when the answer says `refresh: true` (a refusal because what the page shows went
 * stale). A route handler's `revalidatePath` does not reach the browser's router cache by itself, hence the
 * explicit refresh. Both run as a transition, so `settling` stays true until the new page is on screen —
 * a button stays disabled and a ticked box keeps its new value until then. The same moment also tells every
 * `useApiRead` on the page to fetch again (`invalidateApiReads`), since `router.refresh()` does not reach them.
 */
function useSettle() {
  const router = useRouter();
  const [settling, startSettling] = useTransition();
  const settle = (state: { status: string }, redirectTo: string | null, refresh: boolean) => {
    if (state.status === "done") invalidateApiReads();
    if (redirectTo) startSettling(() => router.push(redirectTo));
    else if (refresh || state.status === "done") {
      startSettling(() => router.refresh());
    }
  };
  return [settle, settling] as const;
}

/**
 * Like `useActionState`, for a form whose action is a request to an API route:
 * `[state, formAction, pending]`, with `<form action={formAction}>` keeping its pending flag
 * and the automatic field reset after each answer. The route answers with the state to render
 * (see `apiJson`). `pending` also covers the redirect / refresh that follows, so the form can't be sent twice.
 */
export function useApiAction<State extends { status: string }>(
  url: string,
  initial: State,
  failed: (message: string, formData: FormData) => State,
  method: ApiMethod = "POST",
) {
  const [settle, settling] = useSettle();
  // `Awaited<State>` is how React types the state of a generic action; our states are plain objects, so it is `State`.
  const [state, action, pending] = useActionState<State, FormData>(async (_previous, formData) => {
    const { state: next, redirectTo, refresh } = await callApi<State>(url, method, formData, failed);
    settle(next, redirectTo, refresh);
    return next;
  }, initial as Awaited<State>);
  return [state as State, action, pending || settling] as const;
}

/**
 * For a control that is not a form (a tick box): `call(formData)` sends it and returns the answer's
 * state, and `settling` is true from the answer until the refreshed page is on screen. Call it inside `startTransition`.
 */
export function useApiCall<State extends { status: string }>(url: string, failed: (message: string, formData: FormData) => State, method: ApiMethod = "POST") {
  const [settle, settling] = useSettle();
  const call = async (formData: FormData): Promise<State> => {
    const { state, redirectTo, refresh } = await callApi<State>(url, method, formData, failed);
    settle(state, redirectTo, refresh);
    return state;
  };
  return [call, settling] as const;
}

/**
 * For a screen that reads an API route (`GET`): `{ data, loading, error, reload }`. The request goes out
 * when the component mounts and again whenever `url` changes (a new filter, a new alert) or `reload()` is
 * called, or when a form on the page saved something (`invalidateApiReads`); the previous data stays on screen
 * meanwhile (see `readView`) and a request that a newer one replaces is aborted. A 401 answer sends the
 * browser to the sign-in address it carries, like a form does.
 */
export function useApiRead<T extends object>(url: string) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<ReadSettled<T> | null>(null);
  // The server snapshot is 0 so the first client render matches; a version bumped before mount is picked up by the effect's key.
  const version = useSyncExternalStore(subscribeApiReads, apiReadVersion, () => 0);
  const key = `${version}.${attempt}|${url}`;

  useEffect(() => {
    const controller = new AbortController();
    void readApi<T>(url, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setSettled((previous) => settleRead(previous, key, result));
      if (!result.ok && result.redirectTo) router.push(result.redirectTo);
    });
    return () => controller.abort();
  }, [url, key, router]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  return { ...readView(settled, key), reload };
}
