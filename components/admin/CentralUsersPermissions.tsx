"use client";

import { useMemo, useState, useTransition } from "react";
import { CardsSkeleton } from "@/components/feedback/CardsSkeleton";
import { LoadError } from "@/components/feedback/LoadError";
import { useApiCall } from "@/lib/api/client";
import { roleLabels } from "@/lib/config/experience";
import { PROGRAM_ROLES, ROLES, type ProgramRole, type Role } from "@/lib/auth/types";
import type { CentralUserItem } from "@/lib/db/central-users";
import { GrantCentralUserForm } from "./GrantCentralUserForm";
import { useCentralUsers } from "./useCentralUsers";

const when = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" });
const whenFull = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

const LEVEL_STYLES: Record<ProgramRole, { badge: string; avatar: string; label: string }> = {
  DEV: {
    badge: "bg-purple-600/12 text-purple-800",
    avatar: "bg-purple-600/12 text-purple-800",
    label: "Dev",
  },
  ADMIN: {
    badge: "bg-ember-500/14 text-ember-300",
    avatar: "bg-ember-500/14 text-ember-300",
    label: "Admin",
  },
  USER: {
    badge: "bg-sky-500/12 text-sky-200",
    avatar: "bg-carbon-900 text-ti-200 border border-carbon-700/70",
    label: "User",
  },
};

type SaveResponse =
  | { status: "done"; message: string; roles: Role[]; programRole?: ProgramRole | null }
  | { status: "error"; message: string };

type Props = {
  canGrantDev: boolean;
};

function initialOf(name: string, code: string) {
  const clean = name.replace(/^(นาย|นางสาว|นาง|น\.ส\.)\s*/u, "").trim();
  return (clean || code).slice(0, 1).toUpperCase();
}

/**
 * Minimalist central users permission manager:
 * - Single clean toolbar (search + filter pills + "+ เพิ่มผู้ใช้" modal trigger)
 * - Scannable paper list with progressive disclosure (click any row to edit level & sub-roles inline)
 */
