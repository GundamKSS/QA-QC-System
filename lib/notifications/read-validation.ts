import type { NotificationKind, NotificationReadInput } from "./types";

const MAX_BATCH = 200;
const VALID_KINDS = new Set<NotificationKind>(["assigned", "returned", "qa_handover"]);

function clip(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function safeHref(value: unknown): string | null {
  const raw = clip(value, 300);
  if (!raw) return null;
  // Only allow same-site relative paths (never protocol-relative // or external URLs).
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

function safeKind(value: unknown): NotificationKind {
  return typeof value === "string" && VALID_KINDS.has(value as NotificationKind)
    ? (value as NotificationKind)
    : "assigned";
}

export type ParseReadPayloadResult =
  | { ok: true; entries: NotificationReadInput[] }
  | { ok: false; message: string };

/**
 * Normalizes payloads for POST /api/notifications/read.
 * Supports `{ items: [...] }`, `{ ids: [...] }`, or single `{ id: "..." }`.
 */
export function parseNotificationReadPayload(raw: unknown): ParseReadPayloadResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "ข้อมูลแจ้งเตือนไม่ถูกต้อง" };
  }
  const obj = raw as Record<string, unknown>;
  const collected: NotificationReadInput[] = [];

  if (Array.isArray(obj.items)) {
    for (const entry of obj.items) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const rec = entry as Record<string, unknown>;
      const id = clip(rec.id, 160);
      if (!id) continue;
      collected.push({
        id,
        woNo: clip(rec.woNo, 80),
        kind: safeKind(rec.kind),
        title: clip(rec.title, 200),
        body: clip(rec.body, 500),
        href: safeHref(rec.href),
      });
    }
  } else if (Array.isArray(obj.ids)) {
    for (const idRaw of obj.ids) {
      const id = clip(idRaw, 160);
      if (id) collected.push({ id });
    }
  } else if (typeof obj.id === "string") {
    const id = clip(obj.id, 160);
    if (id) {
      collected.push({
        id,
        woNo: clip(obj.woNo, 80),
        kind: safeKind(obj.kind),
        title: clip(obj.title, 200),
        body: clip(obj.body, 500),
        href: safeHref(obj.href),
      });
    }
  }

  // Deduplicate by id (preserve latest metadata in the batch)
  const unique = new Map<string, NotificationReadInput>();
  for (const entry of collected) {
    unique.set(entry.id, entry);
  }

  if (unique.size === 0) {
    return { ok: false, message: "ไม่พบรหัสแจ้งเตือนที่ต้องการบันทึกสถานะอ่านแล้ว" };
  }
  if (unique.size > MAX_BATCH) {
    return { ok: false, message: `บันทึกแจ้งเตือนได้ไม่เกิน ${MAX_BATCH} รายการต่อครั้ง` };
  }

  return { ok: true, entries: [...unique.values()] };
}

/** Merge server-synced read IDs with device-local receipts for currently active items. */
export function mergeActiveReadIds(
  serverIds: readonly string[] | undefined,
  localIds: ReadonlySet<string>,
  activeItems: readonly { id: string }[],
): Set<string> {
  const combined = new Set<string>(localIds);
  if (serverIds) {
    for (const id of serverIds) combined.add(id);
  }
  return new Set(activeItems.filter((item) => combined.has(item.id)).map((item) => item.id));
}
