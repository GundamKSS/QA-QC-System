import type { Metadata } from "next";
import { OfflineRecovery } from "@/components/dom/OfflineRecovery";
import { QMark } from "@/components/dom/Wordmark";

export const metadata: Metadata = {
  title: "ออฟไลน์",
};

/**
 * Static PWA offline fallback served by public/sw.js when a navigation fails while disconnected.
 * Reads no session so it prerenders cleanly and never exposes another user's data.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-carbon-900 px-5 py-10 text-ti-50">
      <section className="w-full max-w-md space-y-6 rounded-surface border border-carbon-700 bg-carbon-800 p-6 text-center shadow-xl sm:p-8">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-carbon-700 bg-carbon-900">
          <QMark className="h-7 w-auto" />
        </div>

        <div className="space-y-2">
          <p lang="en" className="font-mono text-[11px] tracking-[0.14em] text-ember-400 uppercase">
            Offline Mode · PWA Shell
          </p>
          <h1 className="text-2xl font-medium text-ti-50">ไม่มีการเชื่อมต่ออินเทอร์เน็ต</h1>
          <p className="text-sm leading-relaxed text-ti-400">
            ไม่สามารถติดต่อเซิร์ฟเวอร์ QA &amp; QC System ได้ในขณะนี้ กรุณาตรวจสอบสัญญาณ Wi-Fi หรือเครือข่ายโรงงานแล้วลองใหม่อีกครั้ง
          </p>
        </div>

        <OfflineRecovery />
      </section>
    </main>
  );
}
