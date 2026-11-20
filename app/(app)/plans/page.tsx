import Link from "next/link";
import { Suspense } from "react";
import { PlanList } from "@/components/plans/PlanList";
import { QaPlanListView } from "@/components/plans/QaPlanListView";
import { requirePageAccess } from "@/lib/auth/dal";
import { canAccessPage } from "@/lib/auth/page-access";
import { parsePlanListQuery } from "@/lib/plans/list-query";

export const metadata = { title: "แผนตรวจ" };

type SearchParams = Record<string, string | string[] | undefined>;

export default function PlansPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลด…</p>}>
      <Plans searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * รายการแผนตรวจ:
 * - สำหรับ Head QA: แสดงเฉพาะแผนสุ่มตรวจ QA (เฉพาะรายการที่ทาง Head QC กดส่งมาให้แล้วเท่านั้น)
 *   แผนใดที่ QC ยังตรวจไม่เสร็จหรือไม่เคยกดส่งต่อ จะไม่ปรากฏให้ฝั่ง QA เห็นเลย
 * - สำหรับ Head QC / Admin: สามารถดูแท็บ แผนตรวจ QC (เปิดแผน, ตรวจสอบงานเรียกเข้า, จ่ายงาน QC)
 *   และสามารถสลับดูแท็บ แผนสุ่มตรวจ QA เพื่อติดตามงานที่ส่งต่อไปให้ QA แล้วได้
 */
async function Plans({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAccess("plans", "/plans");
  const params = await searchParams;
  const tabParam = typeof params.tab === "string" ? params.tab.toLowerCase() : null;

  // สำหรับผู้ใช้ที่เป็น Head QA (Admin QA): แสดงเฉพาะแผนงานสุ่มตรวจ QA เท่านั้น
  const isQaOnlyHead =
    user.roles.includes("QA_HEAD") &&
    !user.roles.includes("QC_HEAD") &&
    !user.roles.includes("ADMIN");

  if (isQaOnlyHead) {
    return <QaPlanListView />;
  }

  const { values } = parsePlanListQuery(params);

  // สำหรับผู้ใช้ที่เป็น Head QC (Admin QC): แสดงเฉพาะแผนตรวจ QC ของฝั่งตัวเองเท่านั้น
  const isQcOnlyHead =
    user.roles.includes("QC_HEAD") &&
    !user.roles.includes("QA_HEAD") &&
    !user.roles.includes("ADMIN");

  if (isQcOnlyHead) {
    return <PlanList canOpen={canAccessPage(user.roles, "plan-open")} values={values} />;
  }

  const activeTab = tabParam === "qa" ? "qa" : "qc";

  return (
    <div className="min-w-0 w-full space-y-2">
      {/* สำหรับ Head QC / Admin: สามารถดูแท็บ แผนตรวจ QC และสลับไปดู แผนสุ่มตรวจ QA ได้ */}
      <div className="border-b border-carbon-700 bg-carbon-900/60 px-4 sm:px-6 pt-2">
        <nav aria-label="หมวดแผนงาน" className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/plans?tab=qc"
            prefetch={false}
            className={`inline-flex items-center gap-2 border-b-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-colors ${
              activeTab === "qc"
                ? "border-ember-500 text-ti-50 font-semibold"
                : "border-transparent text-ti-400 hover:border-carbon-600 hover:text-ti-200"
            }`}
          >
            แผนตรวจ QC
          </Link>
          <Link
            href="/plans?tab=qa"
            prefetch={false}
            className={`inline-flex items-center gap-2 border-b-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-colors ${
              activeTab === "qa"
                ? "border-ember-500 text-ti-50 font-semibold"
                : "border-transparent text-ti-400 hover:border-carbon-600 hover:text-ti-200"
            }`}
          >
            แผนสุ่มตรวจ QA
          </Link>
        </nav>
      </div>

      {activeTab === "qa" ? (
        <QaPlanListView />
      ) : (
        <PlanList canOpen={canAccessPage(user.roles, "plan-open")} values={values} />
      )}
    </div>
  );
}
