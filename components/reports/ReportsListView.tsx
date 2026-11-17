"use client";

import { useState } from "react";
import Link from "next/link";
import { AppBack } from "@/components/ui/AppBack";
import { LoadError } from "@/components/feedback/LoadError";
import { useApiRead } from "@/lib/api/client";
import { planStatusLabel, type PlanStatus } from "@/lib/plans/rules";
import type { ReportsListResponse } from "@/lib/reports/types";

type TabFilter = "ALL" | "COMPLETED" | "QA" | "QC";

function statusBadgeClass(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "bg-pass/20 text-pass border border-pass/30";
    case "QA_PENDING":
    case "QA_IN_PROGRESS":
    case "REPORT_REVIEW":
      return "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
    case "ASSIGNED":
    case "QC_IN_PROGRESS":
    case "QC_REVIEW":
      return "bg-amber-500/20 text-amber-300 border border-amber-500/30";
    case "ON_HOLD":
    case "QA_LOT_REJECTED":
      return "bg-fail/20 text-fail border border-fail/30";
    case "CANCELLED":
      return "bg-carbon-800 text-ti-500 border border-carbon-700 line-through";
    default:
      return "bg-carbon-700/80 text-ti-300 border border-carbon-600";
  }
}

export function ReportsListView() {
  const [activeTab, setActiveTab] = useState<TabFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const statusParam =
    activeTab === "COMPLETED"
      ? "COMPLETED"
      : activeTab === "QA"
      ? "QA"
      : activeTab === "QC"
      ? "QC"
      : undefined;

  const queryParams = new URLSearchParams();
  if (statusParam) queryParams.set("status", statusParam);
  if (searchQuery.trim()) queryParams.set("q", searchQuery.trim());

  const queryString = queryParams.toString();
  const url = `/api/reports${queryString ? `?${queryString}` : ""}`;

  const { data, loading, error, reload } = useApiRead<ReportsListResponse>(url);

  return (
    <div className="min-w-0 w-full space-y-6 p-4 pb-12 sm:p-6">
      <AppBack href="/home">กลับหน้าหลัก</AppBack>

      {/* Page Header */}
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-ember-400">
            Quality Assurance Reports
          </span>
          <span className="rounded bg-carbon-800 px-1.5 py-0.5 text-[10px] font-semibold text-ti-300">
            S15 / FR-RPT-08
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ti-50">
          รายงานผลการตรวจสอบคุณภาพ (Quality Inspection Reports)
        </h1>
        <p className="text-sm text-ti-400">
          ศูนย์รวมรายงานผลการตรวจรับรองคุณภาพระดับล็อต, วิเคราะห์ Defect, ประวัติการตรวจ และ Export PDF (A4)
        </p>
      </header>

      {/* KPI Summary Cards */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-4">
            <p className="text-xs text-ti-400">รายงานทั้งหมด</p>
            <p className="font-mono text-2xl font-bold text-ti-50">{data.counts.all}</p>
            <p className="text-[11px] text-ti-500">ทุกล็อตที่เปิดตรวจ</p>
          </div>

          <div className="app-panel rounded-panel border border-pass/30 bg-pass/10 p-4">
            <p className="text-xs text-pass">อนุมัติเสร็จสิ้น (Completed)</p>
            <p className="font-mono text-2xl font-bold text-pass">{data.counts.completed}</p>
            <p className="text-[11px] text-pass/70">ผ่านเกณฑ์ QC & QA</p>
          </div>

          <div className="app-panel rounded-panel border border-cyan-500/30 bg-cyan-500/10 p-4">
            <p className="text-xs text-cyan-300">รอคิว QA สุ่มตรวจ</p>
            <p className="font-mono text-2xl font-bold text-cyan-300">{data.counts.qaPending}</p>
            <p className="text-[11px] text-cyan-400/70">ผ่าน QC แล้ว รอ AQL</p>
          </div>

          <div className="app-panel rounded-panel border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-xs text-amber-400">กำลังตรวจ QC</p>
            <p className="font-mono text-2xl font-bold text-amber-400">{data.counts.qcInProgress}</p>
            <p className="text-[11px] text-amber-400/70">อยู่ระหว่างการตรวจสอบ</p>
          </div>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-carbon-700 pb-3">
        <nav aria-label="กรองรายงาน" className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab("ALL")}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "ALL"
                ? "bg-ember-500 text-black font-semibold"
                : "bg-carbon-800 text-ti-300 hover:bg-carbon-700 hover:text-ti-100"
            }`}
          >
            ทั้งหมด ({data?.counts.all ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("COMPLETED")}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "COMPLETED"
                ? "bg-pass text-black font-semibold"
                : "bg-carbon-800 text-ti-300 hover:bg-carbon-700 hover:text-ti-100"
            }`}
          >
            ✓ เสร็จสิ้น ({data?.counts.completed ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("QA")}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "QA"
                ? "bg-cyan-500 text-black font-semibold"
                : "bg-carbon-800 text-ti-300 hover:bg-carbon-700 hover:text-ti-100"
            }`}
          >
            คิว QA ({data?.counts.qaPending ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("QC")}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "QC"
                ? "bg-amber-500 text-black font-semibold"
                : "bg-carbon-800 text-ti-300 hover:bg-carbon-700 hover:text-ti-100"
            }`}
          >
            กำลังตรวจ QC ({data?.counts.qcInProgress ?? 0})
          </button>
        </nav>

        <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
          <input
            type="search"
            placeholder="ค้นหาแผน, Invoice, Serial, รุ่น..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-carbon-700 bg-carbon-800 px-3 py-1.5 text-xs text-ti-100 placeholder-ti-500 focus:border-ember-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Content Table / Cards */}
      {error ? (
        <LoadError message={error} onRetry={reload} />
      ) : !data || loading ? (
        <div role="status" aria-label="กำลังโหลดรายการรายงาน" className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-panel border border-carbon-700 bg-carbon-800" />
          ))}
        </div>
      ) : data.reports.length === 0 ? (
        <div className="rounded-panel border border-carbon-700 bg-carbon-800/40 p-12 text-center text-sm text-ti-400">
          ไม่พบรายงานที่ตรงกับเงื่อนไขการค้นหา
        </div>
      ) : (
        <div className="overflow-x-auto rounded-panel border border-carbon-700 bg-carbon-800/90 shadow">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-carbon-700 bg-carbon-900/60 text-ti-300">
              <tr>
                <th className="whitespace-nowrap px-3 py-3 font-medium">เลขที่แผน / วันที่</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">เอกสาร / ผู้จำหน่าย</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">รุ่นสินค้า (Model)</th>
                <th className="whitespace-nowrap px-2.5 py-3 text-center font-medium">ล็อต</th>
                <th className="whitespace-nowrap px-2.5 py-3 text-center font-medium">ตรวจ QC</th>
                <th className="whitespace-nowrap px-2.5 py-3 text-center font-medium">สุ่ม QA</th>
                <th className="whitespace-nowrap px-2.5 py-3 text-center font-medium">Defect</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">สถานะ</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-medium">รายงาน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-700/60">
              {data.reports.map((rep) => (
                <tr key={rep.id} className="transition-colors hover:bg-carbon-700/40">
                  <td className="whitespace-nowrap px-3 py-3">
                    <Link href={`/plans/${rep.id}/report`} className="font-mono font-bold text-ember-400 hover:underline">
                      {rep.planNo}
                    </Link>
                    <p className="text-[11px] text-ti-400">
                      {new Date(rep.createdAt).toLocaleDateString("th-TH", {
                        day: "numeric",
                        month: "short",
                        year: "2-digit",
                      })}
                    </p>
                  </td>

                  <td className="px-3 py-3">
                    <p className="whitespace-nowrap font-mono text-ti-200">
                      {rep.docType} {rep.docNo}
                    </p>
                    <p className="max-w-[170px] truncate text-[11px] text-ti-400" title={rep.vendorName ?? "ในประเทศ"}>
                      {rep.vendorName ?? "ในประเทศ"}
                    </p>
                  </td>

                  <td className="whitespace-nowrap px-3 py-3">
                    <p className="font-mono font-semibold text-ti-100">{rep.modelCode}</p>
                    <p className="text-[11px] text-ti-400">
                      {rep.brandName} · {rep.pumpType ?? "ทั่วไป"}
                    </p>
                  </td>

                  <td className="whitespace-nowrap px-2.5 py-3 text-center font-mono font-semibold text-ti-200">
                    {rep.lotQty}
                  </td>

                  <td className="whitespace-nowrap px-2.5 py-3 text-center">
                    <span className="font-mono text-ti-100">
                      {rep.qcDoneTotal}/{rep.qcRequired}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-2.5 py-3 text-center">
                    <span className="font-mono text-cyan-300">
                      {rep.qaDoneTotal}/{rep.qaRequired}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-2.5 py-3 text-center">
                    {rep.defectsCount > 0 ? (
                      <span className="inline-block whitespace-nowrap rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-300">
                        {rep.defectsCount} อาการ
                      </span>
                    ) : (
                      <span className="whitespace-nowrap text-[11px] text-pass">0 อาการ</span>
                    )}
                  </td>

                  <td className="whitespace-nowrap px-3 py-3">
                    <span
                      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusBadgeClass(
                        rep.status
                      )}`}
                    >
                      {planStatusLabel(rep.status as PlanStatus)}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <Link
                      href={`/plans/${rep.id}/report`}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-ember-500/30 bg-ember-500/10 px-2.5 py-1.5 text-xs font-medium text-ember-400 transition-colors hover:bg-ember-500 hover:text-black"
                    >
                      <span>เปิดดูรายงาน</span>
                      <span>→</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
