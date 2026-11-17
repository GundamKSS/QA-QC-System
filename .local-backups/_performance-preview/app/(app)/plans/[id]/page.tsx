import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PlanDetailView } from "@/components/plans/PlanDetailView";
import { requirePageAccess } from "@/lib/auth/dal";
import { canAccessPage } from "@/lib/auth/page-access";
import { parsePlanDetailQuery, type PlanDetailQuery } from "@/lib/plans/detail-query";

export const metadata = { title: "รายละเอียดแผน" };

export default function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<PlanDetailQuery> }) {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลด…</p>}>
      <Plan params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Checks the role and the plan id and reads the address (`?tab=`, `?opened=`); the plan, its history and its work
 * orders are read from `GET /api/plans/[id]` and `GET /api/plans/[id]/work-order-list` (components/plans).
 */
async function Plan({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<PlanDetailQuery> }) {
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) notFound();
  const user = await requirePageAccess("plans", `/plans/${id}`);
  return (
    <PlanDetailView
      planId={Number(id)}
      {...parsePlanDetailQuery(await searchParams)}
      canEdit={canAccessPage(user.roles, "plan-open")}
      canManageWork={canAccessPage(user.roles, "work-order")}
      isHead={user.roles.includes("QC_HEAD") || user.roles.includes("QA_HEAD")}
    />
  );
}
