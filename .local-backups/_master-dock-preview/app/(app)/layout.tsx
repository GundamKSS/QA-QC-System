import type { Viewport } from "next";
import { Suspense } from "react";
import { authPolicy } from "@/lib/config/auth";
import { requireUser } from "@/lib/auth/dal";
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

  return (
    <div className="app-theme-sand app-arrival min-h-dvh flex bg-carbon-900 text-ti-50 selection:bg-ember-500 selection:text-carbon-950">
      <AppHoverMotion />
      <div style={{position:"fixed",bottom:90,right:12,zIndex:80,padding:"5px 10px",background:"#fff4dd",border:"1px solid #78856e",borderRadius:6,color:"#294635",fontSize:10,pointerEvents:"none"}}>ข้อมูลจำลอง · ตรวจ Filter Dock</div>
      <NotificationProvider key={user.id} userId={user.id}>
        {/* Desktop/Tablet icon rail (hidden on mobile) — floats over the full-width content */}
        <AppSidebar user={user} />

        {/* Main App Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <TopAppBar roles={user.roles} />
          <main className="app-page-area min-w-0 w-full flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-8 md:pl-[80px]">
            {children}
          </main>
        </div>

        {/* Mobile Bottom Tab Bar (hidden on desktop) */}
        <BottomTabBar roles={user.roles} />
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
