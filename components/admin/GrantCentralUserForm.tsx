"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useApiCall } from "@/lib/api/client";
import { readApi } from "@/lib/api/read";
import { PROGRAM_ROLES, ROLES, type ProgramRole, type Role } from "@/lib/auth/types";
import { roleLabels } from "@/lib/config/experience";
import type { DatacenterEmployeeMatch, DatacenterEmployeesPayload } from "@/lib/db/central-users";

type GrantResponse =
  | { status: "done"; message: string; user?: { id: string; employeeCode: string; fullName: string } }
  | { status: "error"; message: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onGranted: (message: string) => void;
  canGrantDev: boolean;
};

const LEVEL_LABEL: Record<ProgramRole, string> = {
  USER: "User",
  ADMIN: "Admin",
  DEV: "Dev",
};

function initialOf(name: string, code: string) {
  const clean = name.replace(/^(นาย|นางสาว|นาง|น\.ส\.)\s*/u, "").trim();
  return (clean || code).slice(0, 1).toUpperCase();
}

/**
 * Minimalist modal to search `DATA_CENTER.dbo.Employee`, grant `ProgramPermission (ProgramID = 3)`,
 * and assign QCheck sub-roles (`dbo.user_roles`) in one calm flow.
 */
export function GrantCentralUserForm({ open, onClose, onGranted, canGrantDev }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState<{
    query: string;
    matches: DatacenterEmployeeMatch[];
    error: string | null;
  } | null>(null);

  const [selectedEmp, setSelectedEmp] = useState<DatacenterEmployeeMatch | null>(null);
  const [programRole, setProgramRole] = useState<ProgramRole>("USER");
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [saving, startSaving] = useTransition();
  const [callGrant, settling] = useApiCall<GrantResponse>(
    "/api/admin/central-users",
    (message) => ({ status: "error", message }),
    "POST",
  );
  const pending = saving || settling;

  const allowedProgramRoles: readonly ProgramRole[] = canGrantDev
    ? PROGRAM_ROLES
    : PROGRAM_ROLES.filter((r) => r !== "DEV");

  const trimmedQuery = query.trim();
  const shouldSearch = open && !selectedEmp && trimmedQuery.length >= 2;
  const searching = shouldSearch && settled?.query !== trimmedQuery;
  const matches = shouldSearch && settled?.query === trimmedQuery ? settled.matches : [];
  const searchError = shouldSearch && settled?.query === trimmedQuery ? settled.error : null;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(frame);
    };
  }, [open, pending, onClose]);

  useEffect(() => {
    if (!shouldSearch) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const res = await readApi<DatacenterEmployeesPayload>(
        `/api/admin/central-users/employees?q=${encodeURIComponent(trimmedQuery)}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (res.ok) {
        setSettled({ query: trimmedQuery, matches: res.data.employees, error: null });
      } else {
        setSettled({ query: trimmedQuery, matches: [], error: res.message });
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery, shouldSearch]);

  if (!open || typeof document === "undefined") return null;

  function pickEmployee(emp: DatacenterEmployeeMatch) {
    setSelectedEmp(emp);
    setErrorMsg(null);
    const initialProgramRole: ProgramRole =
      emp.programRole && (canGrantDev || emp.programRole !== "DEV") ? emp.programRole : "USER";
    setProgramRole(initialProgramRole);
    setSelectedRoles(emp.roles);
  }

  function resetAndClose() {
    if (pending) return;
    setSelectedEmp(null);
    setQuery("");
    setSettled(null);
    setProgramRole("USER");
    setSelectedRoles([]);
    setErrorMsg(null);
    onClose();
  }

  function toggleRole(role: Role) {
    setErrorMsg(null);
    setSelectedRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function handleSubmit() {
    if (!selectedEmp) return;
    setErrorMsg(null);
    const fd = new FormData();
    fd.set("employeeCode", selectedEmp.employeeCode);
    fd.set("programRole", programRole);
    if (programRole !== "DEV") {
      for (const role of selectedRoles) fd.append("roles", role);
    }

    startSaving(async () => {
      const res = await callGrant(fd);
      if (res.status === "done") {
        setSelectedEmp(null);
        setQuery("");
        setSettled(null);
        setProgramRole("USER");
        setSelectedRoles([]);
        onGranted(res.message);
        onClose();
      } else {
        setErrorMsg(res.message);
      }
    });
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="grant-modal-title"
      className="app-theme-sand !bg-none fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#263c2e]/35 backdrop-blur-[4px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) resetAndClose();
      }}
    >
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-carbon-700 bg-carbon-800 shadow-2xl overflow-hidden flex flex-col max-h-[88dvh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-carbon-700/60">
          <h2 id="grant-modal-title" className="text-base font-semibold text-ti-50">
            เพิ่มผู้ใช้ระบบกลาง
          </h2>
          <button
            type="button"
            disabled={pending}
            onClick={resetAndClose}
            aria-label="ปิดหน้าต่าง"
            className="size-8 inline-flex items-center justify-center rounded-full text-ti-400 hover:bg-carbon-900 hover:text-ti-50 transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {errorMsg && (
            <p role="alert" className="rounded-xl border border-fail/40 bg-fail/10 px-3.5 py-2.5 text-xs text-fail">
              {errorMsg}
            </p>
          )}

          {!selectedEmp ? (
            <div className="space-y-3">
              <div className="relative">
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
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ti-500"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="พิมพ์รหัสพนักงาน หรือ ชื่อ-นามสกุล…"
                  className="h-11 w-full rounded-xl border border-carbon-600/80 pl-10 pr-4 text-sm text-ti-50 placeholder:text-ti-500"
                />
              </div>

              {trimmedQuery.length < 2 && (
                <p className="py-6 text-center text-xs text-ti-400">
                  พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหาพนักงาน
                </p>
              )}

              {searching && (
                <p className="py-6 text-center text-xs text-ti-400">กำลังค้นหา…</p>
              )}

              {searchError && (
                <p className="py-4 text-center text-xs text-fail">{searchError}</p>
              )}

              {!searching && trimmedQuery.length >= 2 && matches.length === 0 && !searchError && (
                <p className="py-6 text-center text-xs text-ti-400">
                  ไม่พบพนักงาน &ldquo;{trimmedQuery}&rdquo;
                </p>
              )}

              {matches.length > 0 && (
                <ul className="divide-y divide-carbon-700/50 rounded-xl border border-carbon-700/80 bg-[#fffdf6] overflow-hidden">
                  {matches.map((emp) => (
                    <li key={emp.employeeCode}>
                      <button
                        type="button"
                        onClick={() => pickEmployee(emp)}
                        className="w-full px-3.5 py-2.5 text-left hover:bg-carbon-900/70 transition-colors flex items-center gap-3 cursor-pointer"
                      >
                        <span className="size-8 shrink-0 rounded-full bg-carbon-900 border border-carbon-700/70 text-xs font-semibold text-ti-200 inline-flex items-center justify-center">
                          {initialOf(emp.fullName, emp.employeeCode)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium text-ti-50 truncate">{emp.fullName}</span>
                            <span className="font-mono text-[11px] text-ti-400 shrink-0">{emp.employeeCode}</span>
                          </div>
                          {emp.jobTitle && <p className="text-xs text-ti-400 truncate">{emp.jobTitle}</p>}
                        </div>
                        {emp.hasProgramPermission && (
                          <span className="shrink-0 rounded-full bg-sky-500/12 px-2 py-0.5 text-[11px] font-medium text-sky-200">
                            {emp.programRole ?? "มีสิทธิ์"}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Selected employee */}
              <div className="flex items-center gap-3 rounded-xl bg-carbon-900/80 border border-carbon-700/70 px-3.5 py-3">
                <span className="size-9 shrink-0 rounded-full bg-ember-500/15 text-sm font-semibold text-ember-400 inline-flex items-center justify-center">
                  {initialOf(selectedEmp.fullName, selectedEmp.employeeCode)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ti-50 truncate">{selectedEmp.fullName}</p>
                  <p className="text-xs text-ti-400 truncate">
                    <span className="font-mono">{selectedEmp.employeeCode}</span>
                    {selectedEmp.jobTitle ? ` · ${selectedEmp.jobTitle}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setSelectedEmp(null);
                    setErrorMsg(null);
                  }}
                  className="text-xs font-medium text-ember-400 hover:underline px-2 py-1 cursor-pointer"
                >
                  เปลี่ยน
                </button>
              </div>

              {/* Level segmented control */}
              <div className="space-y-2">
                <span className="block text-xs font-medium text-ti-300">ระดับหลัก</span>
                <div className="inline-flex rounded-xl bg-carbon-900 p-1 border border-carbon-700/70 gap-1">
                  {allowedProgramRoles.map((level) => {
                    const active = programRole === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setProgramRole(level);
                          setErrorMsg(null);
                        }}
                        className={`h-8 rounded-lg px-4 text-xs font-medium transition-all cursor-pointer ${
                          active
                            ? "bg-carbon-800 text-ti-50 shadow-sm ring-1 ring-carbon-700/70"
                            : "text-ti-400 hover:text-ti-100"
                        }`}
                      >
                        {LEVEL_LABEL[level]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sub-roles */}
              {programRole === "DEV" ? (
                <p className="rounded-xl bg-purple-600/8 border border-purple-600/25 px-3.5 py-2.5 text-xs font-medium text-purple-800">
                  ระดับ Dev เห็นทุกหน้าและทุกฟีเจอร์อัตโนมัติ
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-ti-300">สิทธิ์ย่อยในโปรแกรม</span>
                    <span className="text-[11px] text-ti-400">เลือกแล้ว {selectedRoles.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ROLES.map((role) => {
                      const active = selectedRoles.includes(role);
                      return (
                        <button
                          key={role}
                          type="button"
                          disabled={pending}
                          onClick={() => toggleRole(role)}
                          aria-pressed={active}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all cursor-pointer ${
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
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {selectedEmp && (
          <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-carbon-700/60 bg-carbon-900/40">
            <button
              type="button"
              disabled={pending}
              onClick={resetAndClose}
              className="h-9 rounded-xl px-4 text-xs font-medium text-ti-300 hover:bg-carbon-900 hover:text-ti-50 transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={handleSubmit}
              className="h-9 rounded-xl app-primary-action bg-ember-500 hover:bg-ember-400 disabled:opacity-40 px-5 text-xs font-medium transition-colors cursor-pointer"
            >
              {pending ? "กำลังบันทึก…" : "บันทึกสิทธิ์"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