export function CentralUsersPermissions({ canGrantDev }: Props) {
  const { data, loading, error, reload } = useCentralUsers();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "USER" | "ADMIN" | "DEV">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const users = data?.users ?? null;

  const filtered = useMemo(() => {
    if (!users) return null;
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === "pending") {
        if (u.programRole === "DEV" || u.roles.length > 0) return false;
      } else if (filter !== "all" && u.programRole !== filter) {
        return false;
      }
      if (!q) return true;
      return (
        u.employeeCode.toLowerCase().includes(q) ||
        u.fullName.toLowerCase().includes(q) ||
        (u.email?.toLowerCase().includes(q) ?? false) ||
        (u.department?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [users, search, filter]);

  const pendingCount = useMemo(
    () => (users ? users.filter((u) => u.programRole !== "DEV" && u.roles.length === 0).length : 0),
    [users],
  );

  return (
    <div className="space-y-4">
      {/* Unified minimalist toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ti-500"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ หรือ รหัสพนักงาน…"
            className="h-10 w-full rounded-xl border border-carbon-700/80 pl-9 pr-3.5 text-sm text-ti-50 placeholder:text-ti-500"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            setToast(null);
            setModalOpen(true);
          }}
          className="h-10 shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl app-primary-action bg-ember-500 hover:bg-ember-400 px-4 text-sm font-medium transition-colors cursor-pointer"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>เพิ่มผู้ใช้</span>
        </button>
      </div>

      {/* Quiet filter strip */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            { key: "all", label: "ทั้งหมด", count: users?.length },
            { key: "pending", label: "รอกำหนดสิทธิ์", count: pendingCount, warn: pendingCount > 0 },
            { key: "USER", label: "User" },
            { key: "ADMIN", label: "Admin" },
            { key: "DEV", label: "Dev" },
          ] as const
        ).map((tab) => {
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`h-8 inline-flex items-center gap-1.5 rounded-full px-3 text-xs transition-colors cursor-pointer ${
                active
                  ? "bg-ti-50 text-carbon-800 font-medium"
                  : "text-ti-300 hover:bg-carbon-800/80 hover:text-ti-50"
              }`}
            >
              <span>{tab.label}</span>
              {"count" in tab && typeof tab.count === "number" && (
                <span
                  className={`text-[11px] tabular-nums ${
                    active
                      ? "opacity-80"
                      : "warn" in tab && tab.warn
                        ? "rounded-full bg-amber-500/20 px-1.5 text-amber-300 font-semibold"
                        : "text-ti-500"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Subtle toast after adding a user */}
      {toast && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-pass/35 bg-pass/10 px-4 py-2.5 text-xs font-medium text-pass"
        >
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="opacity-70 hover:opacity-100 cursor-pointer"
            aria-label="ปิดข้อความ"
          >
            ✕
          </button>
        </div>
      )}

      {error && <LoadError message={error} onRetry={reload} />}

      {filtered === null ? (
        !error && <CardsSkeleton label="กำลังโหลดรายชื่อผู้ใช้" />
      ) : filtered.length === 0 ? (
        <div className="app-panel rounded-2xl border border-carbon-700/80 bg-carbon-800 py-12 text-center space-y-2">
          <p className="text-sm text-ti-300">
            {users && users.length > 0 ? "ไม่พบผู้ใช้ที่ค้นหา" : "ยังไม่มีผู้ใช้ระบบกลาง"}
          </p>
          {(!users || users.length === 0) && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="text-xs font-medium text-ember-400 hover:underline cursor-pointer"
            >
              + เพิ่มผู้ใช้คนแรก
            </button>
          )}
        </div>
      ) : (
        <ul
          aria-busy={loading}
          className={`app-panel rounded-2xl border border-carbon-700/80 bg-carbon-800 divide-y divide-carbon-700/50 overflow-hidden transition-opacity ${
            loading ? "opacity-60" : ""
          }`}
        >
          {filtered.map((user) => (
            <CentralUserRow
              key={user.id}
              user={user}
              expanded={expandedId === user.id}
              onToggleExpand={() => setExpandedId((prev) => (prev === user.id ? null : user.id))}
              canGrantDev={canGrantDev}
            />
          ))}
        </ul>
      )}

      <GrantCentralUserForm
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onGranted={(msg) => setToast(msg)}
        canGrantDev={canGrantDev}
      />
    </div>
  );
}

function CentralUserRow({
  user,
  expanded,
  onToggleExpand,
  canGrantDev,
}: {
  user: CentralUserItem;
  expanded: boolean;
  onToggleExpand: () => void;
  canGrantDev: boolean;
}) {
  const [syncedAt, setSyncedAt] = useState(user.updatedAt);
  const [selected, setSelected] = useState<Role[]>(user.roles);
  const [programRole, setProgramRole] = useState<ProgramRole>(user.programRole ?? "USER");
  if (syncedAt !== user.updatedAt) {
    setSyncedAt(user.updatedAt);
    setSelected(user.roles);
    setProgramRole(user.programRole ?? "USER");
  }
  const [feedback, setFeedback] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [callSave, settling] = useApiCall<SaveResponse>(
    `/api/admin/central-users/${user.id}/roles`,
    (message) => ({ status: "error", message }),
    "PATCH",
  );
  const pending = saving || settling;

  const isDevTarget = user.programRole === "DEV";
  const canEditProgramRole = canGrantDev || !isDevTarget;
  const editableProgramRoles: readonly ProgramRole[] = canGrantDev
    ? PROGRAM_ROLES
    : PROGRAM_ROLES.filter((r) => r !== "DEV");

  const effectiveIsDev = programRole === "DEV";
  const style = user.programRole ? LEVEL_STYLES[user.programRole] : LEVEL_STYLES.USER;
  const rolesDirty =
    selected.length !== user.roles.length || selected.some((r) => !user.roles.includes(r));
  const programRoleDirty = user.programRole !== null && programRole !== user.programRole;
  const dirty = rolesDirty || programRoleDirty;

  function toggleRole(role: Role) {
    setFeedback(null);
    setSelected((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function handleSave() {
    setFeedback(null);
    const fd = new FormData();
    if (programRoleDirty) fd.set("programRole", programRole);
    for (const role of selected) fd.append("roles", role);
    startSaving(async () => {
      const res = await callSave(fd);
      if (res.status === "done") {
        setFeedback({ tone: "ok", text: "บันทึกแล้ว" });
      } else {
        setFeedback({ tone: "err", text: res.message });
      }
    });
  }

  const meta = [user.department, user.email, user.lastLoginAt ? `ล่าสุด ${whenFull.format(new Date(user.lastLoginAt))}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li>
      {/* Collapsed summary row — click anywhere to expand */}
      <button
        type="button"
        onClick={() => {
          setFeedback(null);
          onToggleExpand();
        }}
        aria-expanded={expanded}
        className={`w-full px-4 sm:px-5 py-3.5 text-left flex items-center gap-3.5 transition-colors cursor-pointer ${
          expanded ? "bg-carbon-900/45" : "hover:bg-carbon-900/35"
        }`}
      >
        <span
          className={`size-9 shrink-0 rounded-full text-xs font-semibold inline-flex items-center justify-center ${style.avatar}`}
        >
          {initialOf(user.fullName, user.employeeCode)}
        </span>

        <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-ti-50 truncate">{user.fullName}</span>
              {user.programRole && (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.badge}`}>
                  {style.label}
                </span>
              )}
            </div>
            <p className="text-xs text-ti-400 truncate mt-0.5">
              <span className="font-mono">{user.employeeCode}</span>
              {user.department ? ` · ${user.department}` : ""}
            </p>
          </div>

          {/* Read-only role pills */}
          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
            {isDevTarget ? (
              <span className="rounded-full bg-purple-600/10 px-2.5 py-0.5 text-[11px] font-medium text-purple-800">
                ทุกหน้า
              </span>
            ) : user.roles.length === 0 ? (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
                รอกำหนดสิทธิ์
              </span>
            ) : (
              user.roles.map((role) => (
                <span
                  key={role}
                  className="rounded-full bg-carbon-900/90 border border-carbon-700/60 px-2.5 py-0.5 text-[11px] text-ti-200"
                >
                  {roleLabels[role] ?? role}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="hidden md:block shrink-0 text-right w-20 text-[11px] text-ti-500 tabular-nums">
          {user.lastLoginAt ? when.format(new Date(user.lastLoginAt)) : "—"}
        </div>

        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`shrink-0 text-ti-500 transition-transform duration-200 ${expanded ? "rotate-180 text-ti-100" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Progressive disclosure inline editor */}
      {expanded && (
        <div className="px-4 sm:px-5 pb-4 pt-3 bg-carbon-900/45 border-t border-carbon-700/40 space-y-4">
          {meta && <p className="text-xs text-ti-400">{meta}</p>}

          {canEditProgramRole && user.programRole && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium text-ti-300 w-16 shrink-0">ระดับหลัก</span>
              <div className="inline-flex rounded-xl bg-carbon-900 p-0.5 border border-carbon-700/70 gap-0.5">
                {editableProgramRoles.map((level) => {
                  const active = programRole === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setProgramRole(level);
                        setFeedback(null);
                      }}
                      className={`h-7 rounded-lg px-3 text-xs font-medium transition-all cursor-pointer ${
                        active
                          ? "bg-carbon-800 text-ti-50 shadow-sm ring-1 ring-carbon-700/70"
                          : "text-ti-400 hover:text-ti-100"
                      }`}
                    >
                      {LEVEL_STYLES[level].label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {effectiveIsDev ? (
            <p className="text-xs font-medium text-purple-800">
              ระดับ Dev เห็นทุกหน้าและทุกฟีเจอร์อัตโนมัติ
            </p>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-start gap-2.5 sm:gap-3">
              <span className="text-xs font-medium text-ti-300 sm:w-16 sm:pt-1.5 shrink-0">สิทธิ์ย่อย</span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {ROLES.map((role) => {
                  const active = selected.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      disabled={pending}
                      onClick={() => toggleRole(role)}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-all cursor-pointer ${
                        active
                          ? "border-ember-500/70 bg-ember-500/12 text-ember-200 font-medium"
                          : "border-carbon-700/80 bg-[#fffdf6] text-ti-300 hover:border-carbon-500"
                      }`}
                    >
                      {active && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                      <span>{roleLabels[role] ?? role}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="min-h-5">
              {feedback && (
                <span
                  role="status"
                  className={`text-xs font-medium ${feedback.tone === "ok" ? "text-pass" : "text-fail"}`}
                >
                  {feedback.tone === "ok" ? "✓ " : ""}
                  {feedback.text}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {dirty && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setProgramRole(user.programRole ?? "USER");
                    setSelected(user.roles);
                    setFeedback(null);
                  }}
                  className="h-8 rounded-xl px-3 text-xs font-medium text-ti-300 hover:bg-carbon-800 hover:text-ti-50 transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
              )}
              <button
                type="button"
                disabled={!dirty || pending}
                onClick={handleSave}
                className="h-8 rounded-xl app-primary-action bg-ember-500 hover:bg-ember-400 disabled:opacity-35 disabled:cursor-not-allowed px-4 text-xs font-medium transition-colors cursor-pointer"
              >
                {pending ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
