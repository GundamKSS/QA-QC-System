"use client";

import { useEffect, useSyncExternalStore } from "react";
import { invalidateApiReads } from "@/lib/api/invalidate";
import { claimUnitApi } from "./client";
import type { ActiveClaim, StoredInspection } from "./store";
import type { EntryMode, InspectionRole, SerialEntryMode } from "./types";

/**
 * Ping threshold in milliseconds.
 * If ping RTT exceeds this value (or request fails / browser is offline),
 * the system automatically switches to Offline recording mode (PAPER_BACKFILL).
 */
export const HIGH_PING_THRESHOLD_MS = 1000;

/** Ping timeout in milliseconds. */
const PING_TIMEOUT_MS = 2500;

/** Poll interval when offline or when outbox has pending items (ms). */
const OFFLINE_CHECK_INTERVAL_MS = 5000;

/** Poll interval when online and idle (ms). */
const ONLINE_CHECK_INTERVAL_MS = 12000;

/** Small step delay between background uploads so items upload gradually without spiking the connection. */
const GRADUAL_UPLOAD_STEP_MS = 650;

const OUTBOX_STORAGE_KEY = "qcheck.offlineOutbox.v1";
const INSPECTIONS_STORAGE_KEY = "qcheck.offlineInspections.v1";

export type OfflineClaimQueueItem = {
  id: string;
  planId: number;
  workOrderId: string;
  woNo?: string;
  modelCode?: string;
  role: InspectionRole;
  serialPump: string;
  serialMotor: string | null;
  serialEntryMode: SerialEntryMode;
  createdAt: string;
};

export type NetworkSyncStatus = "online" | "offline" | "syncing" | "synced";

export type NetworkSyncSnapshot = {
  status: NetworkSyncStatus;
  isOnline: boolean;
  pingMs: number | null;
  entryMode: EntryMode;
  pendingCount: number;
  syncingProgress: { done: number; total: number } | null;
  lastSyncedAt: number | null;
};

type Listener = (snapshot: NetworkSyncSnapshot) => void;

const listeners = new Set<Listener>();

let currentSnapshot: NetworkSyncSnapshot = {
  status: "online",
  isOnline: true,
  pingMs: null,
  entryMode: "LIVE",
  pendingCount: 0,
  syncingProgress: null,
  lastSyncedAt: null,
};

let isSyncing = false;
let monitorStarted = false;
let checkTimer: ReturnType<typeof setTimeout> | null = null;

function notify() {
  for (const listener of listeners) {
    listener(currentSnapshot);
  }
}

function updateSnapshot(patch: Partial<NetworkSyncSnapshot>) {
  currentSnapshot = { ...currentSnapshot, ...patch };
  notify();
}

export function readOfflineOutbox(): OfflineClaimQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOfflineOutbox(items: OfflineClaimQueueItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota errors
  }
}

