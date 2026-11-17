"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AppBack } from "@/components/ui/AppBack";
import { LoadError } from "@/components/feedback/LoadError";
import { useApiRead } from "@/lib/api/client";
import { planStatusLabel, type PlanStatus } from "@/lib/plans/rules";
import type { InspectionReportData, ReportDefectItem, ReportPhoto, ReportUnitItem } from "@/lib/reports/types";

type Props = {
  planId: number;
};

type EvidenceModalState = {
  title: string;
  subtitle?: string;
  items: ReportPhoto[];
  index: number;
};

function formatStageLabel(role?: "QC" | "QA", roundNo?: number): string {
  const r = roundNo ?? 1;
  if (role === "QA") {
    return r > 1 ? `QA สุ่มตรวจซ้ำ (รอบ #${r})` : "QA สุ่มตรวจ AQL (#1)";
  }
  return r > 1 ? `QC ตรวจซ้ำ Rework (รอบ #${r})` : "QC ตรวจรับรอบแรก (#1)";
}

function formatTopicHeader(itemSeq?: number | null, topicCode?: string | null, itemTitle?: string | null): string {
  const prefix = itemSeq != null ? `ข้อที่ ${itemSeq}` : topicCode ? `หัวข้อ ${topicCode}` : "หัวข้อการตรวจ";
  return itemTitle ? `${prefix}: ${itemTitle}` : prefix;
}

