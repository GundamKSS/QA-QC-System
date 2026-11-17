import { Suspense } from "react";
import { SignOutButton } from "@/components/dom/SignOutButton";
import { roleLabels, loginCopy } from "@/lib/config/experience";
import Link from "next/link";
import { requirePageAccess } from "@/lib/auth/dal";
import { canAccessPage, type AppPage } from "@/lib/auth/page-access";

export const metadata = { title: "เพิ่มเติม" };

const MORE_MENU = [
  { label: "แผนตรวจ", href: "/plans", page: "plans" },
  { label: "เปิดแผนตรวจ", href: "/plans/new", page: "plan-open" },
  { label: "งานของฉัน", href: "/jobs", page: "jobs" },
  { label: "ข้อมูลหลัก", href: "/master", page: "master" },
  { label: "ผู้ใช้หน้างาน", href: "/admin/users", page: "users" },
] as const satisfies readonly { label: string; href: string; page: AppPage }[];

export default function MorePage() {
  return <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลดบัญชี…</p>}><Account /></Suspense>;
}

async function Account() {
  const user = await requirePageAccess("account", "/more");
  const menu = MORE_MENU.filter((item) => canAccessPage(user.roles, item.page));
  return <div className="min-w-0 w-full space-y-6 p-4 sm:p-6">
    <h1 className="text-2xl text-ti-50">บัญชีของฉัน</h1>
    <section className="space-y-3 app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-5">
      <h2 className="text-lg font-medium">{user.fullName}</h2>
      <p className="font-mono text-ti-200">{user.employeeCode}</p>
      <p className="text-sm text-ti-400">บทบาท: {user.roles.map(role => roleLabels[role] ?? role).join(" · ")}</p>
      <SignOutButton />
    </section>
    {/* Places that may have no tab on mobile (docs/09 §2, docs/16 §0): shown only to roles that may open them. */}
    {menu.length > 0 && (
      <nav aria-label="เมนูอื่น" className="space-y-2">
        <h2 className="text-sm font-medium text-ti-400">เมนูอื่น</h2>
        <ul className="divide-y divide-carbon-700 app-panel rounded-panel border border-carbon-700 bg-carbon-800">
          {menu.map((item) => <li key={item.href}><Link href={item.href} className="flex h-12 items-center px-5 text-ti-200 hover:text-ti-50">{item.label}</Link></li>)}
        </ul>
      </nav>
    )}
    <p lang="en" className="font-mono text-xs text-ti-500">{loginCopy.footer}</p>
  </div>;
}
