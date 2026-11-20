import { Suspense } from "react";
import { AppBack } from "@/components/ui/AppBack";
import { UsersManagementTabs } from "@/components/admin/UsersManagementTabs";
import { authPolicy } from "@/lib/config/auth";
import { roleLabels } from "@/lib/config/experience";
import { requirePageAccess } from "@/lib/auth/dal";
import { canManageLocalUsers } from "@/lib/auth/local-admin";
import { dbConfigured } from "@/lib/db/config";

export const metadata = { title: "ผู้ใช้และสิทธิ์" };

export default function UsersPage() {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลดรายชื่อผู้ใช้…</p>}>
      <Users />
    </Suspense>
  );
}

/** Checks the session and draws a calm, centered header; Central permissions + Field PIN users live in `UsersManagementTabs`. */
async function Users() {
  const actor = await requirePageAccess("users", "/admin/users");
  const canManage = canManageLocalUsers(actor.roles, actor.programRole);
  const canGrantDev = actor.programRole === "DEV";
  const fieldRoles = authPolicy.local.allowedRoles.map((value) => ({ value, label: roleLabels[value] ?? value }));

  return (
    <div className="min-w-0 w-full max-w-5xl mx-auto space-y-5 px-4 py-5 sm:px-6 sm:py-7">
      <div className="space-y-2">
        <AppBack href="/home">กลับหน้าหลัก</AppBack>
        <h1 className="text-2xl font-medium text-ti-50 tracking-tight">
          {canManage ? "ผู้ใช้และสิทธิ์" : "ผู้ใช้หน้างาน"}
        </h1>
        {!dbConfigured() && (
          <p role="note" className="rounded-xl border border-ember-500/40 bg-carbon-800 px-3.5 py-2 text-xs text-ember-400">
            โหมดทดสอบ (ไม่ได้เชื่อมต่อฐานข้อมูล)
          </p>
        )}
      </div>

      <UsersManagementTabs canManage={canManage} canGrantDev={canGrantDev} fieldRoles={fieldRoles} />
    </div>
  );
}
