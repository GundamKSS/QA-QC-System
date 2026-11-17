import type { NextRequest } from "next/server";
import { authPolicy } from "@/config/auth";
import { audit, auditContext } from "@/lib/auth/audit";
import { isSameOriginRequest } from "@/lib/auth/same-origin";
import { deleteSession, readSession } from "@/lib/auth/session";

/**
 * Sign out with a plain form POST and a 303 to /login. A full page load (unlike a Server
 * Action's soft navigation) drops every page Next.js keeps alive in <Activity>, so nothing
 * of this user stays in memory for the next person on a shared device.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return new Response(null, { status: 403 });

  const session = await readSession();
  await deleteSession();
  if (session) {
    audit({ action: "logout", employeeCode: session.employeeCode, userId: session.id }, auditContext(request.headers));
  }
  // Relative Location: the browser resolves it against the host it used (LAN IP, proxy
  // hostname). `NextResponse.redirect` would need an absolute URL built from the bind address.
  return new Response(null, { status: 303, headers: { Location: authPolicy.loginPath } });
}
