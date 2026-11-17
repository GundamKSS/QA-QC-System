import { Suspense } from "react";
import { OpenPlanView } from "@/components/plans/OpenPlanView";
import { requirePageAccess } from "@/lib/auth/dal";
import { parseOpenedId, parseOpenPlanPrefill, type OpenPlanQuery } from "@/lib/plans/open-query";

export const metadata = { title: "เปิดแผนตรวจ" };

export default function NewPlanPage({ searchParams }: { searchParams: Promise<OpenPlanQuery> }) {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลด…</p>}>
      <NewPlan searchParams={searchParams} />
    </Suspense>
  );
}

/** Checks the role and parses the address; the options and the just-opened plan are read from `GET /api/plans/options` (components/plans). */
async function NewPlan({ searchParams }: { searchParams: Promise<OpenPlanQuery> }) {
  await requirePageAccess("plan-open", "/plans/new");
  const query = await searchParams;
  return <OpenPlanView openedId={parseOpenedId(query)} {...parseOpenPlanPrefill(query)} />;
}
