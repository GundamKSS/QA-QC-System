import type { Viewport } from "next";
import { Suspense } from "react";
import { authPolicy } from "@/lib/config/auth";
import { requireUser } from "@/lib/auth/dal";
import { getCurrentDevicePolicy } from "@/lib/auth/devices";
import { IdleTimeoutGuard } from "@/components/dom/IdleTimeoutGuard";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { BottomTabBar } from "@/components/shell/BottomTabBar";
import { TopAppBar } from "@/components/shell/TopAppBar";
import { NotificationProvider } from "@/components/notifications/NotificationProvider";
import { AppHoverMotion } from "@/components/shell/AppHoverMotion";

export const viewport: Viewport = {
  themeColor: "#f1ebdf",
  colorScheme: "light",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <AppShellContent>{children}</AppShellContent>
    </Suspense>
  );
}

async function AppShellContent({ children }: { children: React.ReactNode }) {
  const user = await requireUser(authPolicy.homePath);
  const devicePolicy = await getCurrentDevicePolicy();

  return (
    <div className="app-theme-sand app-arrival min-h-dvh flex flex-col bg-carbon-900 text-ti-50 selection:bg-ember-500 selection:text-carbon-950 print:block print:min-h-0 print:bg-white print:text-black">
      <AppHoverMotion />
      <IdleTimeoutGuard policy={devicePolicy} />
      <NotificationProvider key={user.id} userId={user.id}>
        {/* Full-width Top App Bar across the very top (never indented or divided by sidebar) */}
        <TopAppBar roles={user.roles} programRole={user.programRole} />

        {/* Content area: sidebar floats freely over the page without dividing the layout into rigid columns */}
        <div className="relative flex-1 flex flex-col min-w-0 w-full print:block">
          {/* Desktop/Tablet icon rail (hidden on mobile & print) — floats over the content below the header */}
          <div className="print:hidden">
            <AppSidebar user={user} />
          </div>

          <main className="app-page-area min-w-0 w-full flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-8 md:pl-[80px] print:!p-0 print:!m-0">
            {children}
          </main>
        </div>

        {/* Mobile Bottom Tab Bar (hidden on desktop & print) */}
        <div className="print:hidden">
          <BottomTabBar roles={user.roles} programRole={user.programRole} />
        </div>
      </NotificationProvider>
    </div>
  );
}

function AppShellSkeleton() {
  return (
    <div className="app-theme-sand min-h-dvh bg-carbon-900" role="status" aria-label="กำลังโหลดหน้าหลัก" aria-busy="true">
      <span className="sr-only">กำลังโหลดหน้าหลัก</span>
    </div>
  );
}
