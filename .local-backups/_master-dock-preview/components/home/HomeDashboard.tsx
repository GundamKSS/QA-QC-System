"use client";

import type { ReactNode } from "react";
import { ChevronRightIcon, JobsIcon, PlansIcon, SearchIcon, WarningIcon } from "@/components/dom/Icons";
import { LoadError } from "@/components/feedback/LoadError";
import { ChecklistBadge, Deadline, ProgressBadge, planProgress, QcBar } from "@/components/plans/PlanBits";
import { ShellLink } from "@/components/shell/ShellLink";
import type { HomeDashboardPayload } from "@/lib/plans/home";
import { HOME_RECENT_LIMIT } from "@/lib/plans/home-query";
import { DEADLINE_SOON_DAYS } from "@/lib/plans/rules";
import { useHomeDashboard } from "./useHomeDashboard";

const cardClass = "app-panel rounded-panel border border-carbon-700/80 bg-carbon-800";

type Props = {
  /** The search words of the recent-plans table, from `?q=` (parsed by the page). */
  query: string;
  /** QC Head, QA Head, Admin: the recent plans and the nearest deadlines come with the totals. Other roles get the totals only. */
  seesPlans: boolean;
};

/**
 * The plan part of the home page: four totals and, for the plan roles, the newest plans and the nearest 90-day
 * deadlines. The page draws the greeting and checks the role; everything here is read from `GET /api/home`.
 * The two grids are always there (as placeholders until the data comes), so nothing jumps when it does — and
 * they are separate top-level pieces, as before, because `.home-enter` staggers its direct children.
 */
