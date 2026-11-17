import type { Metadata } from "next";
import { WorkspaceDrawing } from "@/components/dom/WorkspaceDrawing";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { ShellLink } from "@/components/shell/ShellLink";
import { canOpenPlan, canSeeMaster, primaryRole } from "@/components/shell/nav";
import { Suspense } from "react";
import { PlusIcon } from "@/components/dom/Icons";
import { authPolicy } from "@/lib/config/auth";
import { roleLabels } from "@/lib/config/experience";
import { requirePageAccess } from "@/lib/auth/dal";
import { homeAccess } from "@/lib/plans/home";
import { parseHomeQuery } from "@/lib/plans/home-query";

export const metadata: Metadata = {
  title: "ภาพรวมระบบการตรวจรับคุณภาพ",
};

type HomeSearch = Promise<{ q?: string | string[] }>;

export default function HomePage({ searchParams }: { searchParams: HomeSearch }) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * The greeting and the quick actions are drawn here, on the server, with the role check; the totals and the plan
 * lists are read by the browser from `GET /api/home` (components/home). The address carries the search words.
 */
async function HomeContent({ searchParams }: { searchParams: HomeSearch }) {
  const user = await requirePageAccess("home", authPolicy.homePath);
  const query = parseHomeQuery(await searchParams);
  const role = primaryRole(user.roles);
  const roleDisplay = role ? roleLabels[role] : "ผู้ใช้งาน";
  // Plan rows link to plan pages, so only plan viewers get them; the dashboard roles see the totals.
  const { seesPlans, seesSummary } = homeAccess(user.roles);

  return (
    <div className="home-enter p-4 sm:p-6 lg:p-8 min-w-0 w-full space-y-6">
      {/* 1. Header & Quick Actions */}
      <div className="home-welcome flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-carbon-700/50">
        <WorkspaceDrawing />
        <div className="home-welcome-copy">
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

        <div className="home-welcome-actions flex flex-wrap items-center gap-2.5">
          {canOpenPlan(user.roles) && (
          <ShellLink
            href="/plans/new"
            className="flex items-center gap-2 px-4 py-2.5 rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 active:bg-ember-600 text-carbon-950 font-medium text-sm transition-all duration-150"
          >
            <PlusIcon className="size-4" />
            <span>เปิดแผนตรวจใหม่</span>
          </ShellLink>
          )}
          {canSeeMaster(user.roles) && (
          <ShellLink
            href="/master"
            className="app-metal-action flex items-center gap-2 px-3.5 py-2.5 rounded-control border border-carbon-600 hover:border-ti-400 bg-carbon-800 hover:bg-carbon-700/80 text-ti-200 hover:text-ti-50 text-sm transition-colors"
          >
            <span>ข้อมูลหลัก</span>
          </ShellLink>
          )}
        </div>
      </div>

      {seesSummary ? (
        <HomeDashboard query={query} seesPlans={seesPlans} />
      ) : (
        <p className="app-panel rounded-panel border border-carbon-700/80 bg-carbon-800 p-5 text-sm text-ti-400">ใบงานที่ได้รับมอบหมายจะแสดงที่นี่เมื่อเปิดใช้งานโมดูลใบงาน</p>
      )}
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 min-w-0 w-full space-y-6">
      <div className="space-y-2">
        <div className="h-4 w-32 rounded bg-carbon-800 animate-pulse" />
        <div className="h-8 w-64 rounded-md bg-carbon-800 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 app-panel rounded-panel border border-carbon-700/80 bg-carbon-800 p-4 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
