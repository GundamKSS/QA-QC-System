import { authPolicy } from "@/lib/config/auth";
import { audit, auditContext } from "@/lib/auth/audit";
import { isSameOriginRequest } from "@/lib/auth/same-origin";
import { deleteSession, readSession } from "@/lib/auth/session";

/**
 * Sign out with a plain form POST and a 303 to /login — it works without JavaScript and, being a full
 * page load (unlike a soft navigation), drops every page Next.js keeps alive in <Activity>, so nothing
 * of this user stays in memory for the next person on a shared device. It answers a redirect, not
 * JSON, which is why it does not use `guardApi` / `apiJson`.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request.headers)) return new Response(null, { status: 403 });

  const reason = new URL(request.url).searchParams.get("reason");
  const isIdle = reason === "idle";
  const session = await readSession();
  await deleteSession();
  if (session) {
    audit(
      { action: isIdle ? "logout.idle" : "logout", employeeCode: session.employeeCode, userId: session.id },
      auditContext(request.headers),
    );
  }
  // Relative Location: the browser resolves it against the host it used (LAN IP, proxy
  // hostname). `NextResponse.redirect` would need an absolute URL built from the bind address.
  const destination = isIdle ? `${authPolicy.loginPath}?idle=1` : authPolicy.loginPath;
  return new Response(null, { status: 303, headers: { Location: destination } });
}
