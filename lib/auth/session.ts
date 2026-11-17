import "server-only";
import { EncryptJWT, jwtDecrypt } from "jose";
import { cookies } from "next/headers";
import { authPolicy } from "@/lib/config/auth";

/**
 * What the cookie carries. Datacenter users have no local record yet, so their name and roles
 * (synced from `role_prog` at login) ride in the encrypted cookie. The central `access_token`
 * is never stored here or sent to the browser (docs/04 §3.1 ข้อ 1).
 */
export type SessionClaims = {
  id: string;
  employeeCode: string;
  fullName?: string;
  email?: string;
  roles?: string[];
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
    mcp: user.mustChangePassword ? 1 : 0,
    src: user.source,
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .encrypt(sessionKey());

  (await cookies()).set(authPolicy.sessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
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
