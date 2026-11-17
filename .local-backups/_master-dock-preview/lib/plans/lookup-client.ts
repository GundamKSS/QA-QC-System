import { apiMessages } from "@/lib/api/messages";
import type { DocLookup } from "./service";

export type DocLookupResult = DocLookup | { kind: "error"; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/**
 * Browser side of `GET /api/plans/lookup-doc` (K3: the open-plan form asks when the document field
 * loses focus). Never throws: any failure comes back as `{ kind: "error", message }` for the status box.
 */
export async function lookupReceiptDocRemote(docType: string, docNo: string): Promise<DocLookupResult> {
  let response: Response;
  try {
    response = await fetch(`/api/plans/lookup-doc?${new URLSearchParams({ docType, docNo })}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
  } catch {
    return { kind: "error", message: apiMessages.network };
  }
  const body: unknown = await response.json().catch(() => null);
  if (isRecord(body) && body.status === "done" && isRecord(body.result) && typeof body.result.kind === "string") return body.result as DocLookup;
  if (isRecord(body) && body.status === "error" && typeof body.message === "string") return { kind: "error", message: body.message };
  return { kind: "error", message: apiMessages.unexpected };
}
