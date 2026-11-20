import "server-only";
import { EncryptJWT, jwtDecrypt } from "jose";
import { cookies, headers } from "next/headers";
import { authPolicy } from "@/lib/config/auth";
import { knownProgramRole } from "./roles";
import type { ProgramRole } from "./types";

/**
 * What the cookie carries. Datacenter users store their profile, ProgramPermission level (`programRole`),
 * and fallback roles in the encrypted cookie. The central `access_token` is never stored here or sent
 * to the browser (docs/04 §3.1 ข้อ 1).
 */
export type SessionClaims = {
  id: string;
  employeeCode: string;
  fullName?: string;
  email?: string;
  roles?: string[];
  programRole?: ProgramRole;
  /** True only when a signed-in DEV account impersonated another user; allows switching back safely. */
  impersonatedByDev?: boolean;
  mustChangePassword?: boolean;
  /** LOCAL = field user (DEC-12): the DAL re-reads their record on every request. */
  source?: "LOCAL";
};

const ISSUER = "qcheck";

function sessionKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  const key = secret ? Buffer.from(secret, "base64url") : Buffer.alloc(0);
  if (key.length !== 32) {
    throw new Error("SESSION_SECRET must be exactly 32 random bytes encoded as base64url (see .env.example).");
  }
  return new Uint8Array(key);
}

/** Encrypted (A256GCM) so the cookie can't be read or forged; HttpOnly so scripts can't touch it. */
export async function createSession(user: SessionClaims) {
  const maxAge = authPolicy.sessionHours * 60 * 60;
  const token = await new EncryptJWT({
    code: user.employeeCode,
    name: user.fullName,
    email: user.email,
    roles: user.roles,
    pr: user.programRole,
    ...(user.impersonatedByDev ? { imp: 1 } : {}),
    mcp: user.mustChangePassword ? 1 : 0,
    src: user.source,
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .encrypt(sessionKey());

  const reqHeaders = await headers();
  const forwardedProto = reqHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const origin = reqHeaders.get("origin");
  const isHttps = forwardedProto === "https" || origin?.startsWith("https://") === true;

  (await cookies()).set(authPolicy.sessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && isHttps,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

/** The session's claims, or null when the cookie is missing, expired or tampered with. */
export async function readSession(): Promise<SessionClaims | null> {
  const token = (await cookies()).get(authPolicy.sessionCookie)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, sessionKey(), { issuer: ISSUER });
    if (typeof payload.sub !== "string" || typeof payload.code !== "string") return null;
    return {
      id: payload.sub,
      employeeCode: payload.code,
      fullName: typeof payload.name === "string" ? payload.name : undefined,
      email: typeof payload.email === "string" ? payload.email : undefined,
      roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : undefined,
      programRole: knownProgramRole(payload.pr),
      ...(payload.imp === 1 ? { impersonatedByDev: true } : {}),
      mustChangePassword: payload.mcp === 1,
      source: payload.src === "LOCAL" ? "LOCAL" : undefined,
    };
  } catch {
    return null;
  }
}

export async function deleteSession() {
  (await cookies()).delete(authPolicy.sessionCookie);
}
