import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { devRoleAllowed } from "@/lib/auth/roles";
import { SettingsView } from "@/components/settings/SettingsView";

export const metadata = { title: "การตั้งค่า และอุปกรณ์" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const isAdmin = user.roles.includes("ADMIN");
  const isDevMode = devRoleAllowed();

  if (!isAdmin && !isDevMode) {
    notFound();
  }

  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลดการตั้งค่า…</p>}>
      <SettingsView isDevMode={isDevMode} />
    </Suspense>
  );
}
