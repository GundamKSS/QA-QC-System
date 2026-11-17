"use client";

import { CardsSkeleton } from "@/components/feedback/CardsSkeleton";
import { LoadError } from "@/components/feedback/LoadError";
import type { AdminUserItem } from "@/lib/auth/admin-users";
import { CreateUserForm, UserRowActions, type FieldRole } from "./UserAdminForms";
import { useAdminUsers } from "./useAdminUsers";

const when = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const fmt = (iso: string | null) => (iso ? when.format(new Date(iso)) : "—");

type Props = {
  /** Admin only: shows the create form and the row actions. Same rule the API applies; the page decides it from the session. */
  canManage: boolean;
  fieldRoles: FieldRole[];
};

/**
 * Field users (docs/12): the create form and the list. The list is read from `GET /api/admin/users` and loads
 * again by itself whenever one of the forms saves (`useApiAction` → `invalidateApiReads`). The rows are keyed by
 * user id and stay mounted across that reload, so a temporary PIN shown under a row survives it.
 */
export function UsersView({ canManage, fieldRoles }: Props) {
  const { data, loading, error, reload } = useAdminUsers();
  const labels = new Map(fieldRoles.map((role) => [role.value, role.label]));
  const users = data?.users ?? null;

  return (
    <>
      {canManage && <CreateUserForm roles={fieldRoles} />}

      <section aria-labelledby="list-title" className="space-y-3">
        <h2 id="list-title" className="text-lg font-medium text-ti-50">รายชื่อ{users && ` (${users.length})`}</h2>
        {error && <LoadError message={error} onRetry={reload} />}
        {users === null ? (
          !error && <CardsSkeleton label="กำลังโหลดรายชื่อผู้ใช้" />
        ) : users.length === 0 ? (
          <p className="app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-5 text-sm text-ti-400">ยังไม่มีผู้ใช้หน้างาน</p>
        ) : (
          <ul aria-busy={loading} className={`space-y-3 transition-opacity ${loading ? "opacity-60" : ""}`}>
            {users.map((user) => (
              <UserCard key={user.id} user={user} canManage={canManage} fieldRoles={fieldRoles} labels={labels} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function UserCard({ user, canManage, fieldRoles, labels }: { user: AdminUserItem; canManage: boolean; fieldRoles: FieldRole[]; labels: Map<string, string> }) {
  return (
    <li className="space-y-3 app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-ti-200">{user.employeeCode}</span>
        <span className="text-ti-50">{user.fullName}</span>
        {user.nickname && <span className="text-sm text-ti-400">({user.nickname})</span>}
        <StatusBadge user={user} />
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Item label="แผนก" value={user.department ?? "—"} />
        <Item label="อีเมล" value={user.email ?? "—"} />
        <Item label="บทบาท" value={user.roles.length ? user.roles.map((role) => labels.get(role) ?? role).join(" · ") : "ยังไม่ได้กำหนด"} />
        <Item label="วันที่เพิ่ม" value={fmt(user.createdAt)} />
        <Item label="วันที่แก้ไขล่าสุด" value={fmt(user.updatedAt)} />
        <Item label="เข้าระบบล่าสุด" value={fmt(user.lastLoginAt)} />
      </dl>
      <UserRowActions
        user={{ id: user.id, code: user.employeeCode, fullName: user.fullName, nickname: user.nickname, email: user.email, department: user.department, roles: user.roles, isActive: user.isActive }}
        canManage={canManage}
        canUnlock={user.canUnlock}
        locked={user.pinLocked}
        roles={fieldRoles}
      />
    </li>
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

function StatusBadge({ user }: { user: Pick<AdminUserItem, "isActive" | "pinLocked" | "mustChangePin" | "hasPin"> }) {
  const items: { text: string; tone: string }[] = [];
  items.push(user.isActive ? { text: "ใช้งาน", tone: "border-pass/60 bg-pass/15 font-semibold text-pass" } : { text: "ปิดการใช้งาน", tone: "border-fail/60 bg-fail/15 font-semibold text-fail" });
  if (!user.hasPin) items.push({ text: "ยังไม่มี PIN", tone: "border-carbon-600 text-ti-400" });
  if (user.pinLocked) items.push({ text: "PIN ถูกล็อก", tone: "border-red-500/60 text-red-300" });
  if (user.mustChangePin) items.push({ text: "รอเปลี่ยน PIN", tone: "border-ember-500/60 text-ember-400" });
  return <span className="flex flex-wrap gap-2">{items.map((item) => <span key={item.text} className={`rounded-full border px-2 py-0.5 text-xs ${item.tone}`}>{item.text}</span>)}</span>;
}
