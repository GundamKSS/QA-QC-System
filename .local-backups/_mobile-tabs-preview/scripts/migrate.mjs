// Usage: npm run db:migrate   (reads DB_* from .env.local; see .env.example)
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sql from "mssql";
import { checksum, migrationFiles, splitBatches } from "./migrate-lib.mjs";

const env = process.env;
const database = env.DB_NAME?.trim() || "QCheck";
if (!/^[\w]+$/.test(database)) throw new Error("DB_NAME may only contain letters, digits and underscore");
const flag = (v, d) => (v ? ["1", "true", "on", "yes"].includes(v.toLowerCase()) : d);
const base = {
  server: env.DB_SERVER,
  port: env.DB_PORT ? Number(env.DB_PORT) : 1433,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  options: { encrypt: flag(env.DB_ENCRYPT, true), trustServerCertificate: flag(env.DB_TRUST_CERT, false), useUTC: true },
  connectionTimeout: 10_000,
  requestTimeout: 60_000,
};
if (!base.server || !base.user || !base.password) {
  console.error("DB_SERVER, DB_USER and DB_PASSWORD must be set (see .env.example).");
  process.exit(1);
}

// 1. Make sure the database exists (the runner owns this, not the .sql files).
const master = await new sql.ConnectionPool({ ...base, database: "master" }).connect();
await master.request().query(`IF DB_ID(N'${database}') IS NULL CREATE DATABASE [${database}]`);
await master.close();

// 2. Apply pending files in order, each in its own transaction.
const pool = await new sql.ConnectionPool({ ...base, database }).connect();
await pool.request().query(`
  IF OBJECT_ID(N'dbo.schema_migrations', N'U') IS NULL
    CREATE TABLE dbo.schema_migrations (
      name VARCHAR(128) NOT NULL CONSTRAINT PK_schema_migrations PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at DATETIME2(0) NOT NULL CONSTRAINT DF_schema_migrations_at DEFAULT (SYSUTCDATETIME()))`);
const applied = new Map(
  (await pool.request().query("SELECT name, checksum FROM dbo.schema_migrations")).recordset.map((r) => [r.name, r.checksum]),
);

// fileURLToPath, not URL.pathname: the project folder has a space ("TRW Dev") that .pathname leaves as %20.
const dir = fileURLToPath(new URL("../db/", import.meta.url));
let ran = 0;
for (const name of migrationFiles(await readdir(dir))) {
  const script = await readFile(join(dir, name), "utf8");
  const sum = checksum(script);
  if (applied.has(name)) {
    if (applied.get(name) !== sum) {
      console.error(`✗ ${name} was changed after it was applied. Add a new numbered file instead of editing it.`);
      process.exit(1);
    }
    console.log(`· ${name} (already applied)`);
    continue;
  }
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const batch of splitBatches(script)) await new sql.Request(tx).query(batch);
    await new sql.Request(tx).input("n", sql.VarChar(128), name).input("c", sql.Char(64), sum)
      .query("INSERT INTO dbo.schema_migrations (name, checksum) VALUES (@n, @c)");
    await tx.commit();
    console.log(`✓ ${name}`);
    ran++;
  } catch (error) {
    await tx.rollback().catch(() => {});
    console.error(`✗ ${name}: ${error.message}`);
    process.exit(1);
  }
}
await pool.close();
console.log(ran ? `Applied ${ran} migration(s).` : "Database is up to date.");
