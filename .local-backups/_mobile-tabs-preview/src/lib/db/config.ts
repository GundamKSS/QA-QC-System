import type { config as SqlConfig } from "mssql";

export type Env = Record<string, string | undefined>;

const flag = (value: string | undefined, fallback: boolean) =>
  value === undefined || value === "" ? fallback : ["1", "true", "on", "yes"].includes(value.toLowerCase());

/** True when DB_SERVER is set. Without it the app runs DB-less (mock/dev) and skips persistence. */
export function dbConfigured(env: Env = process.env): boolean {
  return Boolean(env.DB_SERVER?.trim());
}

/** Builds the mssql config from DB_* variables (see .env.example). Throws on an unusable setup. */
export function dbConfigFromEnv(env: Env = process.env): SqlConfig {
  const server = env.DB_SERVER?.trim();
  if (!server) throw new Error("DB_SERVER is not set");
  const user = env.DB_USER?.trim();
  const password = env.DB_PASSWORD;
  if (!user || !password) throw new Error("DB_USER and DB_PASSWORD are required");
  const port = env.DB_PORT ? Number(env.DB_PORT) : 1433;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("DB_PORT is invalid");
  return {
    server,
    port,
    database: env.DB_NAME?.trim() || "QCheck",
    user,
    password,
    // Times are stored as UTC datetime2; keep the driver from shifting them to local time (BR-19).
    options: {
      encrypt: flag(env.DB_ENCRYPT, true),
      trustServerCertificate: flag(env.DB_TRUST_CERT, false),
      useUTC: true,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
    connectionTimeout: 10_000,
    requestTimeout: 15_000,
  };
}
