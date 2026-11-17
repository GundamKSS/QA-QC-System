export type DbProblem = "tls" | "unreachable" | "login" | "other";

const MSSQL_ERRORS = new Set(["ConnectionError", "RequestError", "TransactionError", "PreparedStatementError"]);

/** True for errors thrown by the mssql driver — not Next.js redirect/notFound signals or app bugs. */
export function isDbError(error: unknown): error is Error {
  return error instanceof Error && MSSQL_ERRORS.has(error.name);
}

function codes(error: unknown): string[] {
  const found: string[] = [];
  for (let current: unknown = error, depth = 0; current && depth < 5; depth++) {
    const { code, originalError, cause } = current as { code?: unknown; originalError?: unknown; cause?: unknown };
    if (typeof code === "string") found.push(code);
    current = originalError ?? cause;
  }
  return found;
}

/** Classifies a database failure so screens can say what to fix without showing the raw error. */
export function dbProblem(error: unknown): DbProblem {
  const all = codes(error);
  if (all.some((code) => /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS/.test(code))) return "tls";
  if (all.includes("ELOGIN")) return "login";
  if (all.some((code) => ["ESOCKET", "ETIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH"].includes(code))) return "unreachable";
  return "other";
}

export const dbProblemMessages: Record<DbProblem, string> = {
  tls: "เชื่อมต่อฐานข้อมูลไม่ได้: เซิร์ฟเวอร์ใช้ใบรับรอง TLS ที่เครื่องนี้ไม่เชื่อถือ (self-signed)",
  unreachable: "เชื่อมต่อฐานข้อมูลไม่ได้: ติดต่อเซิร์ฟเวอร์ไม่ได้หรือหมดเวลา",
  login: "เชื่อมต่อฐานข้อมูลไม่ได้: ชื่อผู้ใช้/รหัสผ่านฐานข้อมูลไม่ถูกต้อง หรือไม่มีสิทธิ์เข้าฐานข้อมูลนี้",
  other: "ฐานข้อมูลขัดข้อง กรุณาลองใหม่อีกครั้ง",
};
