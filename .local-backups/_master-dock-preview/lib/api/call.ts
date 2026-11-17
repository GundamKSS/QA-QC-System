import { apiMessages } from "./messages";

export type ApiMethod = "POST" | "PUT" | "PATCH" | "DELETE";

/** A form as a JSON object: repeated names (checkboxes) become arrays; files are never sent. */
export function formToJson(formData: FormData): Record<string, string | string[]> {
  const body: Record<string, string | string[]> = {};
  for (const key of new Set(formData.keys())) {
    const values = formData.getAll(key).filter((value): value is string => typeof value === "string");
    if (values.length === 1) body[key] = values[0];
    else if (values.length > 1) body[key] = values;
  }
  return body;
}

/** Only a path on this site: `//host` and `https://…` would send the person somewhere else. */
export const isSitePath = (value: unknown): value is string => typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");

/**
 * Sends one form to an API route and returns the state to render, plus where to go next.
 * `failed` builds the screen's own error state for the two cases with no usable answer
 * (network down, not our JSON), so a form never has to handle a thrown error. It also gets the
 * form as sent, so a long form can keep what was typed.
 */
export async function callApi<State extends { status: string }>(
  url: string,
  method: ApiMethod,
  formData: FormData,
  failed: (message: string, formData: FormData) => State,
): Promise<{ state: State; redirectTo: string | null; refresh: boolean }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(formToJson(formData)),
    });
  } catch {
    return { state: failed(apiMessages.network, formData), redirectTo: null, refresh: false };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // not JSON — handled below
  }
  if (!body || typeof body !== "object" || typeof (body as { status?: unknown }).status !== "string") {
    return { state: failed(apiMessages.unexpected, formData), redirectTo: null, refresh: false };
  }
  // `redirectTo` and `refresh` are instructions for the page, not part of the state the form renders.
  const { redirectTo, refresh, ...state } = body as { redirectTo?: unknown; refresh?: unknown } & Record<string, unknown>;
  return { state: state as State, redirectTo: isSitePath(redirectTo) ? redirectTo : null, refresh: refresh === true };
}
