import { Suspense } from "react";
import { AppBack } from "@/components/ui/AppBack";
import { UsersView } from "@/components/admin/UsersView";
import { authPolicy } from "@/lib/config/auth";
import { roleLabels } from "@/lib/config/experience";
import { requirePageAccess } from "@/lib/auth/dal";
import { canManageLocalUsers } from "@/lib/auth/local-admin";
import { dbConfigured } from "@/lib/db/config";

export const metadata = { title: "ผู้ใช้หน้างาน" };

export default function UsersPage() {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลดรายชื่อผู้ใช้…</p>}>
      <Users />
    </Suspense>
  );
}

/** Checks the session and draws the header; the create form and the list are `UsersView`, which reads `GET /api/admin/users`. */
async function Users() {
  const actor = await requirePageAccess("users", "/admin/users");
  const canManage = canManageLocalUsers(actor.roles);
  const fieldRoles = authPolicy.local.allowedRoles.map((value) => ({ value, label: roleLabels[value] ?? value }));

  return (
    <div className="min-w-0 w-full space-y-6 p-4 sm:p-6">
      <AppBack href="/home">กลับหน้าหลัก</AppBack>
      <header className="space-y-1">
        <h1 className="text-2xl text-ti-50">ผู้ใช้หน้างาน</h1>
        <p className="text-sm text-ti-400">
          พนักงานที่ไม่มีบัญชีระบบกลาง เข้าด้วยรหัส F… + PIN 6 หลัก · {canManage ? "Admin จัดการได้ทั้งหมด" : "หัวหน้า QC ปลดล็อก PIN ของ QC Inspector ได้"}
        </p>
        {!dbConfigured() && (
          <p role="note" className="rounded-control border border-ember-500/50 bg-carbon-800 px-3 py-2 text-sm text-ember-400">
            ยังไม่ได้ตั้งค่าฐานข้อมูล (DB_SERVER) — ข้อมูลอยู่ในหน่วยความจำและจะหายเมื่อรีสตาร์ทเซิร์ฟเวอร์
          </p>
        )}
      </header>

      <UsersView canManage={canManage} fieldRoles={fieldRoles} />
    </div>
  );
}
