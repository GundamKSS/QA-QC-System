import "server-only";
import sql from "mssql";
import { dbConfigured } from "@/lib/db/config";
import { getPool } from "@/lib/db/pool";
import type { NotificationHistoryItem, NotificationKind, NotificationReadInput } from "./types";

const HISTORY_LIMIT = 50;
const VALID_KINDS = new Set<NotificationKind>(["assigned", "returned", "qa_handover"]);

export type NotificationReadSnapshot = {
  readIds: string[];
  history: NotificationHistoryItem[];
  synced: boolean;
};

export type NotificationReadStore = {
  load: (actorId: string) => Promise<NotificationReadSnapshot>;
  markRead: (actorId: string, entries: readonly NotificationReadInput[]) => Promise<{ marked: number; readIds: string[]; synced: boolean }>;
};

const globalStore = globalThis as typeof globalThis & {
  __qcheckNotificationReads?: Map<string, Map<string, NotificationHistoryItem>>;
};

function memoryBucket(actorId: string): Map<string, NotificationHistoryItem> {
  if (!globalStore.__qcheckNotificationReads) {
    globalStore.__qcheckNotificationReads = new Map();
  }
  let bucket = globalStore.__qcheckNotificationReads.get(actorId);
  if (!bucket) {
    bucket = new Map();
    globalStore.__qcheckNotificationReads.set(actorId, bucket);
  }
  return bucket;
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { number?: unknown; message?: unknown };
  if (err.number === 208) return true;
  return typeof err.message === "string" && err.message.includes("notification_reads");
}

function normalizeKind(value: string | null | undefined): NotificationKind {
  return value && VALID_KINDS.has(value as NotificationKind) ? (value as NotificationKind) : "assigned";
}

function loadFromMemory(actorId: string): NotificationReadSnapshot {
  const bucket = memoryBucket(actorId);
  const all = [...bucket.values()].sort((a, b) => b.readAt.localeCompare(a.readAt));
  return {
    readIds: all.map((item) => item.id),
    history: all.slice(0, HISTORY_LIMIT),
    synced: true,
  };
}

function markInMemory(actorId: string, entries: readonly NotificationReadInput[]) {
  const bucket = memoryBucket(actorId);
  const now = new Date().toISOString();
  for (const entry of entries) {
    const prev = bucket.get(entry.id);
    bucket.set(entry.id, {
      id: entry.id,
      woNo: entry.woNo ?? prev?.woNo ?? null,
      kind: entry.kind ?? prev?.kind ?? "assigned",
      title: entry.title ?? prev?.title ?? "แจ้งเตือนงาน",
      body: entry.body ?? prev?.body ?? "",
      href: entry.href ?? prev?.href ?? "/alerts",
      readAt: now,
    });
  }
  return {
    marked: entries.length,
    readIds: entries.map((e) => e.id),
    synced: true,
  };
}

/** Loads server-persisted read receipts and recent read history for the authenticated user. */
export async function loadNotificationReads(actorId: string): Promise<NotificationReadSnapshot> {
  if (!dbConfigured()) return loadFromMemory(actorId);
  const numericUserId = Number(actorId);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    return { readIds: [], history: [], synced: false };
  }

  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("userId", sql.BigInt, actorId)
      .input("limit", sql.Int, HISTORY_LIMIT)
      .query<{
        notification_id: string;
        wo_no: string | null;
        kind: string;
        title: string | null;
        body: string | null;
        href: string | null;
        read_at: Date;
      }>(`
        SELECT TOP (@limit)
          notification_id,
          wo_no,
          kind,
          title,
          body,
          href,
          read_at
        FROM dbo.notification_reads
        WHERE user_id = @userId
        ORDER BY read_at DESC
      `);

    const rows = result.recordset;
    const history: NotificationHistoryItem[] = rows
      .filter((row) => Boolean(row.title))
      .map((row) => ({
        id: row.notification_id,
        woNo: row.wo_no,
        kind: normalizeKind(row.kind),
        title: row.title ?? "แจ้งเตือนงาน",
        body: row.body ?? "",
        href: row.href ?? "/alerts",
        readAt: new Date(row.read_at).toISOString(),
      }));

    return {
      readIds: rows.map((row) => row.notification_id),
      history,
      synced: true,
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return { readIds: [], history: [], synced: false };
    }
    throw error;
  }
}

/** Persists read receipts (idempotent upsert) for the authenticated user in SQL Server. */
export async function markNotificationsRead(
  actorId: string,
  entries: readonly NotificationReadInput[],
): Promise<{ marked: number; readIds: string[]; synced: boolean }> {
  if (entries.length === 0) return { marked: 0, readIds: [], synced: true };
  if (!dbConfigured()) return markInMemory(actorId, entries);

  const numericUserId = Number(actorId);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    return { marked: 0, readIds: [], synced: false };
  }

  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();
    for (const entry of entries) {
      await new sql.Request(tx)
        .input("userId", sql.BigInt, actorId)
        .input("notificationId", sql.NVarChar(160), entry.id)
        .input("woNo", sql.NVarChar(80), entry.woNo ?? null)
        .input("kind", sql.VarChar(32), entry.kind ?? "assigned")
        .input("title", sql.NVarChar(200), entry.title ?? null)
        .input("body", sql.NVarChar(500), entry.body ?? null)
        .input("href", sql.NVarChar(300), entry.href ?? null)
        .query(`
          UPDATE dbo.notification_reads
             SET wo_no = COALESCE(@woNo, wo_no),
                 kind = COALESCE(@kind, kind),
                 title = COALESCE(@title, title),
                 body = COALESCE(@body, body),
                 href = COALESCE(@href, href),
                 read_at = SYSUTCDATETIME(),
                 updated_at = SYSUTCDATETIME()
           WHERE user_id = @userId
             AND notification_id = @notificationId;

          IF @@ROWCOUNT = 0
          BEGIN
            INSERT INTO dbo.notification_reads (
              user_id, notification_id, wo_no, kind, title, body, href, status, read_at, created_at, updated_at
            )
            VALUES (
              @userId, @notificationId, @woNo, @kind, @title, @body, @href, 'READ', SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME()
            );
          END
        `);
    }
    await tx.commit();
    return { marked: entries.length, readIds: entries.map((e) => e.id), synced: true };
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    if (isMissingTableError(error)) {
      return { marked: 0, readIds: [], synced: false };
    }
    throw error;
  }
}

export const defaultNotificationReadStore: NotificationReadStore = {
  load: loadNotificationReads,
  markRead: markNotificationsRead,
};
