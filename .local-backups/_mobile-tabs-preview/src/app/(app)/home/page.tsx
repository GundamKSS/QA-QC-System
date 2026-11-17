import type { Metadata } from "next";
import { ShellLink } from "@/components/shell/ShellLink";
import { canOpenPlan, canSeeMaster, primaryRole } from "@/components/shell/nav";
import { Suspense, type ReactNode } from "react";
import {
  ChevronRightIcon,
  JobsIcon,
  PlansIcon,
  PlusIcon,
  SearchIcon,
  WarningIcon,
} from "@/components/dom/Icons";
import { authPolicy } from "@/config/auth";
import { roleLabels } from "@/config/experience";
import { requirePageAccess } from "@/lib/auth/dal";
import { canAccessPage } from "@/lib/auth/page-access";
import { dbProblem, dbProblemMessages, isDbError } from "@/lib/db/errors";
import { PLAN_STATUSES, thaiToday } from "@/lib/plans/rules";
import { getPlanStore } from "@/lib/plans/runtime";
import { DEADLINE_SOON_DAYS, type PlanListRow, type PlanSummary } from "@/lib/plans/store";
import { ChecklistBadge, Deadline, ProgressBadge, planProgress, QcBar } from "../plans/PlanBits";

export const metadata: Metadata = {
  title: "ภาพรวมระบบการตรวจรับคุณภาพ",
};

type HomeSearch = Promise<{ q?: string | string[] }>;

const RECENT_LIMIT = 8;
const DEADLINE_LIMIT = 5;

export default function HomePage({ searchParams }: { searchParams: HomeSearch }) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

const cardClass = "app-panel rounded-xl border border-carbon-700/80 bg-carbon-800";

async function HomeContent({ searchParams }: { searchParams: HomeSearch }) {
  const user = await requirePageAccess("home", authPolicy.homePath);
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const role = primaryRole(user.roles);
  const roleDisplay = role ? roleLabels[role] : "ผู้ใช้งาน";
  // Plan rows link to plan pages, so only plan viewers get them; the dashboard roles see the totals.
  const seesPlans = canAccessPage(user.roles, "plans");
  const seesSummary = seesPlans || canAccessPage(user.roles, "dashboard");

  return (
    <div className="home-enter p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-carbon-700/50">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              lang="en"
              className="font-mono text-xs font-medium tracking-[0.14em] text-ember-400 uppercase"
            >
              Inspection Management Dashboard
            </span>
            <span className="text-ti-600 text-xs">·</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-carbon-800 border border-carbon-700 text-ti-200 font-mono">
              {roleDisplay}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-normal text-ti-50 tracking-tight">
            สวัสดี, <span className="font-medium text-ti-50">{user.fullName}</span>
          </h1>
          <p className="text-xs sm:text-sm text-ti-400 mt-1">
            รหัสพนักงาน: <span className="font-mono text-ti-200">{user.employeeCode}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {canOpenPlan(user.roles) && (
          <ShellLink
            href="/plans/new"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg app-primary-action bg-ember-500 hover:bg-ember-400 active:bg-ember-600 text-carbon-950 font-medium text-sm transition-all duration-150"
          >
            <PlusIcon className="size-4" />
            <span>เปิดแผนตรวจใหม่</span>
          </ShellLink>
          )}
          {canSeeMaster(user.roles) && (
          <ShellLink
            href="/master"
            className="app-metal-action flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-carbon-600 hover:border-ti-400 bg-carbon-800 hover:bg-carbon-700/80 text-ti-200 hover:text-ti-50 text-sm transition-colors"
          >
            <span>ข้อมูลหลัก</span>
          </ShellLink>
          )}
        </div>
      </div>

      {seesSummary ? (
        <PlanDashboard query={query} seesPlans={seesPlans} />
      ) : (
        <p className={`${cardClass} p-5 text-sm text-ti-400`}>ใบงานที่ได้รับมอบหมายจะแสดงที่นี่เมื่อเปิดใช้งานโมดูลใบงาน</p>
      )}
    </div>
  );
}

