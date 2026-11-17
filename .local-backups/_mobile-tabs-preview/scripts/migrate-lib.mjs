import { createHash } from "node:crypto";

/** Splits a T-SQL script into batches on lines that contain only GO (case-insensitive). */
export function splitBatches(script) {
  return script
    .split(/^\s*GO\s*$/gim)
    .map((batch) => batch.trim())
    .filter(Boolean);
}

export function checksum(script) {
  return createHash("sha256").update(script.replace(/\r\n/g, "\n")).digest("hex");
}

/** Files named NNN_name.sql, in numeric order. */
export function migrationFiles(names) {
  return names.filter((name) => /^\d{3}_[\w-]+\.sql$/.test(name)).sort();
}
