"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CheckCircleIcon, ChevronRightIcon, JobsIcon, ScanIcon, WarningIcon } from "@/components/dom/Icons";
import { CardsSkeleton } from "@/components/feedback/CardsSkeleton";
import { LoadError } from "@/components/feedback/LoadError";
import { StartInspectionModal } from "@/components/inspections/StartInspectionModal";
import { QcBar } from "@/components/plans/PlanBits";
import type { InspectorHomePayload, InspectorQuickAction } from "@/lib/inspections/inspector-dashboard";
import { useInspectorDashboard } from "./useInspectorDashboard";

const cardClass = "app-panel rounded-panel border border-carbon-700/80 bg-carbon-800";

type Props = {
  initialMonth?: string;
};

export function InspectorHomeDashboard({ initialMonth }: Props) {
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth || "");
  const { data, loading, error, reload } = useInspectorDashboard(selectedMonth || null);
  const [inspectingJob, setInspectingJob] = useState<{
    id: string;
    woNo: string;
    planId: number;
    modelCode: string;
    description: string | null;
    qtyNeed: number;
    qtyDone: number;
    vendorName?: string | null;
  } | null>(null);

  if (!data && error) return <LoadError message={error} onRetry={reload} />;
  if (!data && loading) return <CardsSkeleton label="กำลังโหลดข้อมูล..." />;

  const payload: InspectorHomePayload | null = data;
  if (!payload) return null;

  const { urgentStatus, monthlyPerformance, quickActions, availableMonths } = payload;
  const dimmed = loading ? "opacity-60" : "";

  return (
    <div className={`space-y-6 transition-opacity ${dimmed}`}>
      {error && <LoadError message={error} onRetry={reload} />}

      {/* Month Switcher Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-carbon-800 border border-carbon-700/80 rounded-panel px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-ti-400 font-medium">ช่วงเวลาสรุปผล:</span>
          <span className="text-sm font-semibold text-ti-50">{monthlyPerformance.monthLabel}</span>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <label htmlFor="month-select" className="text-xs text-ti-400 font-medium">
            เลือกเดือน:
          </label>
          <select
            id="month-select"
            value={payload.selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-xs font-mono bg-carbon-900 border border-carbon-600 rounded-control px-2.5 py-1 text-ti-100 hover:border-ti-400 focus:outline-none focus:border-ember-500 transition-colors"
          >
            {availableMonths.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ZONE 1: Pending Tasks Status */}
      <section aria-label="สถานะงานค้าง" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ti-200 uppercase tracking-wider">
              สถานะงานที่รอดำเนินการ
            </h2>
            {urgentStatus.reworkCount > 0 && (
              <span className="rounded border border-fail/40 bg-fail/15 px-2 py-0.5 text-xs font-semibold text-fail">
                Rework {urgentStatus.reworkCount} ตัว
              </span>
            )}
          </div>
          <Link
            href="/jobs"
            className="text-xs text-ti-400 hover:text-ember-400 flex items-center gap-1 transition-colors"
          >
            <span>เปิดหน้ารายการงาน</span>
            <ChevronRightIcon className="size-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <IndustrialKpi
            label="งาน Rework รอตรวจซ้ำ"
            value={urgentStatus.reworkCount}
            unit="ตัว"
            icon={<WarningIcon className="size-4.5" />}
            iconTone={urgentStatus.reworkCount > 0 ? "text-fail border-fail/40 bg-fail/15" : "text-ti-400"}
            valueTone={urgentStatus.reworkCount > 0 ? "text-fail" : "text-ti-50"}
            subtext={urgentStatus.reworkCount > 0 ? "แก้ไขแล้ว รอตรวจยืนยัน" : "ไม่มีงานค้างรอตรวจซ้ำ"}
          />

          <IndustrialKpi
            label="กำลังดำเนินการ"
            value={urgentStatus.inProgressCount}
            unit="ใบงาน"
            icon={<JobsIcon className="size-4.5" />}
            iconTone={urgentStatus.inProgressCount > 0 ? "text-amber-400 border-amber-500/30 bg-amber-500/10" : "text-ti-400"}
            valueTone={urgentStatus.inProgressCount > 0 ? "text-amber-300" : "text-ti-50"}
            subtext="ใบงานที่เริ่มตรวจแล้วบางส่วน"
          />

          <IndustrialKpi
            label="ยังไม่เริ่มตรวจ"
            value={urgentStatus.notStartedCount}
            unit="ใบงาน"
            icon={<CheckCircleIcon className="size-4.5" />}
            iconTone="text-ti-400"
            valueTone="text-ti-50"
            subtext="ใบงานใหม่ที่ได้รับมอบหมาย"
          />

          <IndustrialKpi
            label="ยอดคงเหลือที่ต้องตรวจ"
            value={urgentStatus.totalPendingUnits}
            unit="ตัว"
            icon={<ScanIcon className="size-4.5" />}
            iconTone="text-ti-200"
            valueTone="text-ti-50"
            subtext="รวมทุกใบงานที่ยังไม่เสร็จ"
          />
        </div>
      </section>

      {/* ZONE 2: Monthly Inspection Summary */}
      <section aria-label="สรุปผลการตรวจประจำเดือน" className={`${cardClass} p-5 space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-carbon-700/70 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-ti-200 uppercase tracking-wider">
              สรุปผลการตรวจประจำเดือน
            </h2>
            <p className="text-xs text-ti-400 mt-0.5">
              ข้อมูลสะสมประจำงวด {monthlyPerformance.monthLabel} ของ {payload.inspector.fullName} ({payload.inspector.employeeCode})
            </p>
          </div>

          {monthlyPerformance.reworkResolvedCount > 0 && (
            <span className="self-start sm:self-auto rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-mono text-emerald-300">
              ตรวจผ่านงาน Rework แล้ว {monthlyPerformance.reworkResolvedCount} ตัว
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-1">
          {/* 1. Total Inspected */}
          <div className="space-y-1">
            <span className="text-xs text-ti-400 font-medium">ยอดตรวจสะสมทั้งหมด</span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl sm:text-4xl font-semibold text-ti-50">
                {monthlyPerformance.totalInspected}
              </span>
              <span className="text-xs text-ti-400">ตัว</span>
            </div>
            <p className="text-xs text-ti-400 font-mono">
              ผ่าน {monthlyPerformance.passedUnits} · ไม่ผ่าน {monthlyPerformance.failedUnits}
            </p>
          </div>

          {/* 2. Pass Rate */}
          <div className="space-y-1.5">
            <span className="text-xs text-ti-400 font-medium">อัตราการผ่านรอบแรก</span>
            <div className="flex items-baseline gap-2">
              <span
                className={`font-mono text-3xl sm:text-4xl font-semibold ${
                  monthlyPerformance.passRate >= 95
                    ? "text-emerald-400"
                    : monthlyPerformance.passRate >= 85
                      ? "text-amber-400"
                      : "text-fail"
                }`}
              >
                {monthlyPerformance.passRate}%
              </span>
              <span className="text-xs text-ti-400 font-mono">Pass Rate</span>
            </div>
            <QcBar
              done={monthlyPerformance.passedUnits}
              required={Math.max(1, monthlyPerformance.totalInspected)}
              className="w-full"
            />
          </div>

          {/* 3. Completed Work Orders */}
          <div className="space-y-1">
            <span className="text-xs text-ti-400 font-medium">ใบงานที่ตรวจปิดแล้ว</span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl sm:text-4xl font-semibold text-ti-50">
                {monthlyPerformance.completedWorkOrders}
              </span>
              <span className="text-xs text-ti-400">ใบงาน</span>
            </div>
            <p className="text-xs text-ti-400">ตรวจครบตามยอดในเดือนนี้</p>
          </div>
        </div>

        {/* Insight: Top Defect Finding */}
        <div className="pt-2 border-t border-carbon-700/60">
          <div className="flex items-center gap-2 text-xs text-ti-300">
            <span className="text-ti-400 font-medium">จุดบกพร่องที่พบบ่อยสุด:</span>
            {monthlyPerformance.topDefectName ? (
              <span className="rounded border border-carbon-600 bg-carbon-900 px-2 py-0.5 font-mono text-amber-300">
                {monthlyPerformance.topDefectName}
              </span>
            ) : (
              <span className="text-ti-400 font-mono">- ไม่มีประวัติของเสีย -</span>
            )}
          </div>
        </div>
      </section>

      {/* ZONE 3: Quick Inspection Actions */}
      <section aria-label="รายการงานค้างที่ต้องตรวจต่อ" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ti-200 uppercase tracking-wider">
            งานค้างที่ต้องดำเนินการ ({quickActions.length})
          </h2>
          <Link
            href="/jobs"
            className="text-xs text-ti-400 hover:text-ember-400 flex items-center gap-1 transition-colors"
          >
            <span>ดูทั้งหมด</span>
            <ChevronRightIcon className="size-3.5" />
          </Link>
        </div>

        {quickActions.length === 0 ? (
          <p className="rounded-panel border border-dashed border-carbon-600 p-6 text-sm text-ti-400 text-center">
            ไม่มีรายการงานค้างในขณะนี้
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickActions.map((action) => (
              <ActionCard
                key={`${action.kind}-${action.id}`}
                action={action}
                onInspect={(act) => {
                  if (act.kind === "inspect") {
                    setInspectingJob({
                      id: act.id,
                      woNo: act.woNo,
                      planId: act.planId,
                      modelCode: act.modelCode,
                      description: act.description,
                      qtyNeed: act.qtyNeed,
                      qtyDone: act.qtyDone,
                      vendorName: act.vendorName,
                    });
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Direct Modal Runner Launch */}
      {inspectingJob && (
        <StartInspectionModal
          isOpen={inspectingJob !== null}
          workOrder={inspectingJob}
          onClose={() => setInspectingJob(null)}
        />
      )}
    </div>
  );
}

function IndustrialKpi({
  label,
  value,
  unit,
  icon,
  iconTone = "text-ti-200",
  valueTone = "text-ti-50",
  subtext,
}: {
  label: string;
  value: number;
  unit: string;
  icon: ReactNode;
  iconTone?: string;
  valueTone?: string;
  subtext: string;
}) {
  return (
    <div className={`${cardClass} p-4.5 space-y-3`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-ti-400 font-medium">{label}</span>
        <div className={`size-8 rounded-control bg-carbon-700 border border-carbon-600 grid place-items-center ${iconTone}`}>
          {icon}
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span className={`font-mono text-3xl font-semibold ${valueTone}`}>{value}</span>
        <span className="text-xs text-ti-400">{unit}</span>
      </div>

      <p className="text-xs text-ti-400 truncate">{subtext}</p>
    </div>
  );
}

function ActionCard({
  action,
  onInspect,
}: {
  action: InspectorQuickAction;
  onInspect: (action: InspectorQuickAction) => void;
}) {
  if (action.kind === "rework") {
    return (
      <div className={`${cardClass} border-fail/40 p-4 space-y-3 flex flex-col justify-between`}>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded border border-fail/40 bg-fail/15 px-2 py-0.5 text-xs font-semibold text-fail">
              Rework รอบ {action.roundNo}
            </span>
            <span className="font-mono text-xs text-ti-400">{action.woNo}</span>
          </div>

          <div>
            <div className="font-mono text-base font-bold text-ti-50">{action.serialPump}</div>
            <div className="text-xs text-ti-300 font-medium mt-0.5">{action.modelCode}</div>
          </div>

          <div className="text-xs text-ti-400 border-t border-carbon-700/60 pt-2">
            <span className="text-ti-400">อาการเดิม: </span>
            <span className="text-fail font-mono">{action.defectNames || "พบจุดบกพร่อง"}</span>
          </div>
        </div>

        <Link
          href={`/inspections/${action.id}/rework`}
          className="h-10 w-full rounded-control bg-fail hover:bg-fail/90 text-carbon-950 font-semibold text-xs flex items-center justify-center transition-colors"
        >
          <span>ตรวจซ้ำ (Rework)</span>
        </Link>
      </div>
    );
  }

  const isStarted = action.qtyDone > 0;

  return (
    <div className={`${cardClass} p-4 space-y-3 flex flex-col justify-between`}>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs rounded border border-carbon-600 bg-carbon-700 px-2 py-0.5 text-ti-200">
            {action.woNo}
          </span>
          <span className="text-xs text-ti-400 font-mono">คงเหลือ {action.remainingQty} ตัว</span>
        </div>

        <div>
          <div className="text-sm font-semibold text-ti-50">{action.modelCode}</div>
          {action.description && <div className="text-xs text-ti-400 truncate">{action.description}</div>}
        </div>

        <div className="space-y-1 border-t border-carbon-700/60 pt-2">
          <div className="flex items-center justify-between text-xs text-ti-400 font-mono">
            <span>ตรวจแล้ว</span>
            <span>{action.qtyDone} / {action.qtyNeed} ตัว</span>
          </div>
          <QcBar done={action.qtyDone} required={action.qtyNeed} className="w-full" />
        </div>
      </div>

      {action.draftInspectionId ? (
        <Link
          href={`/inspections/${action.draftInspectionId}`}
          className="h-10 w-full rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 text-carbon-950 font-semibold text-xs flex items-center justify-center transition-colors cursor-pointer"
        >
          <span>ตรวจต่อ ({action.draftSerialPump || "เครื่องที่ค้างอยู่"}) →</span>
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => onInspect(action)}
          className="h-10 w-full rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 text-carbon-950 font-semibold text-xs flex items-center justify-center transition-colors cursor-pointer"
        >
          <span>{isStarted ? `เริ่มตรวจเครื่องถัดไป (${action.qtyDone + 1}/${action.qtyNeed})` : "เริ่มตรวจเครื่องแรก"}</span>
        </button>
      )}
    </div>
  );
}
