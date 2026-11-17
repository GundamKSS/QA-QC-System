"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { NavIcon } from "@/components/shell/NavIcon";
import { activeReadIds, notificationReadKey, parseReadIds } from "@/lib/notifications/read-state";
import type { NotificationSnapshot, WorkNotification } from "@/lib/notifications/types";

type NotificationContextValue = {
  items: WorkNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  isRead: (id: string) => boolean;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);
type Toast = { ids: string[]; title: string; body: string; href: string };
const LOAD_ERROR = "โหลดแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่";

function readReceipts(key: string): Set<string> {
  try { return parseReadIds(window.localStorage.getItem(key)); }
  catch { return new Set(); }
}

function saveReceipts(key: string, ids: ReadonlySet<string>) {
  // Private browsing/storage restrictions must not prevent work from appearing.
  try { window.localStorage.setItem(key, JSON.stringify([...ids])); } catch { /* Keep receipts in memory. */ }
}

/** One feed for the shell and Alerts page. No work details are stored on the device. */
export function NotificationProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const pathname = usePathname();
  const key = notificationReadKey(userId);
  const [items, setItems] = useState<WorkNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [isDismissing, setIsDismissing] = useState(false);
  const receipts = useRef<Set<string>>(new Set());
  const receiptsLoaded = useRef(false);
  const announced = useRef(new Set<string>());
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    if (!receiptsLoaded.current) {
      receipts.current = readReceipts(key);
      receiptsLoaded.current = true;
    }
    try {
      const response = await fetch("/api/notifications", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) {
        setItems([]);
        setToast(null);
        throw new Error("เซสชันหมดอายุหรือสิทธิ์เปลี่ยน กรุณาเข้าสู่ระบบอีกครั้ง");
      }
      if (!response.ok || response.redirected) throw new Error(LOAD_ERROR);
      const snapshot = await response.json() as NotificationSnapshot;
      if (controller.signal.aborted) return;
      if (snapshot.userId !== userId || !Array.isArray(snapshot.items)) {
        setItems([]);
        setToast(null);
        throw new Error("บัญชีผู้ใช้เปลี่ยน กรุณาโหลดหน้าใหม่");
      }
      const nextRead = activeReadIds(receipts.current, snapshot.items);
      receipts.current = nextRead;
      saveReceipts(key, nextRead);
      setReadIds(nextRead);
      setItems(snapshot.items);
      setError(null);

      const fresh = snapshot.items.filter((item) => !nextRead.has(item.id) && !announced.current.has(item.id));
      if (document.visibilityState === "visible") announced.current = new Set(snapshot.items.map((item) => item.id));
      if (fresh.length > 0 && document.visibilityState === "visible") {
        setToast({
          ids: fresh.map((item) => item.id),
          title: fresh.length === 1 ? fresh[0].title : `คุณมีงานที่ต้องทำ ${fresh.length} รายการ`,
          body: fresh.length === 1 ? fresh[0].body : "เปิดแจ้งเตือนเพื่อดูใบงานที่มอบหมายให้คุณ",
          href: fresh.length === 1 ? fresh[0].href : "/alerts",
        });
      } else {
        setToast((current) => current && current.ids.some((id) => snapshot.items.some((item) => item.id === id)) ? current : null);
      }
    } catch (cause) {
      // An unmounted provider owns no UI; timeout errors remain retryable.
      if (controller.signal.aborted && request.current !== controller) return;
      const message = cause instanceof Error && /^(เซสชัน|บัญชีผู้ใช้)/.test(cause.message) ? cause.message : LOAD_ERROR;
      setError(navigator.onLine ? message : "ออฟไลน์ — จะแจ้งเตือนงานใหม่เมื่อเชื่อมต่ออีกครั้ง");
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }, [key, userId]);

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void load();
    };
    const interval = window.setInterval(refreshVisible, 30_000);
    window.addEventListener("focus", refreshVisible);
    window.addEventListener("online", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    const syncRead = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      receipts.current = readReceipts(key);
      setReadIds(receipts.current);
    };
    window.addEventListener("storage", syncRead);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      window.removeEventListener("online", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("storage", syncRead);
      const active = request.current;
      request.current = null;
      active?.abort();
    };
  }, [key, load]);

  useEffect(() => {
    const initial = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(initial);
  }, [pathname, load]);

  const dismissToast = useCallback(() => {
    setIsDismissing(true);
    window.setTimeout(() => {
      setToast(null);
      setIsDismissing(false);
    }, 300);
  }, []);

  // Auto-dismiss in-app alert toast after 5 seconds with smooth fade-out animation
  useEffect(() => {
    if (!toast) return;
    const fadeTimer = window.setTimeout(() => {
      setIsDismissing(true);
    }, 4700);

    const removeTimer = window.setTimeout(() => {
      setToast(null);
      setIsDismissing(false);
    }, 5000);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, [toast]);

  const markRead = (id: string) => {
    const next = new Set([...readReceipts(key), ...receipts.current, id]);
    receipts.current = next;
    setReadIds(next);
    saveReceipts(key, next);
    setToast((current) => current?.ids.length === 1 && current.ids[0] === id ? null : current);
  };
  const markAllRead = () => {
    const next = new Set(items.map((item) => item.id));
    receipts.current = next;
    setReadIds(next);
    saveReceipts(key, next);
    setToast(null);
  };

  return <NotificationContext.Provider value={{ items, unreadCount: items.filter((item) => !readIds.has(item.id)).length, loading, error, refresh: () => { void load(); }, markRead, markAllRead, isRead: (id) => readIds.has(id) }}>
    {children}
    <div className="fixed inset-x-4 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-50 md:inset-x-auto md:bottom-auto md:right-6 md:top-20 md:w-96 pointer-events-none" role="status" aria-live="polite" aria-atomic="true">
      {toast && <div className={`app-panel flex items-start gap-3 rounded-panel border border-ember-500/60 bg-carbon-800 p-4 shadow-xl pointer-events-auto transition-all duration-300 ease-out ${
        isDismissing
          ? "opacity-0 translate-y-3 pointer-events-none"
          : "opacity-100 translate-y-0 animate-slide-up"
      }`}>
        <NavIcon name="alerts" className="mt-0.5 size-5 shrink-0 text-ember-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ti-50">{toast.title}</p>
          <p className="mt-1 text-xs text-ti-400">{toast.body}</p>
          <Link href={toast.href} onClick={() => { if (toast.ids.length === 1) markRead(toast.ids[0]); dismissToast(); }} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-ember-400 underline underline-offset-4">ดูงาน</Link>
        </div>
        <button type="button" onClick={dismissToast} aria-label="ปิดการแจ้งเตือน" className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-control text-xl text-ti-400 hover:bg-carbon-700 cursor-pointer">×</button>
      </div>}
    </div>
  </NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const value = useContext(NotificationContext);
  if (!value) throw new Error("useNotifications requires NotificationProvider");
  return value;
}
