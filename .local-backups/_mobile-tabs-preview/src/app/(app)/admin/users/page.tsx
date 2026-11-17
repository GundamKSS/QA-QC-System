import { Suspense } from "react";
import { authPolicy } from "@/config/auth";
import { roleLabels } from "@/config/experience";
import { requirePageAccess } from "@/lib/auth/dal";
import { canManageLocalUsers, canUnlockLocalUser } from "@/lib/auth/local-admin";
import { getLocalStore } from "@/lib/auth/local-runtime";
import { dbConfigured } from "@/lib/db/config";
import { dbProblem, dbProblemMessages, isDbError } from "@/lib/db/errors";
import { CreateUserForm, UserRowActions, type FieldRole } from "./UserAdminForms";

export const metadata = { title: "ผู้ใช้หน้างาน" };

const when = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const fmt = (date: Date | null) => (date ? when.format(date) : "—");

export default function UsersPage() {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลดรายชื่อผู้ใช้…</p>}>
      <Users />
    </Suspense>
  );
}

async function Users() {
  const actor = await requirePageAccess("users", "/admin/users");
  const canManage = canManageLocalUsers(actor.roles);
  let users: Awaited<ReturnType<ReturnType<typeof getLocalStore>["list"]>>;
  try {
    users = await getLocalStore().list();
  } catch (error) {
    if (!isDbError(error)) throw error;
    console.error("[db] list local users failed", error.message);
    return <DbUnavailable message={dbProblemMessages[dbProblem(error)]} />;
  }
  const fieldRoles: FieldRole[] = authPolicy.local.allowedRoles.map((value) => ({ value, label: roleLabels[value] ?? value }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl text-ti-50">ผู้ใช้หน้างาน</h1>
        <p className="text-sm text-ti-400">
          พนักงานที่ไม่มีบัญชีระบบกลาง เข้าด้วยรหัส F… + PIN 6 หลัก · {canManage ? "Admin จัดการได้ทั้งหมด" : "หัวหน้า QC ปลดล็อก PIN ของ QC Inspector ได้"}
        </p>
        {!dbConfigured() && (
          <p role="note" className="rounded-[10px] border border-ember-500/50 bg-carbon-800 px-3 py-2 text-sm text-ember-400">
            ยังไม่ได้ตั้งค่าฐานข้อมูล (DB_SERVER) — ข้อมูลอยู่ในหน่วยความจำและจะหายเมื่อรีสตาร์ทเซิร์ฟเวอร์
          </p>
        )}
      </header>

      {canManage && <CreateUserForm roles={fieldRoles} />}

      <section aria-labelledby="list-title" className="space-y-3">
        <h2 id="list-title" className="text-lg font-medium text-ti-50">รายชื่อ ({users.length})</h2>
        {users.length === 0 ? (
          <p className="app-panel rounded-xl border border-carbon-700 bg-carbon-800 p-5 text-sm text-ti-400">ยังไม่มีผู้ใช้หน้างาน</p>
        ) : (
          <ul className="space-y-3">
            {users.map((user) => (
              <li key={user.id} className="space-y-3 app-panel rounded-xl border border-carbon-700 bg-carbon-800 p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-ti-200">{user.employeeCode}</span>
                  <span className="text-ti-50">{user.fullName}</span>
                  {user.nickname && <span className="text-sm text-ti-400">({user.nickname})</span>}
                  <StatusBadge user={user} />
                </div>
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <Item label="แผนก" value={user.department ?? "—"} />
                  <Item label="อีเมล" value={user.email ?? "—"} />
                  <Item label="บทบาท" value={user.roles.length ? user.roles.map((role) => roleLabels[role] ?? role).join(" · ") : "ยังไม่ได้กำหนด"} />
                  <Item label="วันที่เพิ่ม" value={fmt(user.createdAt)} />
                  <Item label="วันที่แก้ไขล่าสุด" value={fmt(user.updatedAt)} />
                  <Item label="เข้าระบบล่าสุด" value={fmt(user.lastLoginAt)} />
                </dl>
                <UserRowActions
                  user={{ id: user.id, code: user.employeeCode, fullName: user.fullName, nickname: user.nickname, email: user.email, department: user.department, roles: user.roles, isActive: user.isActive }}
                  canManage={canManage}
                  canUnlock={canUnlockLocalUser(actor.roles, user)}
                  locked={user.pinLocked}
                  roles={fieldRoles}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DbUnavailable({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <h1 className="text-2xl text-ti-50">ผู้ใช้หน้างาน</h1>
      <p role="alert" className="rounded-xl border border-red-500/50 bg-carbon-800 p-5 text-sm text-red-300">
        {message} — ยังแสดงหรือแก้ไขผู้ใช้หน้างานไม่ได้ ติดต่อผู้ดูแลระบบ
      </p>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-ti-500">{label}</dt>
      <dd className="min-w-0 break-words text-ti-200">{value}</dd>
    </div>
  );
}

function StatusBadge({ user }: { user: { isActive: boolean; pinLocked: boolean; mustChangePin: boolean; hasPin: boolean } }) {
  const items: { text: string; tone: string }[] = [];
  items.push(user.isActive ? { text: "ใช้งาน", tone: "border-green-500/50 text-green-300" } : { text: "ปิดการใช้งาน", tone: "border-carbon-600 text-ti-400" });
  if (!user.hasPin) items.push({ text: "ยังไม่มี PIN", tone: "border-carbon-600 text-ti-400" });
  if (user.pinLocked) items.push({ text: "PIN ถูกล็อก", tone: "border-red-500/60 text-red-300" });
  if (user.mustChangePin) items.push({ text: "รอเปลี่ยน PIN", tone: "border-ember-500/60 text-ember-400" });
  return <span className="flex flex-wrap gap-2">{items.map((item) => <span key={item.text} className={`rounded-full border px-2 py-0.5 text-xs ${item.tone}`}>{item.text}</span>)}</span>;
}
