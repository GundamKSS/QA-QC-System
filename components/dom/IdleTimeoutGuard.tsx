"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { idleState, nextIdleCheckMs, type DeviceKind } from "@/lib/auth/idle";
import { authPolicy } from "@/lib/config/auth";

const ACTIVITY_STORAGE_KEY = "qcheck:shared-device-last-activity";
const THROTTLE_MS = 2_000;

export type IdleDevicePolicy = {
  deviceCode: string | null;
  deviceName: string | null;
  kind: DeviceKind;
  idleMinutes: number | null;
  warnSeconds: number;
};

/**
 * FR-AUTH-05 (docs/10 Pass 7): On Admin-registered shared devices, tracks user activity across tabs,
 * warns before expiry with a live countdown, and performs a full-page POST logout when idle expires
 * so no prior user's in-memory state remains for the next operator.
 */
export function IdleTimeoutGuard({ policy }: { policy: IdleDevicePolicy }) {
  const active = policy.kind === "shared" && policy.idleMinutes !== null;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const lastActivityRef = useRef<number>(0);
  const lastWriteRef = useRef<number>(0);
  const logoutFormRef = useRef<HTMLFormElement>(null);
  const expiredRef = useRef<boolean>(false);

  const triggerIdleLogout = useCallback(() => {
    if (expiredRef.current) return;
    expiredRef.current = true;
    setSigningOut(true);
    try {
      window.localStorage.removeItem(ACTIVITY_STORAGE_KEY);
    } catch {
      // Ignore storage restrictions.
    }
    if (logoutFormRef.current) {
      logoutFormRef.current.submit();
    } else {
      window.location.replace(`${authPolicy.loginPath}?idle=1`);
    }
  }, []);

  const recordActivity = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastWriteRef.current < THROTTLE_MS) return;
    lastWriteRef.current = now;
    lastActivityRef.current = now;
    setSecondsLeft(null);
    try {
      window.localStorage.setItem(ACTIVITY_STORAGE_KEY, String(now));
    } catch {
      // Ignore storage restrictions.
    }
  }, []);

  useEffect(() => {
    if (!active || policy.idleMinutes === null) return;

    const devicePolicy = { idleMinutes: policy.idleMinutes, warnSeconds: policy.warnSeconds };
    const now = Date.now();
    lastActivityRef.current = now;
    lastWriteRef.current = now;
    try {
      window.localStorage.setItem(ACTIVITY_STORAGE_KEY, String(now));
    } catch {
      // Ignore storage restrictions.
    }

    let timer: number | null = null;
    let countdownInterval: number | null = null;

    const clearTimers = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (countdownInterval !== null) {
        window.clearInterval(countdownInterval);
        countdownInterval = null;
      }
    };

    const evaluate = () => {
      clearTimers();
      const currentNow = Date.now();
      const state = idleState(lastActivityRef.current, currentNow, "shared", devicePolicy);
      if (state.status === "expired") {
        setSecondsLeft(0);
        triggerIdleLogout();
        return;
      }
      if (state.status === "warning") {
        setSecondsLeft(Math.max(1, Math.ceil(state.msLeft / 1000)));
        countdownInterval = window.setInterval(() => {
          const tick = idleState(lastActivityRef.current, Date.now(), "shared", devicePolicy);
          if (tick.status === "expired") {
            clearTimers();
            setSecondsLeft(0);
            triggerIdleLogout();
          } else if (tick.status === "warning") {
            setSecondsLeft(Math.max(1, Math.ceil(tick.msLeft / 1000)));
          } else {
            clearTimers();
            setSecondsLeft(null);
            evaluate();
          }
        }, 1_000);
        return;
      }

      setSecondsLeft(null);
      const waitMs = nextIdleCheckMs(lastActivityRef.current, currentNow, "shared", devicePolicy);
      if (waitMs !== null) {
        timer = window.setTimeout(evaluate, Math.max(250, waitMs + 50));
      }
    };

    const onActivity = () => {
      // While the warning dialog is open, require an explicit button press ("อยู่ใช้งานต่อ") rather than stray mouse movement.
      const current = idleState(lastActivityRef.current, Date.now(), "shared", devicePolicy);
      if (current.status === "warning") return;
      recordActivity(false);
      evaluate();
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACTIVITY_STORAGE_KEY || !event.newValue) return;
      const parsed = Number(event.newValue);
      if (Number.isFinite(parsed) && parsed > lastActivityRef.current) {
        lastActivityRef.current = parsed;
        evaluate();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") evaluate();
    };

    evaluate();
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart", "scroll"];
    for (const evt of events) {
      window.addEventListener(evt, onActivity, { passive: true });
    }
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimers();
      for (const evt of events) {
        window.removeEventListener(evt, onActivity);
      }
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, policy.idleMinutes, policy.warnSeconds, recordActivity, triggerIdleLogout]);

  if (!active) return null;

  return (
    <>
      <form
        ref={logoutFormRef}
        method="POST"
        action={`${authPolicy.logoutPath}?reason=idle`}
        className="hidden"
        aria-hidden="true"
      />
      {secondsLeft !== null && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="idle-timeout-title"
          aria-describedby="idle-timeout-desc"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md space-y-5 rounded-surface border border-ember-500/60 bg-carbon-800 p-6 shadow-2xl">
            <div className="space-y-2">
              <p className="font-mono text-xs tracking-wider text-ember-400 uppercase">
                Shared Device Timeout{policy.deviceCode ? ` · ${policy.deviceCode}` : ""}
              </p>
              <h2 id="idle-timeout-title" className="text-xl font-semibold text-ti-50">
                กำลังจะออกจากระบบอัตโนมัติ
              </h2>
              <p id="idle-timeout-desc" className="text-sm text-ti-300">
                ไม่มีการใช้งานบนเครื่องส่วนกลาง
                {policy.deviceName ? ` (${policy.deviceName})` : ""} — ระบบจะออกจากระบบภายใน{" "}
                <span className="font-mono text-base font-bold text-ember-400">{secondsLeft}</span> วินาที
                เพื่อความปลอดภัยของบัญชีคุณ
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={signingOut}
                onClick={triggerIdleLogout}
                className="min-h-11 rounded-control border border-carbon-600 bg-carbon-900 px-4 py-2 text-sm text-ti-300 transition-colors hover:border-ti-400 hover:text-ti-50 disabled:opacity-50 cursor-pointer"
              >
                ออกจากระบบ / สลับผู้ใช้
              </button>
              <button
                type="button"
                disabled={signingOut}
                onClick={() => recordActivity(true)}
                className="min-h-11 rounded-control bg-ember-500 px-5 py-2 text-sm font-medium text-carbon-950 transition-colors hover:bg-ember-400 disabled:opacity-50 cursor-pointer"
              >
                อยู่ใช้งานต่อ
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
