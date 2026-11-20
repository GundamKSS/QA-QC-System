import "server-only";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccessPage, type AppPage } from "@/lib/auth/page-access";
import { hasAppAccess } from "@/lib/auth/roles";
import { isSameOriginRequest } from "@/lib/auth/same-origin";
import type { SessionUser } from "@/lib/auth/types";
import { authPolicy } from "@/lib/config/auth";
import { apiMessages } from "./messages";
import { apiError } from "./response";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type ApiGuardOptions = {
  /** The page whose role rule applies (lib/auth/page-access.ts) — the same single table the page and the menu use. */
  page?: AppPage;
  /** Where the sign-in page should return to, like `requirePageAccess(page, returnTo)`. */
  returnTo?: string;
  /** Only the change-PIN endpoint: someone who still owes a PIN change may call it. */
  allowPasswordChange?: boolean;
};

export type ApiGuard = { user: SessionUser } | { response: Response };

const loginUrl = (returnTo?: string) => (returnTo ? `${authPolicy.loginPath}?next=${encodeURIComponent(returnTo)}` : authPolicy.loginPath);

/**
 * The gate every API route passes first. A route handler gets no CSRF check and cannot redirect
 * the way a Server Action could, so this does the first itself and answers the second in JSON:
 * - a browser POST/PUT/PATCH/DELETE must come from our own origin (403 otherwise);
 * - signed out → 401, still owing a PIN change → 403, role not allowed for `page` → 403.
 * 401 and the PIN case carry `redirectTo` so the browser can take the person where the page would have.
 *
 * ```ts
 * const guard = await guardApi(request, { page: "plan-open" });
 * if ("response" in guard) return guard.response;
 * const { user } = guard;
 * ```
 */
export async function guardApi(request: Request, options: ApiGuardOptions = {}): Promise<ApiGuard> {
  if (!SAFE_METHODS.has(request.method) && !isSameOriginRequest(request.headers)) {
    return { response: apiError(403, apiMessages.origin) };
  }
  const user = await getCurrentUser();
  if (!user) return { response: apiError(401, apiMessages.signedOut, { redirectTo: loginUrl(options.returnTo) }) };
  if (user.mustChangePassword && !options.allowPasswordChange) {
    return { response: apiError(403, apiMessages.passwordChange, { redirectTo: authPolicy.changePasswordPath }) };
  }
  if (!hasAppAccess(user)) {
    return {
      response: apiError(403, "บัญชีของคุณยังไม่ได้รับการกำหนดสิทธิ์ย่อยในระบบ QCheck กรุณาติดต่อ Admin หรือ Dev", {
        redirectTo: authPolicy.noAccessPath,
      }),
    };
  }
  if (options.page && !canAccessPage(user.roles, options.page, user.programRole)) {
    return { response: apiError(403, apiMessages.forbidden) };
  }
  return { user };
}
