import { Suspense } from "react";
import { JobsView } from "@/components/jobs/JobsView";
import { requirePageAccess } from "@/lib/auth/dal";
import { jobsView } from "@/lib/plans/jobs";

export const metadata = { title: "งานของฉัน" };

type SearchParams = Record<string, string | string[] | undefined>;

export default function JobsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลด…</p>}>
      <Jobs searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * "งานของฉัน" (FR-JOB-03/04, docs/16 §5). The role is checked here, on the server; the list itself is read by the
 * browser from `GET /api/jobs` (components/jobs). The address picks the view and may carry the marker of an alert's link.
 */
async function Jobs({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAccess("jobs", "/jobs");
  const { view, notification } = await searchParams;
  return <JobsView isHead={user.roles.includes("QC_HEAD")} view={jobsView(user.roles, view)} notification={typeof notification === "string" ? notification : null} />;
}