export function readOfflineInspections(): Record<string, StoredInspection> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(INSPECTIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeOfflineInspection(inspection: StoredInspection) {
  if (typeof window === "undefined") return;
  try {
    const all = readOfflineInspections();
    all[inspection.id] = inspection;
    window.localStorage.setItem(INSPECTIONS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Ignore storage quota errors
  }
}

export function getOfflineInspection(id: string): StoredInspection | null {
  const all = readOfflineInspections();
  const found = all[id];
  if (!found) return null;
  return {
    ...found,
    startedAt: new Date(found.startedAt),
    submittedAt: found.submittedAt ? new Date(found.submittedAt) : null,
  };
}

export function getOfflineActiveClaims(workOrderId: string): ActiveClaim[] {
  const outbox = readOfflineOutbox();
  return outbox
    .filter((item) => item.workOrderId === workOrderId)
    .map((item) => ({
      inspectionId: item.id,
      serialPump: item.serialPump,
      inspectorId: "offline",
      inspectorName: "รออัปโหลด",
      startedAt: new Date(item.createdAt),
    }));
}

function generateGuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Enqueue a unit claim when offline (or when server is unreachable) so the inspector
 * can continue inspecting immediately and upload in the background once online.
 */
export function enqueueOfflineClaim(input: {
  planId: number;
  workOrderId: string;
  woNo?: string;
  modelCode?: string;
  role?: InspectionRole;
  serialPump: string;
  serialMotor?: string | null;
  serialEntryMode: SerialEntryMode;
  inspectionNo?: number;
}): StoredInspection {
  const id = generateGuid();
  const nowIso = new Date().toISOString();
  const role: InspectionRole = input.role ?? "QC";

  const queueItem: OfflineClaimQueueItem = {
    id,
    planId: input.planId,
    workOrderId: input.workOrderId,
    woNo: input.woNo,
    modelCode: input.modelCode,
    role,
    serialPump: input.serialPump,
    serialMotor: input.serialMotor ?? null,
    serialEntryMode: input.serialEntryMode,
    createdAt: nowIso,
  };

  const outbox = readOfflineOutbox();
  // Avoid duplicate serial in outbox for the same plan
  const filtered = outbox.filter(
    (item) => !(item.planId === input.planId && item.serialPump === input.serialPump),
  );
  filtered.push(queueItem);
  writeOfflineOutbox(filtered);

  const inspection: StoredInspection = {
    id,
    planId: input.planId,
    workOrderId: input.workOrderId,
    role,
    cycleNo: 1,
    roundNo: 1,
    inspectionNo: input.inspectionNo ?? filtered.length,
    serialPump: input.serialPump,
    serialMotor: input.serialMotor ?? null,
    serialSupplier: null,
    serialEntryMode: input.serialEntryMode,
    entryMode: "PAPER_BACKFILL",
    inspectorId: "local",
    startedAt: new Date(nowIso),
    submittedAt: null,
    result: null,
    action: null,
    suggestedAction: null,
    status: "IN_PROGRESS",
    answers: {},
  };

  writeOfflineInspection(inspection);

  updateSnapshot({
    pendingCount: filtered.length,
    status: currentSnapshot.isOnline ? "syncing" : "offline",
  });

  if (currentSnapshot.isOnline) {
    void processOutboxGradually();
  }

  return inspection;
}

/**
 * Measure actual network RTT ping to the QCheck server.
 * Returns `{ online: boolean; pingMs: number | null }`.
 */
export async function measureNetworkPing(): Promise<{ online: boolean; pingMs: number | null }> {
  if (typeof window !== "undefined" && navigator.onLine === false) {
    return { online: false, pingMs: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();

  try {
    const res = await fetch(`/api/inspections/quota?ping=1&_t=${Date.now()}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok && res.status >= 500) {
      return { online: false, pingMs: null };
    }

    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    const pingMs = Math.max(1, Math.round(end - start));
    const online = pingMs <= HIGH_PING_THRESHOLD_MS;
    return { online, pingMs };
  } catch {
    clearTimeout(timer);
    return { online: false, pingMs: null };
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Gradually upload queued offline claims one by one in the background
 * when connection returns to Online.
 */
export async function processOutboxGradually(): Promise<void> {
  if (isSyncing) return;
  const initialOutbox = readOfflineOutbox();
  if (initialOutbox.length === 0) return;

  isSyncing = true;
  const total = initialOutbox.length;
  let done = 0;

  updateSnapshot({
    status: "syncing",
    pendingCount: total,
    syncingProgress: { done: 0, total },
  });

  try {
    while (true) {
      const currentOutbox = readOfflineOutbox();
      if (currentOutbox.length === 0) break;

      const item = currentOutbox[0];
      // Small delay so the user sees the gradual background progress and connection isn't spiked
      await delay(GRADUAL_UPLOAD_STEP_MS);

      try {
        const res = await claimUnitApi({
          inspectionId: item.id,
          planId: item.planId,
          workOrderId: item.workOrderId,
          role: item.role,
          serialPump: item.serialPump,
          serialMotor: item.serialMotor,
          serialEntryMode: item.serialEntryMode,
          entryMode: "PAPER_BACKFILL",
        });

        // Remove from queue if claimed, resumed, or already processed on server
        if (res.status === "claimed" || res.message) {
          if (res.status === "claimed" && res.inspection) {
            writeOfflineInspection(res.inspection);
          }
          const remaining = readOfflineOutbox().filter((q) => q.id !== item.id);
          writeOfflineOutbox(remaining);
          done += 1;
          updateSnapshot({
            status: "syncing",
            pendingCount: remaining.length,
            syncingProgress: { done, total },
          });
        } else {
          // Unexpected response; stop and retry on next check cycle
          break;
        }
      } catch {
        // Network dropped during upload; switch back to offline and retry on next cycle
        updateSnapshot({
          status: "offline",
          isOnline: false,
          entryMode: "PAPER_BACKFILL",
          syncingProgress: null,
        });
        isSyncing = false;
        return;
      }
    }

    const left = readOfflineOutbox().length;
    if (left === 0 && done > 0) {
      invalidateApiReads();
      updateSnapshot({
        status: "synced",
        isOnline: true,
        entryMode: "LIVE",
        pendingCount: 0,
        syncingProgress: null,
        lastSyncedAt: Date.now(),
      });
    }
  } finally {
    isSyncing = false;
  }
}

/**
 * Run a single connection & ping check cycle, updating status and triggering
 * background upload if connection returned to online.
 */
export async function checkNetworkAndSync(): Promise<NetworkSyncSnapshot> {
  const outbox = readOfflineOutbox();
  const { online, pingMs } = await measureNetworkPing();

  if (!online) {
    updateSnapshot({
      status: "offline",
      isOnline: false,
      pingMs,
      entryMode: "PAPER_BACKFILL",
      pendingCount: outbox.length,
      syncingProgress: null,
    });
    return currentSnapshot;
  }

  // Connection is online with low ping
  if (outbox.length > 0) {
    updateSnapshot({
      isOnline: true,
      pingMs,
      entryMode: "LIVE",
      pendingCount: outbox.length,
    });
    void processOutboxGradually();
    return currentSnapshot;
  }

  // Keep "synced" cloud-check icon visible if a background sync completed recently
  const keepSyncedBadge =
    currentSnapshot.status === "synced" &&
    currentSnapshot.lastSyncedAt !== null &&
    Date.now() - currentSnapshot.lastSyncedAt < 60_000;

  updateSnapshot({
    status: keepSyncedBadge ? "synced" : "online",
    isOnline: true,
    pingMs,
    entryMode: "LIVE",
    pendingCount: 0,
    syncingProgress: null,
  });

  return currentSnapshot;
}

function scheduleNextCheck() {
  if (typeof window === "undefined") return;
  if (checkTimer) clearTimeout(checkTimer);

  const interval =
    !currentSnapshot.isOnline || currentSnapshot.pendingCount > 0
      ? OFFLINE_CHECK_INTERVAL_MS
      : ONLINE_CHECK_INTERVAL_MS;

  checkTimer = setTimeout(async () => {
    await checkNetworkAndSync();
    scheduleNextCheck();
  }, interval);
}

function startMonitorIfNeeded() {
  if (monitorStarted || typeof window === "undefined") return;
  monitorStarted = true;

  const initialOutbox = readOfflineOutbox();
  currentSnapshot = {
    ...currentSnapshot,
    pendingCount: initialOutbox.length,
  };

  const handleOnline = () => {
    void checkNetworkAndSync().then(scheduleNextCheck);
  };
  const handleOffline = () => {
    updateSnapshot({
      status: "offline",
      isOnline: false,
      pingMs: null,
      entryMode: "PAPER_BACKFILL",
      pendingCount: readOfflineOutbox().length,
      syncingProgress: null,
    });
    scheduleNextCheck();
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  void checkNetworkAndSync().then(scheduleNextCheck);
}

function subscribe(callback: () => void) {
  const listener: Listener = () => callback();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): NetworkSyncSnapshot {
  return currentSnapshot;
}

const serverSnapshot: NetworkSyncSnapshot = {
  status: "online",
  isOnline: true,
  pingMs: null,
  entryMode: "LIVE",
  pendingCount: 0,
  syncingProgress: null,
  lastSyncedAt: null,
};

function getServerSnapshot(): NetworkSyncSnapshot {
  return serverSnapshot;
}

/**
 * React hook for subscribing to automatic Online/Offline ping detection
 * and background upload status.
 */
export function useNetworkSync(): NetworkSyncSnapshot & { recheck: () => Promise<void> } {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    startMonitorIfNeeded();
  }, []);

  return {
    ...snapshot,
    recheck: async () => {
      await checkNetworkAndSync();
    },
  };
}
