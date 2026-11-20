import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/dom/SignOutButton";
import { QMark } from "@/components/dom/Wordmark";
import { requireSignedIn } from "@/lib/auth/dal";
import { hasAppAccess } from "@/lib/auth/roles";
import { authPolicy } from "@/lib/config/auth";
import { programRoleLabels } from "@/lib/config/experience";

export const metadata = { title: "รอการกำหนดสิทธิ์ใช้งาน" };

export default function NoAccessPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-carbon-900" />}>
      <NoAccessContent />
    </Suspense>
  );
}

async function NoAccessContent() {
  const user = await requireSignedIn(authPolicy.noAccessPath);
  if (user.mustChangePassword) redirect(authPolicy.changePasswordPath);
  if (hasAppAccess(user)) redirect(authPolicy.homePath);

  return (
    <main className="app-theme-sand min-h-dvh flex items-center justify-center bg-carbon-900 px-4 py-10 text-ti-50">
      <div className="w-full max-w-md space-y-6 app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-6 sm:p-8 shadow-lg">
        <div className="flex items-center gap-3">
          <QMark className="h-7 w-auto" />
          <span lang="en" className="font-mono text-xs tracking-[0.14em] text-ember-400 uppercase">
            QA &amp; QC System
          </span>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-medium text-ti-50">ยังไม่ได้รับสิทธิ์ย่อยในโปรแกรม</h1>
          <p className="text-sm leading-relaxed text-ti-300">
            ระบบยืนยันตัวตนและบันทึกข้อมูลบัญชีของคุณเรียบร้อยแล้ว แต่ยังไม่ได้รับการกำหนดบทบาทการทำงานใน QCheck
            กรุณาติดต่อ <strong className="text-ti-100">Admin</strong> หรือ <strong className="text-ti-100">Dev</strong> เพื่อกำหนดสิทธิ์ย่อยให้บัญชีของคุณ
          </p>
        </div>

        <dl className="space-y-2 rounded-control border border-carbon-700/80 bg-carbon-900/60 p-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ti-500">ชื่อผู้ใช้</dt>
            <dd className="text-right font-medium text-ti-100">{user.fullName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ti-500">รหัสพนักงาน</dt>
            <dd className="text-right font-mono text-ti-200">{user.employeeCode}</dd>
          </div>
          {user.programRole && (
            <div className="flex justify-between gap-3">
              <dt className="text-ti-500">สิทธิ์จากระบบกลาง</dt>
              <dd className="text-right font-mono text-xs text-ember-300">
                {programRoleLabels[user.programRole] ?? user.programRole}
              </dd>
            </div>
          )}
        </dl>

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <a
            href={authPolicy.homePath}
            className="flex-1 h-11 inline-flex items-center justify-center rounded-control bg-ember-500 hover:bg-ember-400 text-carbon-950 font-medium text-sm transition-colors"
          >
            ตรวจสอบสิทธิ์อีกครั้ง
          </a>
          <SignOutButton className="flex-1 !h-11 text-sm" />
        </div>
      </div>
    </main>
  );
}