export function HomeDashboard({ query, seesPlans }: Props) {
  const { data, loading, error, reload } = useHomeDashboard(query);
  if (!data && error) return <LoadError message={error} onRetry={reload} />;

  const dimmed = loading && data !== null ? "opacity-60" : "";
  return (
    <>
      {error && <LoadError message={error} onRetry={reload} />}
      <div
        aria-busy={loading}
        {...(data ? {} : { role: "status", "aria-label": "กำลังโหลดภาพรวม" })}
        className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 transition-opacity ${dimmed}`}
      >
        {data ? <Kpis summary={data.summary} /> : <KpiPlaceholders />}
      </div>

      {seesPlans && (
        <div aria-busy={loading} className={`grid grid-cols-1 lg:grid-cols-3 gap-6 transition-opacity ${dimmed}`}>
          <RecentPlans query={query} recent={data?.recent ?? null} />
          <Deadlines deadlines={data?.deadlines ?? null} today={data?.today ?? ""} />
        </div>
      )}
    </>
  );
}

function Kpis({ summary }: { summary: HomeDashboardPayload["summary"] }) {
  const progress = summary.qcRequired ? Math.min(100, Math.round((summary.qcDone / summary.qcRequired) * 100)) : 0;
  return (
    <>
      <Kpi label="แผนตรวจที่เปิดอยู่" icon={<PlansIcon className="size-4.5" />} iconTone="text-ember-400">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-semibold text-ti-50">{summary.live}</span>
          <span className="text-xs text-ti-400">แผนงาน</span>
        </div>
        <p className="text-xs text-ti-400 mt-1">ยังไม่เริ่มตรวจ {summary.notStarted} · เสร็จแล้ว {summary.completed}</p>
      </Kpi>

      <Kpi label="ความคืบหน้า QC (แผนที่เปิดอยู่)" icon={<JobsIcon className="size-4.5" />} iconTone="text-ti-200">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-semibold text-ti-50">{summary.qcDone}</span>
          <span className="text-xs text-ti-400">/ {summary.qcRequired} เครื่อง ({progress}%)</span>
        </div>
        <QcBar done={summary.qcDone} required={summary.qcRequired} className="mt-2 w-full" />
      </Kpi>

      <Kpi label="ใกล้ครบกำหนด 90 วัน" icon={<WarningIcon className="size-4.5" />} iconTone="text-ember-400">
        <div className="flex items-baseline gap-2">
          <span className={`font-mono text-3xl font-semibold ${summary.deadlineSoon ? "text-ember-400" : "text-ti-50"}`}>{summary.deadlineSoon}</span>
          <span className="text-xs text-ti-400">แผน</span>
        </div>
        <p className="text-xs text-ti-400 mt-1">Invoice ที่เหลือไม่เกิน {DEADLINE_SOON_DAYS} วัน</p>
      </Kpi>

      <Kpi label="เลยกำหนด / รอของ" icon={<WarningIcon className="size-4.5" />} iconTone="text-fail">
        <div className="flex items-baseline gap-2">
          <span className={`font-mono text-3xl font-semibold ${summary.overdue ? "text-fail" : "text-ti-50"}`}>{summary.overdue}</span>
          <span className="text-xs text-ti-400">แผนเลยกำหนด</span>
        </div>
        <p className="text-xs text-ti-400 mt-1">ติดธง “รอของ” {summary.waitingGoods} แผน</p>
      </Kpi>
    </>
  );
}

function Kpi({ label, icon, iconTone, children }: { label: string; icon: ReactNode; iconTone: string; children: ReactNode }) {
  return (
    <div className={`${cardClass} home-kpi p-4.5 space-y-3`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-ti-400 font-medium">{label}</span>
        <div className={`size-8 rounded-control bg-carbon-700 border border-carbon-600 grid place-items-center ${iconTone}`}>{icon}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

/** Four cards of the same make as the real ones (same padding, same rows), so they swap without a jump. */
function KpiPlaceholders() {
  return (
    <>
      {[0, 1, 2, 3].map((index) => (
        <div key={index} aria-hidden="true" className={`${cardClass} home-kpi p-4.5 space-y-3`}>
          <div className="flex items-center justify-between">
            <div className="h-3 w-32 animate-pulse rounded bg-carbon-700" />
            <div className="size-8 animate-pulse rounded-control bg-carbon-700" />
          </div>
          <div className="space-y-2">
            <div className="h-9 w-20 animate-pulse rounded bg-carbon-700" />
            <div className="h-3 w-40 animate-pulse rounded bg-carbon-700" />
          </div>
        </div>
      ))}
    </>
  );
}

/** The newest plans with a search box (a plain GET form to `/home?q=`). `recent` is null until the data is here. */
function RecentPlans({ query, recent }: { query: string; recent: HomeDashboardPayload["recent"] }) {
  return (
    <div className="min-w-0 lg:col-span-2 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-medium text-ti-50">แผนการตรวจคุณภาพล่าสุด</h2>
          <p className="text-xs text-ti-400">แผนที่เปิดล่าสุด {HOME_RECENT_LIMIT} รายการ (ไม่รวมแผนที่ยกเลิก)</p>
        </div>

        <form action="/home" method="get" role="search" className="flex items-center gap-2">
          <div className="relative">
            <button type="submit" aria-label="ค้นหาแผน" className="absolute left-0 top-0 grid size-9 place-items-center text-ti-400 hover:text-ember-400"><SearchIcon className="size-4" /></button>
            {/* The address is the truth: when the search words in it change, the box is remounted to show them. */}
            <input
              key={`q:${query}`}
              type="text"
              name="q"
              aria-label="ค้นหาเลขแผน Invoice/PO รุ่น หรือผู้ขาย"
              defaultValue={query}
              maxLength={200}
              placeholder="ค้นหาแผน, Invoice, รุ่น..."
              className="h-9 pl-9 pr-3 rounded-control bg-carbon-800 border border-carbon-600 text-xs text-ti-50 placeholder:text-ti-500 focus:outline-hidden focus:border-ember-500 focus:ring-1 focus:ring-ember-500 w-48 sm:w-56"
            />
          </div>
        </form>
      </div>

      <div className={`${cardClass} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-carbon-700/80 bg-carbon-900 font-mono text-ti-400 text-xs">
                <th className="whitespace-nowrap py-3 px-4 font-medium">แผน / เอกสารอ้างอิง</th>
                <th className="whitespace-nowrap py-3 px-4 font-medium">รุ่น / ผู้ขาย</th>
                <th className="whitespace-nowrap py-3 px-4 font-medium text-center">ล็อต / ต้องตรวจ QC</th>
                <th className="whitespace-nowrap py-3 px-4 font-medium">ความคืบหน้า</th>
                <th className="whitespace-nowrap py-3 px-4 font-medium text-center">สถานะ</th>
                <th className="whitespace-nowrap py-3 px-4 font-medium text-right">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-700/50">
              {recent === null &&
                [0, 1, 2].map((index) => (
                  <tr key={index} aria-hidden="true">
                    <td colSpan={6} className="py-3.5 px-4"><div className="h-10 animate-pulse rounded bg-carbon-700" /></td>
                  </tr>
                ))}
              {recent?.rows.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-ti-400">{query ? "ไม่พบแผนที่ตรงกับคำค้น" : "ยังไม่มีแผนตรวจ"}</td></tr>
              )}
              {recent?.rows.map((plan) => (
                <tr key={plan.id} className="hover:bg-carbon-700/30 transition-colors">
                  <td className="whitespace-nowrap py-3.5 px-4 font-mono">
                    <div className="font-semibold text-ti-50">{plan.planNo}</div>
                    <div className="text-xs text-ti-500 mt-0.5">{plan.docType === "INVOICE" ? "Invoice" : "PO"} {plan.docNo}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-medium text-ti-50">{plan.modelCode}</div>
                    <div className="text-xs text-ti-400 truncate max-w-[220px] mt-0.5">{plan.vendorName ?? "ยังไม่ระบุ Vendor"}</div>
                  </td>
                  <td className="whitespace-nowrap py-3.5 px-4 text-center font-mono">
                    <div className="text-ti-50 font-medium">Lot {plan.lotQty}</div>
                    <div className="text-xs text-ti-400 mt-0.5">QC {plan.qcRequired} ตัว</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center justify-between gap-2 text-xs mb-1 font-mono">
                      <span className="text-ti-200">{plan.qcDoneTotal}/{plan.qcRequired}</span>
                      <ProgressBadge progress={planProgress(plan)} />
                    </div>
                    <QcBar done={plan.qcDoneTotal} required={plan.qcRequired} className="w-32" />
                  </td>
                  <td className="whitespace-nowrap py-3.5 px-4 text-center">
                    <ChecklistBadge status={plan.status} />
                    {plan.waitingGoods && <div className="mt-1 text-xs text-ember-400">รอของ</div>}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <ShellLink
                      href={`/plans/${plan.id}`}
                      className="inline-flex items-center gap-1 text-xs text-ti-200 hover:text-ember-400 font-medium transition-colors"
                    >
                      <span>ดูรายละเอียด</span>
                      <ChevronRightIcon className="size-3" />
                    </ShellLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-3 border-t border-carbon-700/60 bg-carbon-900 text-center">
          <ShellLink
            href={query ? `/plans?q=${encodeURIComponent(query)}` : "/plans"}
            className="text-xs text-ti-400 hover:text-ember-400 transition-colors font-medium"
          >
            {recent && recent.total > recent.rows.length ? `ดูทั้งหมด ${recent.total} แผน →` : "ไปที่รายการแผนตรวจ →"}
          </ShellLink>
        </div>
      </div>
    </div>
  );
}

/** The live Invoice plans closest to their 90-day deadline. `deadlines` is null until the data is here. */
function Deadlines({ deadlines, today }: { deadlines: HomeDashboardPayload["deadlines"]; today: string }) {
  return (
    <div className={`${cardClass} p-4 space-y-3.5 self-start`}>
      <div className="flex items-center gap-2">
        <WarningIcon className="size-4 text-ember-400" />
        <h3 className="text-sm font-medium text-ti-50">กำหนดตรวจ 90 วันที่ใกล้ที่สุด</h3>
      </div>
      {deadlines === null ? (
        <div aria-hidden="true" className="space-y-2.5">
          {[0, 1, 2].map((index) => <div key={index} className="h-[4.25rem] animate-pulse rounded-panel bg-carbon-700" />)}
        </div>
      ) : deadlines.length === 0 ? (
        <p className="text-xs text-ti-400">ไม่มีแผน Invoice ที่ยังเปิดอยู่</p>
      ) : (
        <ul className="space-y-2.5">
          {deadlines.map((plan) => (
            <li key={plan.id}>
              <ShellLink href={`/plans/${plan.id}`} className="block p-3 rounded-panel border border-carbon-700 bg-carbon-900 hover:border-carbon-600 space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-ti-50 font-semibold">{plan.planNo}</span>
                  <Deadline deadline={plan.qcDeadline} today={today} docType={plan.docType} compact />
                </div>
                <p className="text-xs text-ti-400 truncate">{plan.modelCode} · {plan.docNo}</p>
              </ShellLink>
            </li>
          ))}
        </ul>
      )}
      <ShellLink href="/plans?sort=deadline" className="block text-center text-xs text-ti-400 hover:text-ember-400 transition-colors pt-1">
        เรียงตามกำหนด 90 วันทั้งหมด →
      </ShellLink>
    </div>
  );
}
