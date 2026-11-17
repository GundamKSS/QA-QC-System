import { Suspense } from "react";
import { PlanList } from "@/components/plans/PlanList";
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
 * รายการแผนตรวจ (docs/15). The role is checked here, on the server; the list itself is read by the browser from
 * `GET /api/plans` (components/plans). The address picks the filters, so the page parses it and hands over the values.
 */
async function Plans({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAccess("plans", "/plans");
  const { values } = parsePlanListQuery(await searchParams);
  return <PlanList canOpen={canAccessPage(user.roles, "plan-open")} values={values} />;
}