async function PlanDashboard({ query, seesPlans }: { query: string; seesPlans: boolean }) {
  const today = thaiToday(new Date());
  let summary: PlanSummary;
  let recent: { rows: PlanListRow[]; total: number } = { rows: [], total: 0 };
  let deadlines: PlanListRow[] = [];
  try {
    const store = getPlanStore();
    summary = await store.planSummary(today);
    if (seesPlans) {
      recent = await store.listPlans({ q: query || undefined, sort: "opened", page: 1, pageSize: RECENT_LIMIT });
      // Nearest 90-day deadlines first; PO plans (no deadline) sort last and are dropped.
      const byDeadline = await store.listPlans({ statuses: LIVE_STATUSES, sort: "deadline", page: 1, pageSize: DEADLINE_LIMIT });
      deadlines = byDeadline.rows.filter((row) => row.qcDeadline);
    }
  } catch (error) {
    if (!isDbError(error)) throw error;
    console.error("[db] home dashboard failed", error.message);
    return <p role="alert" className="rounded-[10px] border border-red-500/50 bg-carbon-800 px-3 py-2 text-sm text-red-300">{dbProblemMessages[dbProblem(error)]}</p>;
  }

  const progress = summary.qcRequired ? Math.min(100, Math.round((summary.qcDone / summary.qcRequired) * 100)) : 0;

  return (
    <>
      {/* 2. KPI Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
      </div>

      {seesPlans && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 3. Recent plans */}
          <div className="min-w-0 lg:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-medium text-ti-50">แผนการตรวจคุณภาพล่าสุด</h2>
                <p className="text-xs text-ti-400">แผนที่เปิดล่าสุด {RECENT_LIMIT} รายการ (ไม่รวมแผนที่ยกเลิก)</p>
              </div>

              <form action="/home" method="get" role="search" className="flex items-center gap-2">
                <div className="relative">
                  <button type="submit" aria-label="ค้นหาแผน" className="absolute left-0 top-0 grid size-9 place-items-center text-ti-400 hover:text-ember-400"><SearchIcon className="size-4" /></button>
                  <input
                    type="text"
                    name="q"
                    aria-label="ค้นหาเลขแผน Invoice/PO รุ่น หรือผู้ขาย"
                    defaultValue={query}
                    maxLength={200}
                    placeholder="ค้นหาแผน, Invoice, รุ่น..."
                    className="h-9 pl-9 pr-3 rounded-lg bg-carbon-800 border border-carbon-600 text-xs text-ti-50 placeholder:text-ti-500 focus:outline-hidden focus:border-ember-500 focus:ring-1 focus:ring-ember-500 w-48 sm:w-56"
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
                    {recent.rows.length === 0 && (
                      <tr><td colSpan={6} className="p-6 text-center text-ti-400">{query ? "ไม่พบแผนที่ตรงกับคำค้น" : "ยังไม่มีแผนตรวจ"}</td></tr>
                    )}
                    {recent.rows.map((plan) => (
                      <tr key={plan.id} className="hover:bg-carbon-700/30 transition-colors">
                        <td className="whitespace-nowrap py-3.5 px-4 font-mono">
                          <div className="font-semibold text-ti-50">{plan.planNo}</div>
                          <div className="text-xs text-ti-500 mt-0.5">{plan.docType === "INVOICE" ? "Invoice" : "PO"} {plan.docNo}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-ti-50">{plan.modelCode}</div>
                          <div className="text-xs text-ti-400 truncate max-w-[220px] mt-0.5">{plan.vendorName}</div>
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
                  {recent.total > recent.rows.length ? `ดูทั้งหมด ${recent.total} แผน →` : "ไปที่รายการแผนตรวจ →"}
                </ShellLink>
              </div>
            </div>
          </div>

          {/* 4. Nearest 90-day deadlines */}
          <div className={`${cardClass} p-4 space-y-3.5 self-start`}>
            <div className="flex items-center gap-2">
              <WarningIcon className="size-4 text-ember-400" />
              <h3 className="text-sm font-medium text-ti-50">กำหนดตรวจ 90 วันที่ใกล้ที่สุด</h3>
            </div>
            {deadlines.length === 0 ? (
              <p className="text-xs text-ti-400">ไม่มีแผน Invoice ที่ยังเปิดอยู่</p>
            ) : (
              <ul className="space-y-2.5">
                {deadlines.map((plan) => (
                  <li key={plan.id}>
                    <ShellLink href={`/plans/${plan.id}`} className="block p-3 rounded-lg border border-carbon-700 bg-carbon-900 hover:border-carbon-600 space-y-1">
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
        </div>
      )}
    </>
  );
}

const LIVE_STATUSES = PLAN_STATUSES.filter((status) => status !== "CANCELLED" && status !== "COMPLETED");

function Kpi({ label, icon, iconTone, children }: { label: string; icon: ReactNode; iconTone: string; children: ReactNode }) {
  return (
    <div className={`${cardClass} p-4.5 space-y-3`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-ti-400 font-medium">{label}</span>
        <div className={`size-8 rounded-lg bg-carbon-700 border border-carbon-600 grid place-items-center ${iconTone}`}>{icon}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="space-y-2">
        <div className="h-4 w-32 rounded bg-carbon-800 animate-pulse" />
        <div className="h-8 w-64 rounded-md bg-carbon-800 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 app-panel rounded-xl border border-carbon-700/80 bg-carbon-800 p-4 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
