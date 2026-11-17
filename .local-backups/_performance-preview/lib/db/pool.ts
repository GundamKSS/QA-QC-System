import "server-only";
import sql from "mssql";
import { dbConfigFromEnv } from "./config";

const globalStore = globalThis as typeof globalThis & { __qcheckPool?: Promise<sql.ConnectionPool> };

/**
 * One shared pool per server process (survives dev hot reloads via globalThis).
 * A failed connect is not cached, so the next call retries.
 */
export function getPool(): Promise<sql.ConnectionPool> {
  globalStore.__qcheckPool ??= new sql.ConnectionPool(dbConfigFromEnv())
    .connect()
    .catch((error) => {
      delete globalStore.__qcheckPool;
      throw error;
    });
  return globalStore.__qcheckPool;
}

export { sql };
