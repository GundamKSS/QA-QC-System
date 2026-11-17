"use client";

import { useEffect, useState } from "react";
import { useApiRead } from "@/lib/api/client";
import type { InspectionRole } from "@/lib/inspections/types";
import type { ModelChecklistHistoryPayload } from "@/lib/master/model-checklist-types";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  templateId?: number;
  modelId?: number;
  role: InspectionRole;
  modelCode: string;
  modelDescription?: string | null;
  currentVersionNo: number;
};

export function ModelChecklistHistoryDrawer(props: Props) {
  if (!props.isOpen) return null;
  return <DrawerContent {...props} />;
}

function DrawerContent({
  onClose,
  templateId,
  modelId,
  role,
  modelCode,
  modelDescription,
  currentVersionNo,
}: Props) {
  const [activeTab, setActiveTab] = useState<"versions" | "audit">("versions");
  const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null);

  // Close on Escape key press
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const queryParam = templateId
    ? `templateId=${templateId}&role=${role}`
    : `modelId=${modelId ?? 0}&role=${role}`;
  const { data, loading, error, reload } = useApiRead<ModelChecklistHistoryPayload>(
    `/api/master/model-checklists?history=1&${queryParam}`,
  );

  // Default expand latest version on load if not set
  const firstVersionId = data?.versions[0]?.versionId;
  const activeExpandedId = expandedVersionId ?? firstVersionId ?? null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-drawer-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-carbon-950/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-0 sm:pl-10">
        <div className="w-screen max-w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl 2xl:max-w-4xl bg-carbon-850 border-l border-carbon-700 shadow-2xl flex flex-col min-h-full">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-carbon-700 bg-carbon-800/80">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-ember-500/20 border border-ember-500/40 px-2 py-0.5 font-mono text-xs font-bold text-ember-300">
                    {modelCode}
                  </span>
                  <span className="rounded bg-carbon-700 px-2 py-0.5 text-xs text-ti-200">
                    ฝั่ง {role}
                  </span>
                  <span className="rounded bg-pass/15 border border-pass/30 px-2 py-0.5 font-mono text-xs text-pass">
                    ปัจจุบัน v{currentVersionNo}
                  </span>
                </div>
                <h2 id="history-drawer-title" className="text-base sm:text-lg font-bold text-ti-50 truncate">
                  ประวัติเวอร์ชันและบันทึกการแก้ไข
                </h2>
                {modelDescription && (
                  <p className="text-xs text-ti-300 line-clamp-1">{modelDescription}</p>
                )}
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="w-10 h-10 -mr-1 -mt-1 flex items-center justify-center rounded-control hover:bg-carbon-700 text-ti-400 hover:text-ti-100 transition-colors"
                aria-label="ปิดประวัติ"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 mt-4 pt-2 border-t border-carbon-700/60">
              <button
                type="button"
                onClick={() => setActiveTab("versions")}
                className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === "versions"
                    ? "bg-ember-500 text-carbon-900 shadow-sm"
                    : "bg-carbon-750 text-ti-300 hover:text-ti-100"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>ไทม์ไลน์เวอร์ชัน ({data?.versions.length ?? 0})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("audit")}
                className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === "audit"
                    ? "bg-ember-500 text-carbon-900 shadow-sm"
                    : "bg-carbon-750 text-ti-300 hover:text-ti-100"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Audit Logs ({data?.auditLogs.length ?? 0})</span>
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {loading && !data && (
              <div className="space-y-3 py-6">
                <div className="h-20 rounded-panel bg-carbon-800 animate-pulse border border-carbon-700" />
                <div className="h-20 rounded-panel bg-carbon-800 animate-pulse border border-carbon-700" />
                <div className="h-20 rounded-panel bg-carbon-800 animate-pulse border border-carbon-700" />
                <p className="text-center text-xs text-ti-400">กำลังดึงข้อมูลประวัติเวอร์ชันและ Audit Logs…</p>
              </div>
            )}

            {error && (
              <div className="rounded-panel border border-fail/50 bg-fail/10 p-4 text-xs text-fail space-y-2">
                <p className="font-semibold">ไม่สามารถโหลดประวัติได้: {error}</p>
                <button
                  type="button"
                  onClick={reload}
                  className="rounded bg-carbon-800 px-3 py-1 text-ti-200 hover:text-ti-50 border border-carbon-700"
                >
                  ลองใหม่อีกครั้ง
                </button>
              </div>
            )}

            {!loading && !error && data && (
              <>
                {/* TAB 1: VERSION TIMELINE */}
                {activeTab === "versions" && (
                  <div className="space-y-3">
                    {data.versions.length === 0 ? (
                      <div className="rounded-panel border border-carbon-700 bg-carbon-800/50 p-6 text-center text-xs text-ti-400">
                        ยังไม่มีบันทึกเวอร์ชันก่อนหน้าในระบบ
                      </div>
                    ) : (
                      data.versions.map((ver) => {
                        const isCurrent = ver.versionNo === currentVersionNo;
                        const isExpanded = activeExpandedId === ver.versionId;

                        return (
                          <div
                            key={ver.versionId}
                            className={`rounded-panel border transition-all ${
                              isCurrent
                                ? "border-ember-500/50 bg-carbon-800/90 shadow-sm"
                                : "border-carbon-700 bg-carbon-800/40 hover:border-carbon-600"
                            }`}
                          >
                            {/* Version Card Header */}
                            <div className="p-3.5 sm:p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-2.5 py-1 rounded font-mono text-xs font-bold ${
                                      isCurrent
                                        ? "bg-ember-500 text-carbon-900"
                                        : "bg-carbon-700 text-ti-100"
                                    }`}
                                  >
                                    v{ver.versionNo}
                                  </span>
                                  {isCurrent && (
                                    <span className="rounded-full bg-pass/20 border border-pass/40 px-2 py-0.5 text-[10px] font-semibold text-pass">
                                      เวอร์ชันที่ใช้งานปัจจุบัน
                                    </span>
                                  )}
                                  <span className="text-xs text-ti-400">
                                    · {ver.itemCount} ขั้นตอน
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedVersionId(isExpanded ? 0 : ver.versionId)
                                  }
                                  className="text-xs text-ember-400 hover:text-ember-300 font-medium inline-flex items-center gap-1"
                                >
                                  <span>{isExpanded ? "ซ่อนขั้นตอน" : "ดูข้อตรวจ"}</span>
                                  <svg
                                    className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                              </div>

                              <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-ti-300">
                                <div>
                                  <span className="text-ti-400">เผยแพร่เมื่อ: </span>
                                  <span className="font-mono text-ti-200">
                                    {ver.publishedAt
                                      ? new Date(ver.publishedAt).toLocaleString("th-TH", {
                                          year: "numeric",
                                          month: "short",
                                          day: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })
                                      : "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-ti-400">ผู้เผยแพร่: </span>
                                  <span className="text-ti-200">
                                    {ver.publishedByName ?? ver.publishedByCode ?? "ระบบ (System Seed)"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Collapsible Step Items List */}
                            {isExpanded && (
                              <div className="border-t border-carbon-700/70 bg-carbon-900/60 p-3 sm:p-4 space-y-2">
                                <h4 className="text-xs font-semibold text-ti-200">
                                  รายการข้อตรวจในเวอร์ชัน v{ver.versionNo}
                                </h4>
                                <ul className="divide-y divide-carbon-800 text-xs">
                                  {ver.items.map((item) => (
                                    <li key={item.seq} className="py-2 first:pt-0 last:pb-0 flex items-start gap-2.5">
                                      <span className="w-5 h-5 rounded-full bg-carbon-700 flex items-center justify-center font-mono text-[10px] text-ti-300 shrink-0 mt-0.5">
                                        {item.seq}
                                      </span>
                                      <div className="min-w-0 flex-1 space-y-0.5">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          {item.topicCode && (
                                            <span className="font-mono text-[10px] text-ember-400/90 bg-carbon-800 px-1.5 py-0.2 rounded border border-carbon-700">
                                              {item.topicCode}
                                            </span>
                                          )}
                                          <span className="font-medium text-ti-100">{item.title}</span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-ti-400">
                                          <span>ชนิด: {item.inputType}</span>
                                          {item.isRequired && <span className="text-ember-400">· บังคับตรวจ</span>}
                                          {item.photoRule !== "NONE" && <span>· รูป: {item.photoRule}</span>}
                                          {item.videoRule !== "NONE" && <span>· วิดีโอ: {item.videoRule}</span>}
                                        </div>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* TAB 2: AUDIT LOGS */}
                {activeTab === "audit" && (
                  <div className="space-y-3">
                    <div className="rounded-panel border border-carbon-700 bg-carbon-800/40 p-3 text-xs text-ti-300 flex items-center gap-2">
                      <svg className="w-4 h-4 text-ember-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>บันทึกตาราง <code className="text-ti-100 font-mono">dbo.audit_logs</code> แบบ Append-only ป้องกันการแก้ไขหรือลบย้อนหลัง</span>
                    </div>

                    {data.auditLogs.length === 0 ? (
                      <div className="rounded-panel border border-carbon-700 bg-carbon-800/50 p-6 text-center text-xs text-ti-400">
                        ยังไม่มีบันทึก Audit Log ของโมเดลนี้
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {data.auditLogs.map((log) => (
                          <div
                            key={log.id}
                            className="rounded-panel border border-carbon-700 bg-carbon-800/60 p-3.5 space-y-1.5 text-xs"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-mono font-semibold text-ember-300">
                                {log.action}
                              </span>
                              <span className="font-mono text-[11px] text-ti-400">
                                {new Date(log.at).toLocaleString("th-TH", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                })}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-ti-300">
                              <div>
                                <span className="text-ti-400">ผู้ดำเนินการ: </span>
                                <span className="font-mono text-ti-100">{log.actorCode ?? "ไม่ระบุ"}</span>
                              </div>
                              {log.ip && (
                                <div>
                                  <span className="text-ti-400">IP แอดเดรส: </span>
                                  <span className="font-mono text-ti-200">{log.ip}</span>
                                </div>
                              )}
                              {log.versionNo && (
                                <div>
                                  <span className="text-ti-400">เวอร์ชันที่บันทึก: </span>
                                  <span className="font-mono text-pass font-semibold">v{log.versionNo}</span>
                                </div>
                              )}
                              {log.itemCount && (
                                <div>
                                  <span className="text-ti-400">จำนวนขั้นตอน: </span>
                                  <span className="text-ti-200">{log.itemCount} ข้อ</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-carbon-700 bg-carbon-800/80 flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-control border border-carbon-600 bg-carbon-700 hover:bg-carbon-600 text-xs font-semibold text-ti-100 transition-colors"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
