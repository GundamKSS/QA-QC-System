"use client";

import { useEffect, useState } from "react";

const SW_ENABLED =
  process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "on";

/**
 * Registers public/sw.js for PWA offline shell support in production (or when explicitly enabled).
 * Kept inactive during normal `next dev` so Turbopack HMR is never cached or intercepted.
 */
export function ServiceWorkerRegister() {
  const [updateWaiting, setUpdateWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!SW_ENABLED) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let active = true;
    let refreshing = false;

    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (!active) return;

        if (registration.waiting && navigator.serviceWorker.controller) {
          setUpdateWaiting(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (!active) return;
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateWaiting(installing);
            }
          });
        });
      })
      .catch(() => {
        // Non-HTTPS or restricted browser context — degrade gracefully without blocking the app.
      });

    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!updateWaiting) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-panel border border-ember-500/60 bg-carbon-800 px-4 py-3 text-sm text-ti-50 shadow-xl md:inset-x-auto md:bottom-6 md:right-6"
    >
      <span className="min-w-0">มีอัปเดตเวอร์ชันใหม่ของแอป</span>
      <button
        type="button"
        onClick={() => updateWaiting.postMessage({ type: "SKIP_WAITING" })}
        className="shrink-0 rounded-control bg-ember-500 px-3 py-1.5 text-xs font-medium text-carbon-950 hover:bg-ember-400 cursor-pointer"
      >
        อัปเดตทันที
      </button>
    </div>
  );
}