export function InspectionReportView({ planId }: Props) {
  const { data, error, reload } = useApiRead<InspectionReportData>(`/api/plans/${planId}/report`);
  const [evidenceModal, setEvidenceModal] = useState<EvidenceModalState | null>(null);
  const [mediaFilter, setMediaFilter] = useState<"ALL" | "PHOTO" | "VIDEO">("ALL");
  const [unitSearch, setUnitSearch] = useState("");
  const [printPreview, setPrintPreview] = useState(false);

  if (!data) {
    return (
      <div className="min-w-0 w-full space-y-5 p-4 sm:p-6">
        <AppBack href="/reports">กลับไปรายการรายงาน</AppBack>
        {error ? (
          <LoadError message={error} onRetry={reload} />
        ) : (
          <div role="status" aria-label="กำลังโหลดรายงานผลการตรวจ" className="app-panel h-96 animate-pulse rounded-panel border border-carbon-700 bg-carbon-800" />
        )}
      </div>
    );
  }

  const { plan, qcSummary, qaSummary, defectBreakdown, defectPhotos, inspectedUnits, approvals } = data;

  const isCompleted = plan.status === "COMPLETED";
  const isQaAccepted = qaSummary.decision === "ACCEPT";

  const getMediaForDefect = (item: ReportDefectItem): ReportPhoto[] => {
    return defectPhotos.filter(
      (m) =>
        (m.defectCode && m.defectCode === item.defectCode) ||
        m.defectName === item.defectName
    );
  };

  const getMediaForUnit = (unit: ReportUnitItem): ReportPhoto[] => {
    return defectPhotos.filter(
      (m) =>
        (m.unitId && m.unitId === unit.id) ||
        (m.serialPump === unit.serialPump && (m.role ?? "QC") === unit.role && (m.roundNo ?? 1) === unit.roundNo)
    );
  };

  const filteredGalleryMedia = defectPhotos.filter((m) => {
    if (mediaFilter === "PHOTO") return (m.kind ?? "PHOTO") === "PHOTO";
    if (mediaFilter === "VIDEO") return m.kind === "VIDEO";
    return true;
  });

  const photoCount = defectPhotos.filter((m) => (m.kind ?? "PHOTO") === "PHOTO").length;
  const videoCount = defectPhotos.filter((m) => m.kind === "VIDEO").length;

  const filteredUnits = inspectedUnits.filter((u) => {
    if (!unitSearch.trim()) return true;
    const q = unitSearch.toLowerCase();
    return (
      u.serialPump.toLowerCase().includes(q) ||
      u.serialMotor.toLowerCase().includes(q) ||
      (u.serialSupplier && u.serialSupplier.toLowerCase().includes(q)) ||
      u.inspectorName.toLowerCase().includes(q) ||
      (u.defectsList && u.defectsList.toLowerCase().includes(q))
    );
  });

  return (
    <div className="font-sarabun min-w-0 w-full space-y-6 p-4 pb-12 sm:p-6 print:space-y-4 print:p-0">
      {/* Screen Action Bar (Hidden when printing) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-carbon-700/60 pb-4 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <AppBack href="/reports">กลับไปรายการรายงาน</AppBack>
          <span className="text-ti-500">|</span>
          <Link
            href={`/plans/${plan.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-carbon-700 bg-carbon-800/80 px-3 py-1.5 text-xs font-medium text-ti-300 transition-colors hover:border-carbon-600 hover:text-ti-100"
          >
            ดูรายละเอียดแผน →
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPrintPreview((prev) => !prev)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs sm:text-sm font-medium transition-all ${
              printPreview
                ? "border-ember-500 bg-ember-500/20 text-ember-300"
                : "border-carbon-700 bg-carbon-800 text-ti-200 hover:border-carbon-600 hover:text-ti-50"
            }`}
          >
            <span>{printPreview ? "← กลับมุมมองหน้าจอปกติ" : "📄 ดูตัวอย่างเอกสารทางการ (A4 Preview)"}</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-ember-500 px-4 py-2 text-xs sm:text-sm font-semibold text-black shadow-lg shadow-ember-500/20 transition-all hover:bg-ember-400 active:scale-95"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>พิมพ์รายงานทางการ / บันทึก PDF (A4)</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 1. INTERACTIVE WEB DASHBOARD VIEW (HIDDEN DURING PRINT)         */}
      {/* ============================================================== */}
      <article
        className={`${
          printPreview ? "hidden" : "block"
        } print:hidden app-panel rounded-panel border border-carbon-700 bg-carbon-900/90 p-6 sm:p-8 shadow-xl`}
      >
          {/* Header Title & Enterprise Watermark */}
          <header className="border-b-2 border-ember-500 pb-5 print:border-black">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-ember-400 print:text-gray-700">
                    บริษัท ธีรวัฒน์ เครื่องอัดลม จำกัด · TIRAWAT AIR COMPRESSORS LIMITED
                  </span>
                  <span className="rounded bg-carbon-800 px-1.5 py-0.5 text-[10px] font-semibold text-ti-300 print:border print:border-gray-400 print:bg-gray-100 print:text-black">
                    QA-QC-CERT-S15
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ti-50 print:text-black">
                  ใบรับรองและรายงานผลการตรวจสอบคุณภาพ (Quality Inspection Report)
                </h1>
                <p className="text-xs text-ti-400 print:text-gray-600">
                  ระบบตรวจสอบและควบคุมคุณภาพงานนำเข้าและประกอบเครื่องอัดลม (QA & QC System)
                </p>
              </div>

              <div className="text-right">
                <p className="font-mono text-sm font-bold text-ti-100 print:text-black">{plan.planNo}</p>
                <p className="text-xs text-ti-400 print:text-gray-600">
                  วันที่บันทึก: {new Date(plan.createdAt).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}
                </p>
                <div className="mt-1">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold print:border ${
                      isCompleted || isQaAccepted
                        ? "bg-pass/20 text-pass border-pass/30 print:border-green-600 print:text-green-800"
                        : "bg-ember-500/20 text-ember-400 border-ember-500/30 print:border-orange-500 print:text-orange-800"
                    }`}
                  >
                    {isCompleted ? "อนุมัติเรียบร้อย (COMPLETED)" : isQaAccepted ? "QA ยอมรับรุ่น (QA ACCEPTED)" : `สถานะ: ${planStatusLabel(plan.status as PlanStatus)}`}
                  </span>
                </div>
              </div>
            </div>
          </header>

          {/* Plan & Lot Information Metadata Grid */}
          <section aria-labelledby="meta-info" className="mt-6">
            <h2 id="meta-info" className="sr-only">ข้อมูลล็อตและแผนตรวจ</h2>
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-carbon-700/80 bg-carbon-800/40 p-4 text-xs sm:grid-cols-4 print:border-gray-300 print:bg-gray-50 print:text-black">
              <div>
                <span className="text-ti-400 print:text-gray-500">เอกสารอ้างอิง:</span>
                <p className="font-mono font-semibold text-ti-100 print:text-black">
                  {plan.docType} {plan.docNo}
                </p>
              </div>
              <div>
                <span className="text-ti-400 print:text-gray-500">ผู้จำหน่าย / โรงงาน:</span>
                <p className="font-medium text-ti-100 print:text-black">{plan.vendorName ?? "ไม่ระบุ (ในประเทศ)"}</p>
              </div>
              <div>
                <span className="text-ti-400 print:text-gray-500">รุ่นสินค้า (Model):</span>
                <p className="font-mono font-semibold text-ti-100 print:text-black">{plan.modelCode}</p>
                <p className="text-[11px] text-ti-400 print:text-gray-600">{plan.modelDescription}</p>
              </div>
              <div>
                <span className="text-ti-400 print:text-gray-500">แบรนด์ / ประเภท:</span>
                <p className="font-medium text-ti-100 print:text-black">
                  {plan.brandName} ({plan.pumpType ?? "ทั่วไป"})
                </p>
              </div>
              <div>
                <span className="text-ti-400 print:text-gray-500">จำนวนล็อตทั้งหมด:</span>
                <p className="font-mono font-bold text-ti-100 print:text-black">{plan.lotQty} เครื่อง</p>
              </div>
              <div>
                <span className="text-ti-400 print:text-gray-500">เกณฑ์ตรวจสอบ QC:</span>
                <p className="font-mono font-medium text-ti-100 print:text-black">
                  ตรวจ 100% ({plan.qcRequired} เครื่อง)
                </p>
              </div>
              <div>
                <span className="text-ti-400 print:text-gray-500">เกณฑ์สุ่มตรวจ QA (AQL):</span>
                <p className="font-mono font-medium text-ti-100 print:text-black">
                  Level {plan.aqlLevel} (สุ่ม {plan.aqlSampleSize} เครื่อง, Ac={plan.aqlAcceptNum}, Re={plan.aqlRejectNum})
                </p>
              </div>
              <div>
                <span className="text-ti-400 print:text-gray-500">ผลการตัดสิน AQL:</span>
                <p
                  className={`font-semibold ${
                    qaSummary.decision === "ACCEPT"
                      ? "text-pass print:text-green-700"
                      : qaSummary.decision === "REJECT"
                      ? "text-fail print:text-red-700"
                      : "text-amber-400 print:text-amber-700"
                  }`}
                >
                  {qaSummary.decision === "ACCEPT" ? "✓ ยอมรับล็อต (PASS)" : qaSummary.decision === "REJECT" ? "✕ ไม่อนุญาต (REJECT)" : "กำลังสุ่มตรวจ"}
                </p>
              </div>
            </div>
          </section>

          {/* Executive KPI Summary Counters */}
          <section aria-labelledby="exec-summary" className="mt-6">
            <h2 id="exec-summary" className="mb-3 text-sm font-semibold text-ti-200 print:text-black">
              สรุปผลการตรวจสอบโดยรวม (Executive Summary)
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-center">
              <div className="rounded-lg border border-carbon-700 bg-carbon-800/60 p-3 print:border-gray-300 print:bg-white">
                <p className="text-[11px] text-ti-400 print:text-gray-600">ตรวจแล้ว (QC Inspected)</p>
                <p className="font-mono text-xl font-bold text-ti-50 print:text-black">{qcSummary.totalInspected}</p>
                <p className="text-[10px] text-ti-500 print:text-gray-500">ครบตามเป้า {plan.qcRequired}</p>
              </div>

              <div className="rounded-lg border border-pass/30 bg-pass/10 p-3 print:border-green-300 print:bg-green-50">
                <p className="text-[11px] text-pass print:text-green-800">ผ่านเกณฑ์รอบแรก</p>
                <p className="font-mono text-xl font-bold text-pass print:text-green-800">{qcSummary.passCount}</p>
                <p className="text-[10px] text-pass/70 print:text-green-700">{qcSummary.firstTimePassRate}% Pass Rate</p>
              </div>

              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 print:border-amber-300 print:bg-amber-50">
                <p className="text-[11px] text-amber-400 print:text-amber-800">ผ่านงานซ่อม (Reworked)</p>
                <p className="font-mono text-xl font-bold text-amber-400 print:text-amber-800">{qcSummary.reworkCount}</p>
                <p className="text-[10px] text-amber-400/70 print:text-amber-700">แก้ไขเสร็จสมบูรณ์</p>
              </div>

              <div className="rounded-lg border border-carbon-700 bg-carbon-800/60 p-3 print:border-gray-300 print:bg-white">
                <p className="text-[11px] text-ti-400 print:text-gray-600">คัดออก (Reject)</p>
                <p className="font-mono text-xl font-bold text-ti-300 print:text-black">{qcSummary.rejectCount}</p>
                <p className="text-[10px] text-ti-500 print:text-gray-500">ส่งเคลมผู้จำหน่าย</p>
              </div>

              <div className="col-span-2 sm:col-span-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 print:border-cyan-300 print:bg-cyan-50">
                <p className="text-[11px] text-cyan-300 print:text-cyan-800">สุ่มตรวจ QA AQL</p>
                <p className="font-mono text-xl font-bold text-cyan-300 print:text-cyan-800">
                  {qaSummary.totalSampled}/{plan.qaRequired}
                </p>
                <p className="text-[10px] text-cyan-400/80 print:text-cyan-700">
                  {qaSummary.rejectCount === 0 ? "✓ 0 Defect" : `พบ ${qaSummary.rejectCount} ข้อบกพร่อง`}
                </p>
              </div>
            </div>
          </section>

          {/* Defect Analysis Table (Pareto / Breakdown) */}
          <section aria-labelledby="defect-table" className="mt-8">
            <div className="flex items-center justify-between pb-2">
              <h2 id="defect-table" className="text-sm font-semibold text-ti-200 print:text-black">
                ตารางวิเคราะห์ข้อบกพร่องที่ตรวจพบ (Defect Analysis & Disposition)
              </h2>
              <span className="text-xs text-ti-400 print:text-gray-600">
                {defectBreakdown.length > 0 ? `พบทั้งหมด ${defectBreakdown.length} อาการ` : "ไม่พบข้อบกพร่อง"}
              </span>
            </div>

            {defectBreakdown.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-carbon-700 print:border-gray-400">
                <table className="w-full text-left text-xs print:text-[11px]">
                  <thead className="border-b border-carbon-700 bg-carbon-800/80 text-ti-300 print:border-gray-400 print:bg-gray-100 print:text-black">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2.5 font-medium">รหัส / อาการ Defect</th>
                      <th className="whitespace-nowrap px-3 py-2.5 font-medium">หมวดหมู่</th>
                      <th className="whitespace-nowrap px-3 py-2.5 font-medium">ความรุนแรง</th>
                      <th className="whitespace-nowrap px-3 py-2.5 font-medium">สาเหตุ (Cause)</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-center font-medium">จำนวนเครื่อง</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-center font-medium">% ต่อล็อต</th>
                      <th className="whitespace-nowrap px-3 py-2.5 font-medium">วิธีจัดการ</th>
                      <th className="whitespace-nowrap px-3 py-2.5 text-center font-medium">ตรวจพบโดย</th>
                      <th className="whitespace-nowrap px-3 py-2.5 font-medium print:hidden">หลักฐาน (รูป/วิดีโอ)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-carbon-800 print:divide-gray-300">
                    {defectBreakdown.map((item, idx) => {
                      const matchedMedia = getMediaForDefect(item);
                      const firstMedia = matchedMedia[0];
                      return (
                        <tr key={idx} className="hover:bg-carbon-800/40 print:hover:bg-transparent">
                          <td className="px-3 py-2 font-medium text-ti-100 print:text-black">
                            <span className="font-mono text-ember-400 print:text-gray-800">{item.defectCode}</span> · {item.defectName}
                          </td>
                          <td className="px-3 py-2 text-ti-400 print:text-gray-600">{item.category ?? "-"}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                item.severity === "CRITICAL"
                                  ? "bg-red-500/20 text-red-300 print:text-red-700"
                                  : item.severity === "MAJOR"
                                  ? "bg-amber-500/20 text-amber-300 print:text-amber-800"
                                  : "bg-blue-500/20 text-blue-300 print:text-blue-800"
                              }`}
                            >
                              {item.severity}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-ti-300 print:text-gray-700">{item.causeTag ?? "INTERNAL"}</td>
                          <td className="px-3 py-2 text-center font-mono font-semibold text-ti-100 print:text-black">
                            {item.affectedUnitsCount}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-ti-300 print:text-gray-700">
                            {item.percentOfLot}%
                          </td>
                          <td className="px-3 py-2 text-ti-200 print:text-black">{item.dispositionApplied}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="rounded bg-carbon-800 px-1.5 py-0.5 font-mono text-[10px] text-ti-300 print:border print:bg-white print:text-black">
                              {item.discoveredByRole}
                            </span>
                          </td>
                          <td className="px-3 py-2 print:hidden">
                            {firstMedia ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setEvidenceModal({
                                    title: `หลักฐานอาการ: ${item.defectCode} · ${item.defectName}`,
                                    subtitle: `โมเดล ${plan.modelCode} · พบใน ${item.affectedUnitsCount} เครื่อง (${matchedMedia.length} ไฟล์หลักฐาน)`,
                                    items: matchedMedia,
                                    index: 0,
                                  })
                                }
                                className="group inline-flex items-center gap-2 rounded-lg border border-carbon-700 bg-carbon-900/80 p-1 pr-2.5 text-left transition-all hover:border-ember-500/60 hover:bg-carbon-800"
                              >
                                <div className="relative h-9 w-12 shrink-0 overflow-hidden rounded bg-carbon-950 flex items-center justify-center">
                                  {firstMedia.kind === "VIDEO" ? (
                                    <span className="font-mono text-[10px] font-bold text-ember-400">▶ VID</span>
                                  ) : (
                                    <img
                                      src={firstMedia.uri}
                                      alt={item.defectName}
                                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                      loading="lazy"
                                    />
                                  )}
                                  {matchedMedia.length > 1 && (
                                    <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 text-[9px] font-mono font-bold text-ember-300">
                                      +{matchedMedia.length - 1}
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="whitespace-nowrap text-[11px] font-medium text-ember-400 group-hover:underline">
                                    {matchedMedia.length > 1 ? `ดูเพิ่ม (${matchedMedia.length} ไฟล์)` : "ดูรายละเอียด"}
                                  </p>
                                  <p className="truncate max-w-[110px] text-[10px] text-ti-400">
                                    {firstMedia.part ? `จุด: ${firstMedia.part}` : `S/N: ${firstMedia.serialPump}`}
                                  </p>
                                </div>
                              </button>
                            ) : (
                              <span className="text-[11px] text-ti-500">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-carbon-700/50 bg-carbon-800/20 p-6 text-center text-xs text-ti-400 print:border-gray-200 print:text-gray-600">
                ✓ คุณภาพสมบูรณ์แบบ — ไม่พบประวัติข้อบกพร่องหรือรายการไม่ผ่านเกณฑ์ในล็อตนี้
              </div>
            )}
          </section>

          {/* Evidence Photos & Videos Gallery with Full Inspection Context */}
          {defectPhotos.length > 0 && (
            <section aria-labelledby="photo-gallery" className="mt-8 print:break-before-page">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 id="photo-gallery" className="text-sm font-semibold text-ti-200 print:text-black">
                    ภาพถ่ายและวิดีโอหลักฐานจุดบกพร่อง (Inspection Evidence Photos & Videos)
                  </h2>
                  <p className="text-xs text-ti-400 print:text-gray-600">
                    ระบุขั้นตอนการตรวจ, โมเดล, Serial เครื่อง, หัวข้อ Checklist และจุดที่พบข้อบกพร่องอย่างละเอียด (คลิกเพื่อดูภาพขยายหรือเล่นวิดีโอ)
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 print:hidden">
                  <button
                    type="button"
                    onClick={() => setMediaFilter("ALL")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      mediaFilter === "ALL"
                        ? "bg-ember-500 text-black font-semibold"
                        : "bg-carbon-800 text-ti-300 hover:bg-carbon-700"
                    }`}
                  >
                    ทั้งหมด ({defectPhotos.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaFilter("PHOTO")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      mediaFilter === "PHOTO"
                        ? "bg-ember-500 text-black font-semibold"
                        : "bg-carbon-800 text-ti-300 hover:bg-carbon-700"
                    }`}
                  >
                    รูปภาพ ({photoCount})
                  </button>
                  {videoCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setMediaFilter("VIDEO")}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                        mediaFilter === "VIDEO"
                          ? "bg-ember-500 text-black font-semibold"
                          : "bg-carbon-800 text-ti-300 hover:bg-carbon-700"
                      }`}
                    >
                      วิดีโอ ({videoCount})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setEvidenceModal({
                        title: `หลักฐานจุดบกพร่องทั้งหมด (${filteredGalleryMedia.length} รายการ)`,
                        subtitle: `แผน ${plan.planNo} · โมเดล ${plan.modelCode} (${plan.brandName})`,
                        items: filteredGalleryMedia,
                        index: 0,
                      })
                    }
                    className="rounded-lg border border-ember-500/40 bg-ember-500/10 px-2.5 py-1 text-xs font-medium text-ember-400 transition-colors hover:bg-ember-500 hover:text-black"
                  >
                    เปิดดูแบบสไลด์ทั้งหมด ↗
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
                {filteredGalleryMedia.map((photo, idx) => (
                  <div
                    key={photo.id}
                    onClick={() =>
                      setEvidenceModal({
                        title: `หลักฐานจุดบกพร่อง — เครื่อง S/N: ${photo.serialPump}`,
                        subtitle: `${formatStageLabel(photo.role, photo.roundNo)} · โมเดล ${photo.modelCode ?? plan.modelCode}`,
                        items: filteredGalleryMedia,
                        index: idx,
                      })
                    }
                    className="group flex flex-col cursor-pointer overflow-hidden rounded-xl border border-carbon-700 bg-carbon-800/90 transition-all hover:border-ember-500/70 hover:shadow-lg print:border-gray-400 print:bg-white"
                  >
                    {/* Top Stage & Severity Bar */}
                    <div className="flex items-center justify-between gap-2 border-b border-carbon-700/70 bg-carbon-900/70 px-3 py-1.5 text-[10px] print:border-gray-300 print:bg-gray-100">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold ${
                          photo.role === "QA"
                            ? "bg-cyan-500/20 text-cyan-300 print:text-cyan-800"
                            : (photo.roundNo ?? 1) > 1
                            ? "bg-amber-500/20 text-amber-300 print:text-amber-800"
                            : "bg-ember-500/20 text-ember-400 print:text-orange-800"
                        }`}
                      >
                        {formatStageLabel(photo.role, photo.roundNo)}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {photo.severity && (
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono font-semibold ${
                              photo.severity === "CRITICAL"
                                ? "bg-red-500/20 text-red-300 print:text-red-700"
                                : photo.severity === "MAJOR"
                                ? "bg-amber-500/20 text-amber-300 print:text-amber-800"
                                : "bg-blue-500/20 text-blue-300 print:text-blue-800"
                            }`}
                          >
                            {photo.severity}
                          </span>
                        )}
                        <span className="rounded bg-carbon-800 px-1.5 py-0.5 font-mono text-ti-300 print:border print:bg-white print:text-black">
                          {photo.kind === "VIDEO" ? "▶ VIDEO" : "📷 PHOTO"}
                        </span>
                      </div>
                    </div>

                    {/* Media Preview */}
                    <div className="relative aspect-video w-full bg-carbon-950 flex items-center justify-center overflow-hidden">
                      {photo.uri ? (
                        photo.kind === "VIDEO" ? (
                          <>
                            <video
                              src={photo.uri}
                              muted
                              playsInline
                              preload="metadata"
                              className="h-full w-full object-cover opacity-80 transition-transform duration-300 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/35 text-ember-400">
                              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-ember-500/60 bg-black/75 text-lg shadow-lg">
                                ▶
                              </span>
                              <span className="rounded bg-black/75 px-2 py-0.5 text-[11px] font-medium text-ti-100">
                                คลิกเพื่อเล่นวิดีโอหลักฐาน
                              </span>
                            </div>
                          </>
                        ) : (
                          <img
                            src={photo.uri}
                            alt={photo.defectName}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        )
                      ) : (
                        <span className="text-[11px] text-ti-500">ไม่มีไฟล์ภาพ</span>
                      )}
                      <div className="absolute bottom-2 right-2 rounded-md bg-black/75 px-2 py-0.5 text-[10px] font-medium text-ti-100 opacity-0 transition-opacity group-hover:opacity-100 print:hidden">
                        คลิกดูรายละเอียดขยาย ↗
                      </div>
                    </div>

                    {/* Structured Context Metadata */}
                    <div className="flex flex-1 flex-col justify-between space-y-2 p-3 text-xs print:text-[10px]">
                      <div className="space-y-1.5">
                        {/* Model & Serials */}
                        <div className="flex flex-wrap items-center justify-between gap-1 rounded bg-carbon-900/60 px-2 py-1 text-[11px] print:bg-gray-100">
                          <span className="font-mono font-semibold text-ti-200 print:text-black">
                            รุ่น: {photo.modelCode ?? plan.modelCode}
                          </span>
                          <span className="font-mono text-ember-400 print:text-black">
                            S/N ปั๊ม: {photo.serialPump}
                          </span>
                        </div>

                        {/* Checklist Topic & Item */}
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-ti-400 print:text-gray-600">
                            หัวข้อและรายการที่ตรวจ
                          </p>
                          <p className="font-medium text-ti-100 line-clamp-2 print:text-black">
                            {formatTopicHeader(photo.itemSeq, photo.topicCode, photo.itemTitle)}
                          </p>
                        </div>

                        {/* Defect & Part */}
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 print:border-gray-300 print:bg-gray-50">
                          <p className="font-semibold text-amber-300 print:text-black">
                            อาการ: {photo.defectCode ? `${photo.defectCode} · ` : ""}
                            {photo.defectName}
                          </p>
                          <p className="text-[11px] text-ti-300 print:text-gray-700">
                            จุด/รายการย่อย: <span className="font-medium text-ti-100 print:text-black">{photo.part ?? "ไม่ระบุชิ้นส่วนย่อย"}</span>
                          </p>
                          {photo.itemRemark && (
                            <p className="mt-0.5 text-[11px] italic text-ti-400 print:text-gray-600">
                              หมายเหตุ: “{photo.itemRemark}”
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Inspector & Time Footer */}
                      <div className="flex items-center justify-between border-t border-carbon-700/50 pt-2 text-[10px] text-ti-400 print:border-gray-200 print:text-gray-600">
                        <span>ผู้ตรวจ: {photo.inspectorName}</span>
                        <span className="font-mono">
                          {new Date(photo.capturedAt).toLocaleString("th-TH", {
                            day: "numeric",
                            month: "short",
                            year: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Inspected Units Drill-Down Table */}
          <section aria-labelledby="unit-drilldown" className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
              <h2 id="unit-drilldown" className="text-sm font-semibold text-ti-200 print:text-black">
                บันทึกการตรวจสอบรายเครื่อง (Serial Unit Inspection Log)
              </h2>
              <div className="print:hidden">
                <input
                  type="search"
                  placeholder="ค้นหา Serial / ผู้ตรวจ..."
                  value={unitSearch}
                  onChange={(e) => setUnitSearch(e.target.value)}
                  className="h-8 rounded-lg border border-carbon-700 bg-carbon-800 px-3 text-xs text-ti-100 placeholder-ti-500 focus:border-ember-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto rounded-lg border border-carbon-700 print:max-h-none print:border-gray-400">
              <table className="w-full text-left text-xs print:text-[10px]">
                <thead className="sticky top-0 z-10 border-b border-carbon-700 bg-carbon-800 text-ti-300 print:static print:border-gray-400 print:bg-gray-100 print:text-black">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">ลำดับ</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Serial ปั๊ม</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Serial มอเตอร์</th>
                    <th className="whitespace-nowrap px-3 py-2 text-center font-medium">ขั้นตอน / ฝ่าย</th>
                    <th className="whitespace-nowrap px-3 py-2 text-center font-medium">รอบที่</th>
                    <th className="whitespace-nowrap px-3 py-2 text-center font-medium">ผลการตรวจ</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">ข้อบกพร่องที่พบ</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium print:hidden">หลักฐานที่ถ่าย</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">ผู้ตรวจสอบ</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">เวลาบันทึก</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon-800 print:divide-gray-300">
                  {filteredUnits.map((unit, idx) => {
                    const unitMedia = getMediaForUnit(unit);
                    const firstUnitMedia = unitMedia[0];
                    return (
                      <tr key={unit.id} className="hover:bg-carbon-800/30 print:hover:bg-transparent">
                        <td className="px-3 py-1.5 font-mono text-ti-500 print:text-gray-600">{idx + 1}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono font-semibold text-ti-100 print:text-black">{unit.serialPump}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono text-ti-300 print:text-gray-700">{unit.serialMotor}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-center">
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                              unit.role === "QA" ? "bg-cyan-500/20 text-cyan-300 print:text-cyan-800" : "bg-carbon-800 text-ti-300 print:text-black"
                            }`}
                          >
                            {unit.role}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-center font-mono text-ti-400 print:text-gray-600">
                          {unit.roundNo > 1 ? `Rework (${unit.roundNo})` : "ปกติ (1)"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-center">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              unit.result === "PASS"
                                ? "bg-pass/20 text-pass print:text-green-700"
                                : "bg-fail/20 text-fail print:text-red-700"
                            }`}
                          >
                            {unit.result === "PASS" ? "PASS" : unit.failureDecision ?? "FAIL"}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-ti-300 print:text-gray-800">{unit.defectsList ?? "-"}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 print:hidden">
                          {firstUnitMedia ? (
                            <button
                              type="button"
                              onClick={() =>
                                setEvidenceModal({
                                  title: `หลักฐานการตรวจเครื่อง S/N: ${unit.serialPump}`,
                                  subtitle: `${formatStageLabel(unit.role, unit.roundNo)} · โมเดล ${plan.modelCode} · ผู้ตรวจ ${unit.inspectorName}`,
                                  items: unitMedia,
                                  index: 0,
                                })
                              }
                              className="group inline-flex items-center gap-2 rounded-lg border border-carbon-700 bg-carbon-900/90 p-1 pr-2.5 text-left transition-all hover:border-ember-500/60 hover:bg-carbon-800"
                            >
                              <div className="relative h-8 w-11 shrink-0 overflow-hidden rounded bg-carbon-950 flex items-center justify-center">
                                {firstUnitMedia.kind === "VIDEO" ? (
                                  <span className="font-mono text-[9px] font-bold text-ember-400">▶ VID</span>
                                ) : (
                                  <img
                                    src={firstUnitMedia.uri}
                                    alt={firstUnitMedia.defectName}
                                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                    loading="lazy"
                                  />
                                )}
                                {unitMedia.length > 1 && (
                                  <span className="absolute bottom-0.5 right-0.5 rounded bg-black/85 px-1 text-[9px] font-mono font-bold text-ember-300">
                                    +{unitMedia.length - 1}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] font-medium text-ember-400 group-hover:underline">
                                {unitMedia.length > 1 ? `ดูเพิ่ม (${unitMedia.length} ไฟล์)` : "ดูรูปหลักฐาน"}
                              </span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-ti-500">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-ti-200 print:text-black">{unit.inspectorName}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-ti-400 print:text-gray-600">
                          {unit.completedAt ? new Date(unit.completedAt).toLocaleString("th-TH") : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Digital Signatures & Approvals (FR-RPT-06) */}
          <section aria-labelledby="approval-signoff" className="mt-10 border-t border-carbon-700/80 pt-6 print:border-gray-400">
            <h2 id="approval-signoff" className="mb-4 text-sm font-semibold text-ti-200 print:text-black">
              การลงนามอนุมัติผลตรวจสอบทางอิเล็กทรอนิกส์ (Digital Signatures & Approvals)
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {approvals.map((appr, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-carbon-700 bg-carbon-800/50 p-4 text-center print:border-gray-400 print:bg-white"
                >
                  <p className="text-xs font-semibold text-ti-200 print:text-black">{appr.title}</p>
                  <div className="my-3 min-h-[48px] flex flex-col items-center justify-center">
                    {appr.status === "APPROVED" ? (
                      <div className="flex flex-col items-center">
                        <span className="font-mono text-xs font-bold text-pass print:text-green-800">
                          [DIGITALLY SIGNED]
                        </span>
                        <p className="text-sm font-medium text-ti-100 print:text-black">{appr.name}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-ti-500 italic print:text-gray-500">รอการตรวจสอบและลงนาม</span>
                    )}
                  </div>
                  <div className="border-t border-carbon-700/60 pt-2 text-[10px] text-ti-400 print:border-gray-300 print:text-gray-600">
                    <p>รหัสพนักงาน: {appr.employeeCode}</p>
                    <p>วันที่ลงนาม: {appr.signedAt ? new Date(appr.signedAt).toLocaleString("th-TH") : "-"}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Footer Note */}
          <footer className="mt-8 border-t border-carbon-800 pt-4 text-center text-[10px] text-ti-500 print:border-gray-300 print:text-gray-500">
            เอกสารนี้ออกโดยระบบอัตโนมัติ QA & QC System · บริษัท ธีรวัฒน์ เครื่องอัดลม จำกัด (TIRAWAT AIR COMPRESSORS LIMITED) · เอกสารฉบับนี้มีผลสมบูรณ์ตามกฎหมายธุรกรรมทางอิเล็กทรอนิกส์
          </footer>
        </article>

        {/* ============================================================== */}
        {/* 2. OFFICIAL A4 FORMAL PRINT CERTIFICATE & REPORT                */}
        {/*    (Shown when Print Preview is toggled OR during window.print) */}
        {/* ============================================================== */}
        {(() => {
          const printPhotosOnly = defectPhotos.filter((m) => (m.kind ?? "PHOTO") === "PHOTO");
          const printVideosOnly = defectPhotos.filter((m) => m.kind === "VIDEO");
          const formatMediaCountText = (items: ReportPhoto[]) => {
            if (items.length === 0) return "-";
            const pCount = items.filter((i) => (i.kind ?? "PHOTO") === "PHOTO").length;
            const vCount = items.filter((i) => i.kind === "VIDEO").length;
            const parts: string[] = [];
            if (pCount > 0) parts.push(`ภาพถ่าย ${pCount} ไฟล์`);
            if (vCount > 0) parts.push(`วิดีโอ ${vCount} ไฟล์`);
            return parts.join(", ");
          };

          return (
            <div className={`${printPreview ? "block" : "hidden"} print:block overflow-x-auto`}>
              <div className="mx-auto min-w-[720px] max-w-[210mm] rounded-lg border border-slate-300 bg-white p-6 sm:p-8 text-slate-900 shadow-2xl print:min-w-0 print:max-w-none print:rounded-none print:border-none print:p-0 print:shadow-none">
                {/* Official Letterhead & ISO Document Control Box */}
                <header className="border-b-2 border-slate-900 pb-4">
                  <div className="flex items-start justify-between gap-6">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-block border border-slate-900 bg-slate-900 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-white">
                          TRW × PUMA
                        </span>
                        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                          TIRAWAT AIR COMPRESSORS LIMITED
                        </span>
                      </div>
                      <h1 className="text-lg font-bold tracking-tight text-slate-950">
                        บริษัท ธีรวัฒน์ เครื่องอัดลม จำกัด (TIRAWAT AIR COMPRESSORS LIMITED)
                      </h1>
                      <h2 className="text-base font-bold text-slate-800">
                        ใบรับรองและรายงานผลการตรวจสอบคุณภาพสินค้า (Official Quality Inspection Report)
                      </h2>
                    </div>

                    {/* ISO Document Control Table */}
                    <table className="shrink-0 border-collapse border border-slate-800 text-[10px]">
                      <tbody>
                        <tr>
                          <td className="border border-slate-400 bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                            เลขที่รายงาน (Report No.)
                          </td>
                          <td className="border border-slate-400 px-2.5 py-1 font-mono font-bold text-slate-950">
                            QIR-{plan.planNo}
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-slate-400 bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                            รหัสเอกสาร (Form Code)
                          </td>
                          <td className="border border-slate-400 px-2.5 py-1 font-mono text-slate-800">
                            FM-QA-S15 (Rev.02)
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-slate-400 bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                            วันที่ออกเอกสาร (Issue Date)
                          </td>
                          <td className="border border-slate-400 px-2.5 py-1 font-mono text-slate-800">
                            {new Date(plan.updatedAt || plan.createdAt).toLocaleDateString("th-TH", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </td>
                        </tr>
                        <tr>
                          <td className="border border-slate-400 bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                            สถานะแผน (Lot Status)
                          </td>
                          <td className="border border-slate-400 px-2.5 py-1 font-semibold text-slate-900">
                            {planStatusLabel(plan.status as PlanStatus)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </header>

                {/* Section 1: Lot Identification & Inspection Standard */}
                <section className="mt-4">
                  <h3 className="mb-1.5 border-l-4 border-slate-900 pl-2 text-xs font-bold uppercase tracking-wide text-slate-900">
                    ส่วนที่ 1: ข้อมูลประจำล็อตและเกณฑ์การตรวจสอบ (Lot Identification & Inspection Criteria)
                  </h3>
                  <table className="w-full border-collapse border border-slate-400 text-[11px]">
                    <tbody>
                      <tr>
                        <th className="w-[18%] border border-slate-400 bg-slate-100 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                          เลขที่แผนตรวจ
                        </th>
                        <td className="w-[32%] border border-slate-400 px-2.5 py-1.5 font-mono font-bold text-slate-950">
                          {plan.planNo}
                        </td>
                        <th className="w-[18%] border border-slate-400 bg-slate-100 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                          เอกสารอ้างอิงรับเข้า
                        </th>
                        <td className="w-[32%] border border-slate-400 px-2.5 py-1.5 font-mono font-semibold text-slate-900">
                          {plan.docType} {plan.docNo}
                        </td>
                      </tr>
                      <tr>
                        <th className="border border-slate-400 bg-slate-100 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                          รุ่นสินค้า (Model)
                        </th>
                        <td className="border border-slate-400 px-2.5 py-1.5 font-mono font-bold text-slate-950">
                          {plan.modelCode} {plan.modelDescription ? `(${plan.modelDescription})` : ""}
                        </td>
                        <th className="border border-slate-400 bg-slate-100 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                          ผู้จำหน่าย / โรงงาน
                        </th>
                        <td className="border border-slate-400 px-2.5 py-1.5 text-slate-900">
                          {plan.vendorName ?? "ภายในประเทศ (Domestic)"}
                        </td>
                      </tr>
                      <tr>
                        <th className="border border-slate-400 bg-slate-100 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                          แบรนด์ / ประเภทปั๊ม
                        </th>
                        <td className="border border-slate-400 px-2.5 py-1.5 text-slate-900">
                          {plan.brandName} · ประเภท {plan.pumpType ?? "มาตรฐาน"}
                        </td>
                        <th className="border border-slate-400 bg-slate-100 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                          ขนาดล็อต (Lot Size)
                        </th>
                        <td className="border border-slate-400 px-2.5 py-1.5 font-mono font-bold text-slate-950">
                          {plan.lotQty} เครื่อง
                        </td>
                      </tr>
                      <tr>
                        <th className="border border-slate-400 bg-slate-100 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                          เกณฑ์การตรวจ QC
                        </th>
                        <td className="border border-slate-400 px-2.5 py-1.5 text-slate-900">
                          ตรวจตามโควตา {plan.qcRequired} เครื่อง (ตรวจแล้ว {plan.qcDoneTotal} เครื่อง)
                        </td>
                        <th className="border border-slate-400 bg-slate-100 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                          เกณฑ์สุ่มตรวจ QA (AQL)
                        </th>
                        <td className="border border-slate-400 px-2.5 py-1.5 font-mono text-slate-900">
                          ISO 2859-1 Level {plan.aqlLevel} (สุ่ม {plan.aqlSampleSize} เครื่อง · Ac={plan.aqlAcceptNum}, Re={plan.aqlRejectNum})
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>

                {/* Section 2: Executive Summary & Lot Disposition */}
                <section className="mt-4">
                  <h3 className="mb-1.5 border-l-4 border-slate-900 pl-2 text-xs font-bold uppercase tracking-wide text-slate-900">
                    ส่วนที่ 2: สรุปผลการตรวจสอบคุณภาพและผลการตัดสินล็อต (Executive Inspection Summary)
                  </h3>
                  <table className="w-full border-collapse border border-slate-400 text-center text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="border border-slate-400 px-2 py-1.5 font-semibold">ตรวจ QC ทั้งหมด</th>
                        <th className="border border-slate-400 px-2 py-1.5 font-semibold">ผ่านรอบแรก (Pass)</th>
                        <th className="border border-slate-400 px-2 py-1.5 font-semibold">แก้ไขงาน (Rework)</th>
                        <th className="border border-slate-400 px-2 py-1.5 font-semibold">อนุโลม (Concession)</th>
                        <th className="border border-slate-400 px-2 py-1.5 font-semibold">คัดออก (Reject)</th>
                        <th className="border border-slate-400 px-2 py-1.5 font-semibold">สุ่มตรวจ QA AQL</th>
                        <th className="border border-slate-400 px-2 py-1.5 font-semibold">ผลการตัดสินล็อต</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-400 px-2 py-2 font-mono font-bold text-slate-950">
                          {qcSummary.totalInspected} / {plan.qcRequired} เครื่อง
                        </td>
                        <td className="border border-slate-400 px-2 py-2 font-mono font-bold text-emerald-800">
                          {qcSummary.passCount} เครื่อง ({qcSummary.firstTimePassRate}%)
                        </td>
                        <td className="border border-slate-400 px-2 py-2 font-mono font-semibold text-amber-800">
                          {qcSummary.reworkCount} เครื่อง
                        </td>
                        <td className="border border-slate-400 px-2 py-2 font-mono text-slate-800">
                          {qcSummary.concessionCount} เครื่อง
                        </td>
                        <td className="border border-slate-400 px-2 py-2 font-mono font-semibold text-red-800">
                          {qcSummary.rejectCount} เครื่อง
                        </td>
                        <td className="border border-slate-400 px-2 py-2 font-mono font-semibold text-slate-900">
                          {qaSummary.totalSampled} / {plan.qaRequired} เครื่อง
                        </td>
                        <td className="border border-slate-400 bg-slate-50 px-2 py-2 font-bold text-slate-950">
                          {qaSummary.decision === "ACCEPT"
                            ? "✓ ผ่านการรับรอง (ACCEPT)"
                            : qaSummary.decision === "REJECT"
                            ? "✕ ไม่ผ่านเกณฑ์ (REJECT)"
                            : "อยู่ระหว่างดำเนินการ"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>

                {/* Section 3: Defect Analysis & Disposition Record */}
                <section className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between">
                    <h3 className="border-l-4 border-slate-900 pl-2 text-xs font-bold uppercase tracking-wide text-slate-900">
                      ส่วนที่ 3: ตารางวิเคราะห์ข้อบกพร่องที่ตรวจพบ (Defect Analysis & Disposition Record)
                    </h3>
                    <span className="text-[10px] font-medium text-slate-600">
                      {defectBreakdown.length > 0
                        ? `พบอาการบกพร่องรวม ${defectBreakdown.length} รายการ (ภาพถ่าย ${printPhotosOnly.length} ไฟล์, วิดีโอ ${printVideosOnly.length} ไฟล์)`
                        : "ไม่พบรายการข้อบกพร่อง"}
                    </span>
                  </div>

                  {defectBreakdown.length > 0 ? (
                    <table className="w-full border-collapse border border-slate-400 text-[10.5px]">
                      <thead>
                        <tr className="bg-slate-100 text-slate-800">
                          <th className="border border-slate-400 px-2 py-1.5 text-center font-semibold">ลำดับ</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-left font-semibold">รหัส / อาการบกพร่อง</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-left font-semibold">หมวดหมู่</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center font-semibold">ความรุนแรง</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center font-semibold">สาเหตุ</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center font-semibold">จำนวนเครื่อง</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center font-semibold">% ล็อต</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center font-semibold">การจัดการ</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center font-semibold">ฝ่าย</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-left font-semibold">หลักฐานที่บันทึกในระบบ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {defectBreakdown.map((item, idx) => {
                          const matched = getMediaForDefect(item);
                          return (
                            <tr key={idx}>
                              <td className="border border-slate-400 px-2 py-1.5 text-center font-mono">{idx + 1}</td>
                              <td className="border border-slate-400 px-2 py-1.5 font-medium text-slate-950">
                                <span className="font-mono font-bold">{item.defectCode}</span> · {item.defectName}
                              </td>
                              <td className="border border-slate-400 px-2 py-1.5 text-slate-700">{item.category ?? "-"}</td>
                              <td className="border border-slate-400 px-2 py-1.5 text-center font-mono font-semibold">
                                {item.severity}
                              </td>
                              <td className="border border-slate-400 px-2 py-1.5 text-center font-mono">
                                {item.causeTag ?? "INTERNAL"}
                              </td>
                              <td className="border border-slate-400 px-2 py-1.5 text-center font-mono font-bold">
                                {item.affectedUnitsCount}
                              </td>
                              <td className="border border-slate-400 px-2 py-1.5 text-center font-mono">
                                {item.percentOfLot}%
                              </td>
                              <td className="border border-slate-400 px-2 py-1.5 text-center font-mono font-semibold">
                                {item.dispositionApplied}
                              </td>
                              <td className="border border-slate-400 px-2 py-1.5 text-center font-mono">
                                {item.discoveredByRole}
                              </td>
                              <td className="border border-slate-400 px-2 py-1.5 text-slate-800">
                                {formatMediaCountText(matched)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="border border-slate-400 bg-slate-50 px-4 py-3 text-center text-xs font-medium text-slate-700">
                      ✓ ไม่พบข้อบกพร่องหรือรายการไม่ผ่านเกณฑ์ในล็อตการตรวจสอบนี้
                    </div>
                  )}
                </section>

                {/* Section 4: Serial Unit Inspection Log */}
                <section className="mt-4">
                  <h3 className="mb-1.5 border-l-4 border-slate-900 pl-2 text-xs font-bold uppercase tracking-wide text-slate-900">
                    ส่วนที่ 4: บันทึกผลการตรวจสอบรายเครื่อง (Serial Unit Inspection Log — รวม {inspectedUnits.length} รายการ)
                  </h3>
                  <table className="w-full border-collapse border border-slate-400 text-[10px]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800">
                        <th className="border border-slate-400 px-2 py-1.5 text-center font-semibold">ลำดับ</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-left font-semibold">Serial ปั๊ม</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-left font-semibold">Serial มอเตอร์</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-center font-semibold">ฝ่าย</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-center font-semibold">รอบการตรวจ</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-center font-semibold">ผลการตรวจ</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-left font-semibold">อาการบกพร่องที่พบ</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-left font-semibold">หลักฐานแนบ</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-left font-semibold">ผู้ตรวจสอบ</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-left font-semibold">วัน-เวลาที่บันทึก</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspectedUnits.map((unit, idx) => {
                        const unitMedia = getMediaForUnit(unit);
                        return (
                          <tr key={unit.id} className="break-inside-avoid">
                            <td className="border border-slate-400 px-2 py-1 text-center font-mono">{idx + 1}</td>
                            <td className="border border-slate-400 px-2 py-1 font-mono font-bold text-slate-950">
                              {unit.serialPump}
                            </td>
                            <td className="border border-slate-400 px-2 py-1 font-mono text-slate-700">
                              {unit.serialMotor}
                            </td>
                            <td className="border border-slate-400 px-2 py-1 text-center font-mono font-semibold">
                              {unit.role}
                            </td>
                            <td className="border border-slate-400 px-2 py-1 text-center font-mono">
                              {unit.roundNo > 1 ? `Rework (#${unit.roundNo})` : "รอบปกติ (#1)"}
                            </td>
                            <td className="border border-slate-400 px-2 py-1 text-center font-mono font-bold">
                              {unit.result === "PASS" ? "PASS" : unit.failureDecision ?? "FAIL"}
                            </td>
                            <td className="border border-slate-400 px-2 py-1 text-slate-800">
                              {unit.defectsList ?? "-"}
                            </td>
                            <td className="border border-slate-400 px-2 py-1 text-slate-700">
                              {formatMediaCountText(unitMedia)}
                            </td>
                            <td className="border border-slate-400 px-2 py-1 text-slate-900">
                              {unit.inspectorName}
                            </td>
                            <td className="border border-slate-400 px-2 py-1 font-mono text-slate-700">
                              {unit.completedAt ? new Date(unit.completedAt).toLocaleString("th-TH") : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>

                {/* Section 5: Official Photographic Evidence & Digital Video Reference Log */}
                {(printPhotosOnly.length > 0 || printVideosOnly.length > 0) && (
                  <section className="mt-5 break-before-page">
                    <div className="mb-2 flex items-center justify-between border-b border-slate-400 pb-1">
                      <h3 className="border-l-4 border-slate-900 pl-2 text-xs font-bold uppercase tracking-wide text-slate-900">
                        ส่วนที่ 5: ทะเบียนภาพถ่ายหลักฐานและรายการสื่อประกอบการตรวจสอบ (Inspection Evidence Record)
                      </h3>
                      <span className="font-mono text-[10px] font-semibold text-slate-700">
                        ภาพถ่ายแนบเอกสาร {printPhotosOnly.length} ภาพ · ไฟล์วิดีโออ้างอิงในระบบ {printVideosOnly.length} ไฟล์
                      </span>
                    </div>

                    {/* 5.1 Printed Photographic Evidence Grid (Photos Only) */}
                    {printPhotosOnly.length > 0 && (
                      <div className="grid grid-cols-2 gap-3.5">
                        {printPhotosOnly.map((photo, idx) => (
                          <div
                            key={photo.id}
                            className="break-inside-avoid border border-slate-500 bg-white"
                          >
                            {/* Photo Header Bar */}
                            <div className="flex items-center justify-between border-b border-slate-400 bg-slate-100 px-2.5 py-1 text-[10px]">
                              <span className="font-bold text-slate-900">
                                ภาพถ่ายหลักฐานที่ #{idx + 1} · {formatStageLabel(photo.role, photo.roundNo)}
                              </span>
                              <span className="font-mono font-bold text-slate-800">
                                ความรุนแรง: {photo.severity ?? "MAJOR"}
                              </span>
                            </div>

                            {/* Photo Frame */}
                            <div className="flex h-44 w-full items-center justify-center border-b border-slate-300 bg-slate-50 p-1.5">
                              <img
                                src={photo.uri}
                                alt={photo.defectName}
                                className="max-h-full max-w-full object-contain"
                              />
                            </div>

                            {/* Formal Evidence Specification Table */}
                            <table className="w-full border-collapse text-[10px]">
                              <tbody>
                                <tr className="border-b border-slate-300">
                                  <th className="w-[28%] bg-slate-50 px-2 py-1 text-left font-semibold text-slate-700">
                                    รุ่น / Serial เครื่อง:
                                  </th>
                                  <td className="px-2 py-1 font-mono font-semibold text-slate-950">
                                    {photo.modelCode ?? plan.modelCode} · S/N ปั๊ม: {photo.serialPump}
                                  </td>
                                </tr>
                                <tr className="border-b border-slate-300">
                                  <th className="bg-slate-50 px-2 py-1 text-left font-semibold text-slate-700">
                                    หัวข้อการตรวจ:
                                  </th>
                                  <td className="px-2 py-1 text-slate-900">
                                    {formatTopicHeader(photo.itemSeq, photo.topicCode, photo.itemTitle)}
                                  </td>
                                </tr>
                                <tr className="border-b border-slate-300">
                                  <th className="bg-slate-50 px-2 py-1 text-left font-semibold text-slate-700">
                                    อาการและจุดที่พบ:
                                  </th>
                                  <td className="px-2 py-1 font-semibold text-slate-950">
                                    {photo.defectCode ? `${photo.defectCode} · ` : ""}
                                    {photo.defectName} (จุด/ชิ้นส่วน: {photo.part ?? "ไม่ระบุ"})
                                  </td>
                                </tr>
                                <tr>
                                  <th className="bg-slate-50 px-2 py-1 text-left font-semibold text-slate-700">
                                    ผู้ถ่าย / วัน-เวลา:
                                  </th>
                                  <td className="px-2 py-1 text-slate-800">
                                    {photo.inspectorName} · {new Date(photo.capturedAt).toLocaleString("th-TH")}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 5.2 Digital Video Evidence Summary Box (No video player printed, formal reference table instead) */}
                    {printVideosOnly.length > 0 && (
                      <div className="mt-4 break-inside-avoid border border-slate-600 bg-slate-50 p-3">
                        <div className="mb-1.5 flex items-center justify-between">
                          <p className="text-[11px] font-bold text-slate-900">
                            บันทึกอ้างอิงไฟล์วิดีโอหลักฐานในระบบดิจิทัล (Digital Video Evidence Record — รวม {printVideosOnly.length} ไฟล์)
                          </p>
                          <span className="font-mono text-[10px] font-semibold text-slate-700">
                            อ้างอิงแผนเลขที่: {plan.planNo}
                          </span>
                        </div>
                        <p className="mb-2 text-[10px] text-slate-700">
                          หมายเหตุ: รายงานฉบับนี้มีไฟล์วิดีโอหลักฐานบันทึกไว้ในระบบจำนวน <strong>{printVideosOnly.length} ไฟล์</strong>{" "}
                          (ไม่แสดงผลเป็นวิดีโอบนเอกสารสิ่งพิมพ์ สามารถเปิดตรวจสอบไฟล์วิดีโอต้นฉบับได้ในระบบ QA & QC System) โดยมีรายละเอียดดังนี้:
                        </p>
                        <table className="w-full border-collapse border border-slate-400 bg-white text-[10px]">
                          <thead>
                            <tr className="bg-slate-100 text-slate-800">
                              <th className="border border-slate-400 px-2 py-1 text-center font-semibold">รหัสไฟล์</th>
                              <th className="border border-slate-400 px-2 py-1 text-left font-semibold">ขั้นตอนการตรวจ</th>
                              <th className="border border-slate-400 px-2 py-1 text-left font-semibold">รุ่น / Serial ปั๊ม</th>
                              <th className="border border-slate-400 px-2 py-1 text-left font-semibold">หัวข้อและรายการที่ตรวจ</th>
                              <th className="border border-slate-400 px-2 py-1 text-left font-semibold">อาการและจุดที่พบ</th>
                              <th className="border border-slate-400 px-2 py-1 text-left font-semibold">ผู้บันทึก / เวลา</th>
                            </tr>
                          </thead>
                          <tbody>
                            {printVideosOnly.map((vid, idx) => (
                              <tr key={vid.id}>
                                <td className="border border-slate-400 px-2 py-1 text-center font-mono font-bold text-slate-900">
                                  VID-{String(idx + 1).padStart(2, "0")}
                                </td>
                                <td className="border border-slate-400 px-2 py-1 text-slate-900">
                                  {formatStageLabel(vid.role, vid.roundNo)}
                                </td>
                                <td className="border border-slate-400 px-2 py-1 font-mono font-semibold text-slate-950">
                                  {vid.modelCode ?? plan.modelCode} / {vid.serialPump}
                                </td>
                                <td className="border border-slate-400 px-2 py-1 text-slate-800">
                                  {formatTopicHeader(vid.itemSeq, vid.topicCode, vid.itemTitle)}
                                </td>
                                <td className="border border-slate-400 px-2 py-1 font-medium text-slate-900">
                                  {vid.defectCode ? `${vid.defectCode} · ` : ""}
                                  {vid.defectName} ({vid.part ?? "ไม่ระบุชิ้นส่วน"})
                                </td>
                                <td className="border border-slate-400 px-2 py-1 text-slate-700">
                                  {vid.inspectorName} · {new Date(vid.capturedAt).toLocaleString("th-TH")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                )}

                {/* Section 6: Official Certification & Signatures */}
                <section className="mt-6 break-inside-avoid pt-2">
                  <h3 className="mb-2 border-l-4 border-slate-900 pl-2 text-xs font-bold uppercase tracking-wide text-slate-900">
                    ส่วนที่ 6: การลงนามรับรองผลการตรวจสอบคุณภาพ (Official Certification & Electronic Approvals)
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    {approvals.map((appr, idx) => (
                      <div key={idx} className="border border-slate-500 bg-white p-3 text-center">
                        <p className="border-b border-slate-300 pb-1.5 text-[11px] font-bold text-slate-900">
                          {appr.title}
                        </p>
                        <div className="my-4 flex min-h-[44px] flex-col items-center justify-center">
                          {appr.status === "APPROVED" ? (
                            <>
                              <span className="inline-block border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider text-emerald-900">
                                ELECTRONICALLY SIGNED
                              </span>
                              <p className="mt-1 text-xs font-bold text-slate-950">({appr.name})</p>
                            </>
                          ) : (
                            <div className="w-4/5 border-b border-dashed border-slate-400 pt-5 text-[10px] text-slate-500">
                              (รอการตรวจสอบและลงนาม)
                            </div>
                          )}
                        </div>
                        <div className="border-t border-slate-300 pt-1.5 text-[10px] text-slate-700">
                          <p>รหัสพนักงาน: {appr.employeeCode}</p>
                          <p>วันที่: {appr.signedAt ? new Date(appr.signedAt).toLocaleString("th-TH") : "......../......../........"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Official Document Footer */}
                <footer className="mt-6 flex items-center justify-between border-t-2 border-slate-900 pt-2 text-[9.5px] text-slate-600">
                  <span>
                    บริษัท ธีรวัฒน์ เครื่องอัดลม จำกัด (TIRAWAT AIR COMPRESSORS LIMITED) · ระบบบริหารและควบคุมคุณภาพ QA & QC System (FM-QA-S15)
                  </span>
                  <span className="font-mono">
                    พิมพ์เมื่อ: {new Date().toLocaleString("th-TH")}
                  </span>
                </footer>
              </div>
            </div>
          );
        })()}

        {/* Interactive Multi-Media Evidence Popup Card (Lightbox & Inspection Context) */}
        {typeof document !== "undefined" &&
          evidenceModal &&
          evidenceModal.items.length > 0 &&
          (() => {
            const activeItem = evidenceModal.items[evidenceModal.index] ?? evidenceModal.items[0];
            const totalItems = evidenceModal.items.length;
            return createPortal(
              <div
                role="dialog"
                aria-modal="true"
                aria-label={evidenceModal.title}
                className="app-theme-sand font-sarabun fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 sm:p-6 backdrop-blur-sm print:hidden"
                onClick={() => setEvidenceModal(null)}
              >
                <div
                  className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-carbon-700 bg-carbon-900 text-ti-50 shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Modal Top Header */}
                  <div className="flex items-center justify-between gap-4 border-b border-carbon-700/80 bg-carbon-950/60 px-5 py-3.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-ember-500/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-ember-400">
                          รายการที่ {evidenceModal.index + 1} / {totalItems}
                        </span>
                        <h3 className="truncate text-sm sm:text-base font-bold text-ti-50">{evidenceModal.title}</h3>
                      </div>
                      {evidenceModal.subtitle && (
                        <p className="mt-0.5 truncate text-xs text-ti-400">{evidenceModal.subtitle}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setEvidenceModal(null)}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-carbon-700 bg-carbon-800 text-ti-300 transition-colors hover:bg-carbon-700 hover:text-ti-50"
                      aria-label="ปิดหน้าต่างหลักฐาน"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Modal Body: Left Media Viewer + Right Context Details Card */}
                  <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12">
                    {/* Left: Photo / Video Stage + Navigation & Filmstrip */}
                    <div className="flex flex-col justify-between bg-carbon-950 p-4 lg:col-span-7">
                      <div className="relative flex min-h-[260px] sm:min-h-[340px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-carbon-800 bg-black">
                        {activeItem.kind === "VIDEO" ? (
                          <video
                            key={activeItem.uri}
                            src={activeItem.uri}
                            controls
                            autoPlay
                            className="max-h-[48vh] w-full object-contain"
                          />
                        ) : (
                          <img
                            src={activeItem.uri}
                            alt={activeItem.defectName}
                            className="max-h-[48vh] w-full object-contain"
                          />
                        )}
                      </div>

                      {/* Dedicated Navigation Bar & Thumbnail Filmstrip */}
                      {totalItems > 1 && (
                        <div className="mt-3 space-y-2 border-t border-carbon-800 pt-3">
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setEvidenceModal((prev) =>
                                  prev
                                    ? { ...prev, index: (prev.index - 1 + prev.items.length) % prev.items.length }
                                    : null
                                )
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-carbon-700 bg-carbon-800 px-3 py-1.5 text-xs font-semibold text-ti-100 transition-colors hover:border-ember-500 hover:bg-ember-500 hover:text-black"
                            >
                              ← รายการก่อนหน้า
                            </button>
                            <span className="font-mono text-xs text-ti-400">
                              ไฟล์ที่ {evidenceModal.index + 1} จาก {totalItems} ({activeItem.kind === "VIDEO" ? "วิดีโอ" : "รูปภาพ"})
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setEvidenceModal((prev) =>
                                  prev
                                    ? { ...prev, index: (prev.index + 1) % prev.items.length }
                                    : null
                                )
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-carbon-700 bg-carbon-800 px-3 py-1.5 text-xs font-semibold text-ti-100 transition-colors hover:border-ember-500 hover:bg-ember-500 hover:text-black"
                            >
                              รายการถัดไป →
                            </button>
                          </div>

                          <div className="flex items-center gap-2 overflow-x-auto pb-1">
                            {evidenceModal.items.map((thumb, idx) => (
                              <button
                                key={thumb.id}
                                type="button"
                                onClick={() => setEvidenceModal((prev) => (prev ? { ...prev, index: idx } : null))}
                                className={`group relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                                  idx === evidenceModal.index
                                    ? "border-ember-500 ring-2 ring-ember-500/40"
                                    : "border-carbon-700 opacity-60 hover:opacity-100"
                                }`}
                              >
                                {thumb.kind === "VIDEO" ? (
                                  <div className="flex h-full w-full items-center justify-center bg-carbon-900 font-mono text-[10px] font-bold text-ember-400">
                                    ▶ VIDEO
                                  </div>
                                ) : (
                                  <img src={thumb.uri} alt={thumb.defectName} className="h-full w-full object-cover" />
                                )}
                                <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 font-mono text-[9px] text-ti-200">
                                  #{idx + 1}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Complete Inspection Context Card */}
                    <div className="flex flex-col justify-between space-y-4 border-t border-carbon-800 bg-carbon-900 p-5 text-xs lg:col-span-5 lg:border-l lg:border-t-0">
                      <div className="space-y-3.5">
                        {/* 1. Inspection Stage */}
                        <div className="rounded-xl border border-carbon-700 bg-carbon-800/60 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-ti-400">
                            1. ขั้นตอนการตรวจสอบ (Inspection Stage)
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                            <span
                              className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold ${
                                activeItem.role === "QA"
                                  ? "bg-cyan-500/20 text-cyan-300"
                                  : (activeItem.roundNo ?? 1) > 1
                                  ? "bg-amber-500/20 text-amber-300"
                                  : "bg-ember-500/20 text-ember-400"
                              }`}
                            >
                              {formatStageLabel(activeItem.role, activeItem.roundNo)}
                            </span>
                            <span className="font-mono text-[11px] text-ti-300">
                              เครื่องลำดับที่ #{activeItem.cycleNo ?? 1}
                            </span>
                          </div>
                        </div>

                        {/* 2. Model & Serial Info */}
                        <div className="rounded-xl border border-carbon-700 bg-carbon-800/60 p-3 space-y-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-ti-400">
                            2. โมเดลและหมายเลขเครื่อง (Model & Serial)
                          </p>
                          <div className="grid grid-cols-2 gap-2 pt-0.5">
                            <div>
                              <span className="text-[11px] text-ti-400">รุ่นสินค้า (Model):</span>
                              <p className="font-mono text-sm font-bold text-ti-50">
                                {activeItem.modelCode ?? plan.modelCode}
                              </p>
                            </div>
                            <div>
                              <span className="text-[11px] text-ti-400">แบรนด์:</span>
                              <p className="font-medium text-ti-100">
                                {plan.brandName} ({plan.pumpType ?? "ทั่วไป"})
                              </p>
                            </div>
                            <div>
                              <span className="text-[11px] text-ti-400">Serial ปั๊ม:</span>
                              <p className="font-mono font-semibold text-ember-400">{activeItem.serialPump}</p>
                            </div>
                            <div>
                              <span className="text-[11px] text-ti-400">Serial มอเตอร์:</span>
                              <p className="font-mono text-ti-200">{activeItem.serialMotor ?? "-"}</p>
                            </div>
                          </div>
                        </div>

                        {/* 3. Checklist Topic & Item */}
                        <div className="rounded-xl border border-carbon-700 bg-carbon-800/60 p-3 space-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-ti-400">
                            3. หัวข้อและรายการที่ตรวจ (Checklist Topic & Item)
                          </p>
                          <p className="text-sm font-semibold text-ti-50">
                            {formatTopicHeader(activeItem.itemSeq, activeItem.topicCode, activeItem.itemTitle)}
                          </p>
                          {activeItem.topicCode && (
                            <p className="font-mono text-[11px] text-ti-400">
                              รหัสหัวข้ออ้างอิง: {activeItem.topicCode}
                            </p>
                          )}
                        </div>

                        {/* 4. Defect & Part Details */}
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                              4. อาการและจุดบกพร่องที่พบ (Defect & Part)
                            </p>
                            {activeItem.severity && (
                              <span
                                className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${
                                  activeItem.severity === "CRITICAL"
                                    ? "bg-red-500/30 text-red-200"
                                    : activeItem.severity === "MAJOR"
                                    ? "bg-amber-500/30 text-amber-200"
                                    : "bg-blue-500/30 text-blue-200"
                                }`}
                              >
                                {activeItem.severity}
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="text-[11px] text-ti-300">อาการที่ตรวจพบ:</span>
                            <p className="text-sm font-bold text-amber-300">
                              {activeItem.defectCode ? `${activeItem.defectCode} · ` : ""}
                              {activeItem.defectName}
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-[11px] text-ti-300">จุด / รายการย่อย (Part):</span>
                              <p className="font-semibold text-ti-50">{activeItem.part ?? "ไม่ระบุชิ้นส่วนย่อย"}</p>
                            </div>
                            <div>
                              <span className="text-[11px] text-ti-300">การจัดการ (Disposition):</span>
                              <p className="font-mono font-semibold text-ti-100">
                                {activeItem.dispositionApplied ?? "REWORK"}
                              </p>
                            </div>
                          </div>
                          {activeItem.itemRemark && (
                            <div className="border-t border-amber-500/20 pt-1.5">
                              <span className="text-[11px] text-ti-300">หมายเหตุผู้ตรวจ:</span>
                              <p className="italic text-ti-100">“{activeItem.itemRemark}”</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 5. Inspector & Timestamp Footer */}
                      <div className="flex items-center justify-between rounded-xl border border-carbon-700 bg-carbon-950/60 px-3.5 py-2.5 text-[11px] text-ti-300">
                        <div>
                          <span className="text-ti-400">5. ผู้บันทึกหลักฐาน: </span>
                          <span className="font-semibold text-ti-100">{activeItem.inspectorName}</span>
                        </div>
                        <div className="font-mono text-ti-400">
                          {new Date(activeItem.capturedAt).toLocaleString("th-TH")}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            );
          })()}
    </div>
  );
}
