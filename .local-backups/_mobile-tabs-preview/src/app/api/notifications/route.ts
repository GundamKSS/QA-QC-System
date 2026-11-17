import { unstable_rethrow } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { getWorkNotifications } from "@/lib/notifications/service";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

/** Polling endpoint: authenticate every request and never share a person's work through caches. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "unauthenticated" }, { status: 401, headers });
    if (user.mustChangePassword) return Response.json({ error: "password_change_required" }, { status: 403, headers });
    return Response.json(await getWorkNotifications(user), { headers });
  } catch (error) {
    unstable_rethrow(error);
    console.error("[notifications] unable to load work alerts", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "notifications_unavailable" }, { status: 503, headers });
  }
}
