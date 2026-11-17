import type { Viewport } from "next";
import { AuthStage } from "@/components/canvas/AuthStage";
import { StaticStage } from "@/components/dom/StaticStage";

export const viewport: Viewport = { themeColor: "#1c3027", colorScheme: "dark" };

/**
 * Shared by every auth screen (login, change password, switch user). The stage is mounted
 * here once so it persists across those routes; the working app has no WebGL (docs/07 §10).
 * The static stage is server-rendered; the 3D canvas loads over it on capable devices.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-stage-events className="auth-screen relative isolate min-h-dvh overflow-hidden bg-carbon-900">
      <AuthStage>
        <StaticStage />
      </AuthStage>
      {children}
    </div>
  );
}
