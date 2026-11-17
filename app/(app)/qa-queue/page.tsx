import { Suspense } from "react";
import { requirePageAccess } from "@/lib/auth/dal";
import { QaQueueView } from "@/components/qa-queue/QaQueueView";

export const metadata = {
  title: "คิวงานสุ่มตรวจ QA | QCheck",
  description: "รายการล็อตที่รอ QA สุ่มตรวจรับรองคุณภาพตามเกณฑ์ AQL",
};

export default function QaQueuePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl p-6 text-sm text-ti-400">
          กำลังโหลดคิวงาน QA…
        </div>
      }
    >
      <QaQueueContent />
    </Suspense>
  );
}

async function QaQueueContent() {
  await requirePageAccess("qa-queue");
  return <QaQueueView />;
}
