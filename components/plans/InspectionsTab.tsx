"use client";

import Link from "next/link";
import { useState } from "react";
import { LoadError } from "@/components/feedback/LoadError";
import { useApiRead } from "@/lib/api/client";
import type { PlanInspectionSummary, PlanUnitInspectionItem } from "@/lib/inspections/types";
import { dateText, when } from "./PlanBits";

type Props = {
  planId: number;
};

type InspectionPayload = {
  inspections: PlanUnitInspectionItem[];
  summary: PlanInspectionSummary;
};

type FilterKey = "all" | "pass" | "rework" | "reject";

export function InspectionsTab({ planId }: Props) {
  const { data, loading, error, reload } = useApiRead<InspectionPayload>(`/api/plans/${planId}/inspections`);
  const [filter, setFilter] = useState<FilterKey>("all");

  if (!data) {
    return error ? (
      <LoadError message={error} onRetry={reload} />
    ) : (
      <div role="status" aria-label="กำลังโหลดรายการตรวจ" className="app-panel h-48 animate-pulse rounded-panel border border-carbon-700 bg-carbon-800" />
    );
  }

  const { inspections, summary } = data;

  const filteredInspections = inspections.filter((item) => {
    if (filter === "pass") return item.result === "PASS";
    if (filter === "rework") return item.result === "NOT_PASSED" && item.failureDecision === "REWORK";
    if (filter === "reject") return item.result === "NOT_PASSED" && item.failureDecision === "REJECT";
    return true;
  });

  return (
    <section aria-label="รายการตรวจในแผน" aria-busy={loading} className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
      {error && <LoadError message={error} onRetry={reload} />}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-4">
        <div className="text-center">
          <p className="text-xs text-ti-400">ตรวจแล้วทั้งหมด</p>
          <p className="font-mono text-2xl font-semibold text-ti-50">{inspections.length}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-pass">ผ่านเกณฑ์ (PASS)</p>
          <p className="font-mono text-2xl font-semibold text-pass">{summary.passCount}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-fail">รอ Rework แก้ไข</p>
          <p className={`font-mono text-2xl font-semibold ${summary.reworkCount > 0 ? "text-fail animate-pulse" : "text-ti-400"}`}>
            {summary.reworkCount}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-ti-400">Reject คัดทิ้ง</p>
          <p className="font-mono text-2xl font-semibold text-ti-400">{summary.rejectCount}</p>
        </div>
      </div>

      {/* Filter Chips */}
      <nav aria-label="กรองรายการตรวจ" className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium border transition-colors ${
            filter === "all" ? "bg-ember-500/20 text-ember-300 border-ember-500/40" : "bg-carbon-800 text-ti-400 border-carbon-700 hover:text-ti-200"
          }`}
        >
          <span>ทั้งหมด</span>
          <span className="font-mono text-[11px] font-semibold">{inspections.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setFilter("pass")}
          className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium border transition-colors ${
            filter === "pass" ? "bg-pass/20 text-pass border-pass/40" : "bg-carbon-800 text-ti-400 border-carbon-700 hover:text-ti-200"
          }`}
        >
          <span>ผ่าน</span>
          <span className="font-mono text-[11px] font-semibold">{summary.passCount}</span>
        </button>
        {summary.reworkCount > 0 && (
          <button
            type="button"
            onClick={() => setFilter("rework")}
            className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium border transition-colors ${
              filter === "rework" ? "bg-fail/20 text-fail border-fail/40" : "bg-carbon-800 text-fail border-carbon-700 hover:border-fail/30"
            }`}
          >
            <span>รอ Rework</span>
            <span className="font-mono text-[11px] font-semibold">{summary.reworkCount}</span>
          </button>
        )}
        {summary.rejectCount > 0 && (
          <button
            type="button"
            onClick={() => setFilter("reject")}
            className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium border transition-colors ${
              filter === "reject" ? "bg-carbon-700 text-ti-200 border-carbon-600" : "bg-carbon-800 text-ti-400 border-carbon-700 hover:text-ti-200"
            }`}
          >
            <span>✕ Reject</span>
            <span className="font-mono text-[11px] font-semibold">{summary.rejectCount}</span>
          </button>
        )}
      </nav>

      {/* Empty State */}
      {filteredInspections.length === 0 ? (
        <div className="rounded-panel border border-dashed border-carbon-600 p-6 text-center text-sm text-ti-400">
          {inspections.length === 0
            ? "ยังไม่มีรายการตรวจ — เมื่อ QC เริ่มตรวจเครื่องในใบงาน ผลการตรวจจะแสดงที่นี่แบบเรียลไทม์"
            : "ไม่พบรายการตรวจในตัวกรองนี้"}
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden overflow-x-auto app-panel rounded-panel border border-carbon-700 bg-carbon-800 md:block">
            <table className="w-full min-w-[850px] text-sm">
              <caption className="sr-only">รายการเครื่องที่ตรวจในแผนนี้</caption>
              <thead className="bg-carbon-900 text-left text-xs text-ti-400">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-medium">หมายเลขเครื่อง (Serial)</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">ใบงาน</th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-center">รอบที่</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">ผลการตรวจ</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">ข้อบกพร่องที่พบ</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">ผู้ตรวจ</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">เวลาที่บันทึก</th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-right">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {filteredInspections.map((item) => {
                  const needsRework = item.result === "NOT_PASSED" && item.failureDecision === "REWORK";
                  return (
                  <tr key={item.id} className="border-t border-carbon-700 align-top text-ti-200 hover:bg-carbon-750 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono font-medium text-ti-50">{item.serialPump || "—"}</span>
                        {item.role === "QA" ? (
                          <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300 border border-cyan-500/40">
                            QA สุ่มตรวจ
                          </span>
                        ) : (
                          <span className="rounded bg-carbon-700 px-1.5 py-0.5 text-[10px] font-medium text-ti-400">
                            QC
                          </span>
                        )}
                      </div>
                      {item.serialMotor && <span className="block text-xs font-mono text-ti-400">Motor: {item.serialMotor}</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-ti-300">{item.woNo || "—"}</td>
                    <td className="px-3 py-2.5 text-center font-mono">
                      {item.roundNo > 1 ? (
                        <span className="inline-block rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-semibold text-amber-300 border border-amber-500/40">
                          รอบ {item.roundNo} (Rework)
                        </span>
                      ) : (
                        <span className="text-ti-400 text-xs">รอบ 1</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <ResultBadge result={item.result} decision={item.failureDecision} status={item.status} />
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {item.defectNames ? (
                        <span className="text-fail font-medium">{item.defectNames} ({item.failedItemCount} จุด)</span>
                      ) : item.result === "PASS" ? (
                        <span className="text-ti-500">ไม่มีข้อบกพร่อง</span>
                      ) : (
                        <span className="text-ti-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ti-300">{item.inspectorName}</td>
                    <td className="px-3 py-2.5 text-xs text-ti-400">
                      {item.submittedAt ? when.format(new Date(item.submittedAt)) : dateText(item.startedAt)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {needsRework && (
                        <Link
                          href={`/inspections/${item.id}/rework`}
                          className="inline-flex h-8 items-center rounded-control bg-fail px-3 text-xs font-semibold text-carbon-900 hover:brightness-105"
                        >
                          ตรวจแก้เฉพาะข้อ
                        </Link>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <ul className="space-y-3 md:hidden" aria-label="รายการเครื่องที่ตรวจในแผนนี้">
            {filteredInspections.map((item) => (
              <li key={item.id} className="space-y-2 rounded-panel border border-carbon-700 bg-carbon-800 p-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-semibold text-ti-50">{item.serialPump || "—"}</span>
                      {item.role === "QA" ? (
                        <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300 border border-cyan-500/40">
                          QA สุ่มตรวจ
                        </span>
                      ) : (
                        <span className="rounded bg-carbon-700 px-1.5 py-0.5 text-[10px] font-medium text-ti-400">
                          QC
                        </span>
                      )}
                    </div>
                    {item.serialMotor && <p className="text-xs font-mono text-ti-400">Motor: {item.serialMotor}</p>}
                  </div>
                  <ResultBadge result={item.result} decision={item.failureDecision} status={item.status} />
                </div>
                <div className="flex items-center justify-between text-xs text-ti-400 border-t border-carbon-750 pt-2">
                  <span>ใบงาน: {item.woNo}</span>
                  <span>{item.roundNo > 1 ? `รอบ ${item.roundNo} (Rework)` : "รอบ 1"}</span>
                </div>
                {item.defectNames && (
                  <p className="text-xs text-fail font-medium bg-fail/10 rounded p-2 border border-fail/20">
                    ข้อบกพร่อง: {item.defectNames} ({item.failedItemCount} จุด)
                  </p>
                )}
                <div className="flex items-center justify-between text-xs text-ti-400">
                  <span>ผู้ตรวจ: {item.inspectorName}</span>
                  <span>{item.submittedAt ? when.format(new Date(item.submittedAt)) : dateText(item.startedAt)}</span>
                </div>
                {item.result === "NOT_PASSED" && item.failureDecision === "REWORK" && (
                  <Link
                    href={`/inspections/${item.id}/rework`}
                    className="flex h-10 w-full items-center justify-center rounded-control bg-fail text-xs font-semibold text-carbon-900 hover:brightness-105"
                  >
                    ตรวจแก้เฉพาะข้อที่ไม่ผ่าน
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function ResultBadge({
  result,
  decision,
  status,
}: {
  result: "PASS" | "NOT_PASSED" | "CONCESSION" | null;
  decision: "REWORK" | "REJECT" | "CHOOSE" | null;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
}) {
  if (status === "IN_PROGRESS") {
    return <span className="inline-block rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">กำลังตรวจ...</span>;
  }
  if (result === "PASS") {
    return <span className="inline-block rounded-full border border-pass/50 bg-pass/20 px-2 py-0.5 text-xs font-medium text-pass">ผ่าน</span>;
  }
  if (result === "CONCESSION") {
    return <span className="inline-block rounded-full border border-amber-500/50 bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">อนุโลม</span>;
  }
  if (result === "NOT_PASSED") {
    if (decision === "REWORK") {
      return <span className="inline-block rounded-full border border-fail/50 bg-fail/20 px-2 py-0.5 text-xs font-medium text-fail">รอ Rework</span>;
    }
    if (decision === "REJECT") {
      return <span className="inline-block rounded-full border border-carbon-600 bg-carbon-700 px-2 py-0.5 text-xs text-ti-300">✕ Reject</span>;
    }
    return <span className="inline-block rounded-full border border-fail/50 bg-fail/20 px-2 py-0.5 text-xs font-medium text-fail">✕ ไม่ผ่าน</span>;
  }
  return <span className="inline-block rounded-full border border-carbon-600 px-2 py-0.5 text-xs text-ti-500">—</span>;
}
