import "server-only";
import { unstable_rethrow } from "next/navigation";
import { dbProblem, dbProblemMessages, isDbError } from "@/lib/db/errors";
import { apiError } from "./response";

/**
 * For the `catch` of a route that touches the database: an mssql failure becomes a 503 with the
 * sentence the screens already show; anything else (Next.js control-flow signals, bugs) is thrown
 * again so it surfaces as a real 500 instead of being hidden. `extra` rides along in the body
 * (e.g. the values a form should keep).
 */
export function dbFailure(error: unknown, label: string, extra: Record<string, unknown> = {}): Response {
  unstable_rethrow(error);
  if (!isDbError(error)) throw error;
  console.error(`[db] ${label} failed`, error.message);
  return apiError(503, dbProblemMessages[dbProblem(error)], extra);
}
