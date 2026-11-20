import { Suspense } from "react";
import { JobsView } from "@/components/jobs/JobsView";
import { requirePageAccess } from "@/lib/auth/dal";
import { jobsView } from "@/lib/plans/jobs";

export const metadata = {
  title: "คิวงานสุ่มตรวจ QA | QCheck",
  description: "งานสุ่มตรวจ QA ที่ได้รับมอบหมายและงานที่ต้องตรวจต่อตามเกณฑ์ AQL",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default function QaQueuePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl p-6 text-sm text-ti-400">
          กำลังโหลดคิวงาน QA…
        </div>
      }
    >
      <QaQueueContent searchParams={searchParams} />
    </Suspense>
  );
}

async function QaQueueContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAccess("qa-queue", "/qa-queue");
  const { view, notification } = await searchParams;
  const isHead = user.roles.includes("QA_HEAD") || user.roles.includes("ADMIN");

  return (
    <JobsView
      side="QA"
      isHead={isHead}
      view={jobsView(user.roles, view, "QA")}
      notification={typeof notification === "string" ? notification : null}
      baseUrl="/qa-queue"
    />
  );
}
