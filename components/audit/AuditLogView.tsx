"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppBack } from "@/components/ui/AppBack";
import { CardsSkeleton } from "@/components/feedback/CardsSkeleton";
import { LoadError } from "@/components/feedback/LoadError";
import {
  AUDIT_ACTION_GROUPS,
  auditActionLabel,
  auditQueryString,
  type AuditActionGroup,
  type AuditLogItem,
  type AuditQuery,
} from "@/lib/audit/query";
import { useAuditLogs } from "./useAuditLogs";

function formatAuditTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function prettyJson(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function actionBadgeTone(action: string): string {
  if (action.includes("failure") || action.includes("lock") || action.includes("cancel") || action.includes("deactivate") || action.includes("disable") || action.includes("forbidden")) {
    return "border-rose-500/40 bg-rose-950/40 text-rose-200";
  }
  if (action.includes("success") || action.includes("open") || action.includes("create") || action.includes("activate") || action.includes("confirm") || action.includes("submit")) {
    return "border-emerald-500/40 bg-emerald-950/40 text-emerald-200";
  }
  if (action.includes("idle") || action.includes("return") || action.includes("rework") || action.includes("reset")) {
    return "border-amber-500/40 bg-amber-950/40 text-amber-200";
  }
  return "border-carbon-600 bg-carbon-900/70 text-ti-200";
}

function AuditRowCard({ item }: { item: AuditLogItem }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = Boolean(item.beforeJson || item.afterJson || item.detailJson || item.userAgent || item.deviceId);

  return (
    <li className="app-panel overflow-hidden rounded-panel border border-carbon-700 bg-carbon-800">
      <div className="flex flex-col gap-2.5 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${actionBadgeTone(item.action)}`}>
              {auditActionLabel(item.action)}
            </span>
            <span className="font-mono text-[11px] text-ti-400">{item.action}</span>
            {item.entityType && (
              <span className="rounded bg-carbon-900/80 px-2 py-0.5 font-mono text-[11px] text-ti-300">
                {item.entityType}
                {item.entityId ? `#${item.entityId}` : ""}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-medium text-ti-100">
              {item.actorName ? `${item.actorName} (${item.actorCode ?? "-"})` : (item.actorCode ?? "ไม่ระบุผู้ทำ")}
            </span>
            {item.ip && <span className="font-mono text-xs text-ti-400">IP: {item.ip}</span>}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
          <time dateTime={item.at} className="font-mono text-xs text-ti-400 whitespace-nowrap">
            {formatAuditTime(item.at)}
          </time>
          {hasDetails && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
              className="rounded-control border border-carbon-600 bg-carbon-900/70 px-2.5 py-1 text-xs text-ember-400 transition-colors hover:border-ember-400 hover:text-ember-300 cursor-pointer"
            >
              {expanded ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"}
            </button>
          )}
        </div>
      </div>

      {expanded && hasDetails && (
        <div className="space-y-3 border-t border-carbon-700/80 bg-carbon-900/50 p-4 text-xs">
          {(item.beforeJson || item.afterJson) && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 font-medium text-ti-400">ค่าเดิม (Before)</p>
                <pre className="max-h-56 overflow-auto rounded-lg border border-carbon-700 bg-carbon-950/80 p-3 font-mono text-[11px] text-ti-200">
                  {prettyJson(item.beforeJson) ?? "—"}
                </pre>
              </div>
              <div>
                <p className="mb-1 font-medium text-ti-400">ค่าใหม่ (After)</p>
                <pre className="max-h-56 overflow-auto rounded-lg border border-carbon-700 bg-carbon-950/80 p-3 font-mono text-[11px] text-emerald-200">
                  {prettyJson(item.afterJson) ?? "—"}
                </pre>
              </div>
            </div>
          )}

          {item.detailJson && (
            <div>
              <p className="mb-1 font-medium text-ti-400">ข้อมูลเพิ่มเติม (Detail)</p>
              <pre className="max-h-48 overflow-auto rounded-lg border border-carbon-700 bg-carbon-950/80 p-3 font-mono text-[11px] text-ti-200">
                {prettyJson(item.detailJson)}
              </pre>
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ti-400">
            <span>Log ID: #{item.id}</span>
            {item.deviceId && <span>Device: {item.deviceId}</span>}
            {item.userAgent && <span className="truncate max-w-full">UA: {item.userAgent}</span>}
          </div>
        </div>
      )}
    </li>
  );
}

export function AuditLogView({ query }: { query: AuditQuery }) {
  const router = useRouter();
  const { data, loading, error, reload } = useAuditLogs(query);

  const [q, setQ] = useState(query.q);
  const [group, setGroup] = useState<AuditActionGroup>(query.group);
  const [from, setFrom] = useState(query.from);
  const [to, setTo] = useState(query.to);

  function navigate(next: AuditQuery) {
    router.push(`/admin/audit${auditQueryString(next)}`);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    navigate({ q: q.trim(), group, from, to, page: 1 });
  }

  function handleReset() {
    setQ("");
    setGroup("");
    setFrom("");
    setTo("");
    navigate({ q: "", group: "", from: "", to: "", page: 1 });
  }

  const hasFilters = Boolean(query.q || query.group || query.from || query.to);

  return (
    <div className="min-w-0 w-full space-y-5 p-4 sm:p-6 lg:p-8">
      <AppBack href="/home">กลับหน้าหลัก</AppBack>

      <header className="space-y-2 border-b border-carbon-700/70 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p lang="en" className="font-mono text-xs tracking-[0.14em] text-ember-400 uppercase">
              Audit Trail · Append-Only
            </p>
            <h1 className="text-2xl font-medium text-ti-50">ประวัติการใช้งานระบบ (Audit Log)</h1>
            <p className="text-sm text-ti-400">
              บันทึกการเข้าสู่ระบบ การเปิด/แก้ไขแผน ใบงาน ผลตรวจ ข้อมูลหลัก และสิทธิ์ผู้ใช้ (แก้ไขหรือลบย้อนหลังไม่ได้)
            </p>
          </div>
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="app-metal-action min-h-10 rounded-control border border-carbon-600 bg-carbon-800 px-3.5 text-sm text-ti-200 transition-colors hover:border-ti-400 hover:text-ti-50 disabled:opacity-50 cursor-pointer"
          >
            {loading ? "กำลังโหลด…" : "รีเฟรช"}
          </button>
        </div>
      </header>

      {/* Filters */}
      <form
        onSubmit={handleSubmit}
        className="app-panel space-y-3 rounded-panel border border-carbon-700 bg-carbon-800 p-4"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label htmlFor="audit-q" className="mb-1 block text-xs text-ti-400">
              ค้นหา (รหัสพนักงาน / ชื่อ / Action / เลขรายการ / IP)
            </label>
            <input
              id="audit-q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={100}
              placeholder="เช่น TRW1001, F0001, plan.open, 192.168..."
              className="h-10 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 placeholder:text-ti-500 focus:border-ember-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="audit-group" className="mb-1 block text-xs text-ti-400">
              หมวดเหตุการณ์
            </label>
            <select
              id="audit-group"
              value={group}
              onChange={(e) => setGroup(e.target.value as AuditActionGroup)}
              className="h-10 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 focus:border-ember-500 focus:outline-none"
            >
              {AUDIT_ACTION_GROUPS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="audit-from" className="mb-1 block text-xs text-ti-400">
                ตั้งแต่วันที่
              </label>
              <input
                id="audit-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-10 w-full rounded-control border border-carbon-600 bg-carbon-900 px-2 text-xs text-ti-50 focus:border-ember-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="audit-to" className="mb-1 block text-xs text-ti-400">
                ถึงวันที่
              </label>
              <input
                id="audit-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-10 w-full rounded-control border border-carbon-600 bg-carbon-900 px-2 text-xs text-ti-50 focus:border-ember-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="text-xs text-ti-400">
            {data
              ? `พบทั้งหมด ${data.total.toLocaleString("th-TH")} รายการ (หน้า ${data.page} / ${data.totalPages})`
              : "กำลังโหลดรายการ…"}
          </p>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <button
                type="button"
                onClick={handleReset}
                className="min-h-9 rounded-control border border-carbon-600 px-3 text-xs text-ti-300 hover:border-ti-400 hover:text-ti-50 cursor-pointer"
              >
                ล้างตัวกรอง
              </button>
            )}
            <button
              type="submit"
              className="min-h-9 rounded-control bg-ember-500 px-4 text-xs font-semibold text-carbon-950 transition-colors hover:bg-ember-400 cursor-pointer"
            >
              ค้นหา
            </button>
          </div>
        </div>
      </form>

      {error && <LoadError message={error} onRetry={reload} />}

      {loading && !data ? (
        <CardsSkeleton label="กำลังโหลดประวัติการใช้งานระบบ" />
      ) : data && !data.dbAvailable ? (
        <div className="app-panel rounded-panel border border-amber-500/40 bg-carbon-800 p-6 text-center text-sm text-amber-200">
          โหมดสาธิตไม่มีฐานข้อมูล SQL Server — Audit Log จะแสดงรายการเมื่อเชื่อมต่อฐานข้อมูลจริง
        </div>
      ) : data && data.items.length > 0 ? (
        <div className={`space-y-4 ${loading ? "opacity-60 transition-opacity" : ""}`}>
          <ul aria-label="รายการประวัติการใช้งาน" className="space-y-3">
            {data.items.map((item) => (
              <AuditRowCard key={item.id} item={item} />
            ))}
          </ul>

          {data.totalPages > 1 && (
            <nav aria-label="แบ่งหน้า Audit Log" className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                disabled={data.page <= 1}
                onClick={() => navigate({ ...query, page: data.page - 1 })}
                className="min-h-10 rounded-control border border-carbon-600 bg-carbon-800 px-4 text-sm text-ti-200 hover:border-ti-400 disabled:cursor-default disabled:opacity-40 cursor-pointer"
              >
                ← หน้าก่อนหน้า
              </button>
              <span className="font-mono text-xs text-ti-400">
                หน้า {data.page} / {data.totalPages}
              </span>
              <button
                type="button"
                disabled={data.page >= data.totalPages}
                onClick={() => navigate({ ...query, page: data.page + 1 })}
                className="min-h-10 rounded-control border border-carbon-600 bg-carbon-800 px-4 text-sm text-ti-200 hover:border-ti-400 disabled:cursor-default disabled:opacity-40 cursor-pointer"
              >
                หน้าถัดไป →
              </button>
            </nav>
          )}
        </div>
      ) : !error ? (
        <div className="app-panel rounded-panel border border-carbon-700 bg-carbon-800 px-6 py-12 text-center">
          <h2 className="text-base font-medium text-ti-100">ไม่พบรายการที่ตรงกับเงื่อนไข</h2>
          <p className="mt-1 text-sm text-ti-400">ลองเปลี่ยนคำค้นหาหรือช่วงวันที่เพื่อดูประวัติเพิ่มเติม</p>
        </div>
      ) : null}
    </div>
  );
}
