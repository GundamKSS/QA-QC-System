import { authOnlyPaths } from "@/config/auth";

export const EMPLOYEE_CODE_MAX = 32;
export const PASSWORD_MAX = 256;

/** Codes are compared case-insensitively and without spaces ("trw 1001" → "TRW1001"). */
export function normalizeEmployeeCode(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.normalize("NFKC").replace(/\s+/g, "").toUpperCase().slice(0, EMPLOYEE_CODE_MAX);
}

const BASE = "http://qcheck.invalid";

/**
 * Only same-origin absolute paths; never protocol-relative URLs or an auth screen
 * (login, change password, /auth/* handlers). The forced password change is decided by
 * the account, not by `next`.
 */
export function safeNextPath(input: unknown, fallback: string): string {
  if (typeof input !== "string" || input.length > 512) return fallback;
  if (!input.startsWith("/") || input.startsWith("//") || input.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001F\u007F]/.test(input)) return fallback;
  let url: URL;
  let path: string;
  try {
    url = new URL(input, BASE);
    // Compare the resolved path, so "/home/../login" or "/%61uth/logout" can't slip through.
    path = decodeURIComponent(url.pathname).toLowerCase();
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  if (authOnlyPaths.some((blocked) => path === blocked || path.startsWith(`${blocked}/`))) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
