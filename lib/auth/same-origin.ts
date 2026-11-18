/**
 * CSRF check for browser writes to route handlers: `guardApi` runs it for every API route, and login
 * and logout call it themselves (the Server Actions that had their own check are gone).
 * Compares the browser's Origin with the host it actually used — Host, or X-Forwarded-Host
 * behind a proxy — the same headers Next.js checks for Server Actions. `request.nextUrl` can't
 * be used: Next builds it from the server's bind address (localhost:3000), not from the request.
 */
export function isSameOriginRequest(headers: Headers): boolean {
  // Sent by modern browsers on HTTPS and localhost; authoritative when present.
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin";

  const origin = headers.get("origin");
  if (!origin) return true; // Non-browser clients; browsers always send Origin on a POST.
  const rawHost = (headers.get("x-forwarded-host") ?? headers.get("host"))?.split(",")[0]?.trim();
  if (!rawHost) return false;
  try {
    const originUrl = new URL(origin);
    const hostWithoutPort = rawHost.replace(/:\d+$/, "");
    return originUrl.host === rawHost || originUrl.hostname === hostWithoutPort;
  } catch {
    return false; // "null" (sandboxed/opaque origins) or garbage
  }
}
