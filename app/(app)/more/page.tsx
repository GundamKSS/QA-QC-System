import { Suspense } from "react";
import { AppBack } from "@/components/ui/AppBack";
import { SignOutButton } from "@/components/dom/SignOutButton";
import { roleLabels, loginCopy } from "@/lib/config/experience";
import Link from "next/link";
import { requirePageAccess } from "@/lib/auth/dal";
import { canAccessPage, type AppPage } from "@/lib/auth/page-access";
import { devRoleAllowed } from "@/lib/auth/roles";

export const metadata = { title: "เพิ่มเติม" };

const MORE_MENU = [
  { label: "แผนตรวจ", href: "/plans", page: "plans" },
  { label: "เปิดแผนตรวจ", href: "/plans/new", page: "plan-open" },
  { label: "งานของฉัน", href: "/jobs", page: "jobs" },
  { label: "ข้อมูลหลัก", href: "/master", page: "master" },
  { label: "ผู้ใช้หน้างาน", href: "/admin/users", page: "users" },
  { label: "การตั้งค่า และอุปกรณ์", href: "/settings", page: "settings" },
] as const satisfies readonly { label: string; href: string; page: AppPage }[];

export default function MorePage() {
  return <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลดบัญชี…</p>}><Account /></Suspense>;
}

async function Account() {
  const user = await requirePageAccess("account", "/more");
  const isDev = devRoleAllowed();
  const menu = MORE_MENU.filter((item) => canAccessPage(user.roles, item.page) || (item.page === "settings" && isDev));
  return <div className="min-w-0 w-full space-y-6 p-4 sm:p-6">
    <AppBack href="/home">กลับหน้าหลัก</AppBack>
    <h1 className="text-2xl text-ti-50">บัญชีของฉัน</h1>
    <section className="space-y-3 app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">{user.fullName}</h2>
          <p className="font-mono text-ti-200">{user.employeeCode}</p>
        </div>
        {isDev && user.employeeCode.toLowerCase() !== "dev" && (
          <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
            Dev สวมบทบาท
          </span>
        )}
      </div>
      <p className="text-sm text-ti-400">บทบาท: {user.roles.map(role => roleLabels[role] ?? role).join(" · ")}</p>
      {isDev && user.employeeCode.toLowerCase() !== "dev" && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-950/40 p-3 text-xs text-amber-300">
          ⚠️ คุณกำลังอยู่ในโหมด Dev สวมบทบาท: {user.fullName} ({user.employeeCode})
          <Link href="/settings" className="ml-2 block sm:inline mt-1 sm:mt-0 underline font-semibold text-amber-200">
            ไปที่การตั้งค่า และอุปกรณ์ เพื่อสลับบทบาท →
          </Link>
        </div>
      )}
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
