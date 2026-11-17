import { Suspense } from "react";
import { AlertsList } from "@/components/notifications/AlertsList";
import { requirePageAccess } from "@/lib/auth/dal";

export const metadata = { title: "แจ้งเตือน" };

export default function AlertsPage() {
  return <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลดแจ้งเตือน…</p>}><AlertsContent /></Suspense>;
}

async function AlertsContent() {
  await requirePageAccess("alerts", "/alerts");
  return <AlertsList />;
}

