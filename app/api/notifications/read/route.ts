import { dbFailure } from "@/lib/api/db";
import { guardApi } from "@/lib/api/guard";
import { apiError, apiJson } from "@/lib/api/response";
import { resolveActorId } from "@/lib/db/actor";
import { dbConfigured } from "@/lib/db/config";
import { markNotificationsRead } from "@/lib/notifications/read-store";
import { parseNotificationReadPayload } from "@/lib/notifications/read-validation";

const MAX_BODY_BYTES = 256 * 1024;

async function readNotificationBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_BODY_BYTES) return null;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      return await request.json();
    }
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const ids = [...form.getAll("ids"), ...form.getAll("id")].filter((v): v is string => typeof v === "string");
      return { ids };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * POST /api/notifications/read
 * Marks one or more notifications as read in SQL Server (or in-memory fallback when no DB)
 * so read status and read history stay synced across devices for the signed-in user.
 */
export async function POST(request: Request) {
  const guard = await guardApi(request, { page: "alerts", returnTo: "/alerts" });
  if ("response" in guard) return guard.response;

  const rawBody = await readNotificationBody(request);
  const parsed = parseNotificationReadPayload(rawBody);
  if (!parsed.ok) {
    return apiError(422, parsed.message);
  }

  try {
    const actorId = dbConfigured() ? await resolveActorId(guard.user.id) : guard.user.id;
    if (!actorId) {
      return apiJson({ status: "done", marked: 0, readIds: [], synced: false });
    }
    const result = await markNotificationsRead(actorId, parsed.entries);
    return apiJson({
      status: "done",
      marked: result.marked,
      readIds: result.readIds,
      synced: result.synced,
    });
  } catch (error) {
    return dbFailure(error, "mark notifications read");
  }
}
