import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkNetworkAndSync,
  enqueueOfflineClaim,
  getOfflineActiveClaims,
  getOfflineInspection,
  HIGH_PING_THRESHOLD_MS,
  measureNetworkPing,
  processOutboxGradually,
  readOfflineOutbox,
} from "@/lib/inspections/offline-sync";

describe("offline-sync — automatic ping detection and background upload", () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    globalThis.fetch = vi.fn();

    const mockLocalStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, val: string) => {
        storage.set(key, val);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => storage.clear(),
    };

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: {
        localStorage: mockLocalStorage,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: { onLine: true },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: originalNavigator,
    });
  });

  it("reports online when ping is low and response is ok", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "ok", ts: Date.now() }), { status: 200 }),
    );

    const res = await measureNetworkPing();
    expect(res.online).toBe(true);
    expect(res.pingMs).not.toBeNull();
    expect(res.pingMs!).toBeLessThanOrEqual(HIGH_PING_THRESHOLD_MS);
  });

  it("switches to offline when navigator.onLine is false or fetch fails", async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: { onLine: false },
    });

    const resOffline = await measureNetworkPing();
    expect(resOffline.online).toBe(false);

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: { onLine: true },
    });
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("Network error"));

    const snap = await checkNetworkAndSync();
    expect(snap.isOnline).toBe(false);
    expect(snap.status).toBe("offline");
    expect(snap.entryMode).toBe("PAPER_BACKFILL");
  });

  it("enqueues offline claims and gradually uploads them when back online", async () => {
    // Force offline state first
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("Offline"));
    await checkNetworkAndSync();

    const insp = enqueueOfflineClaim({
      planId: 5,
      workOrderId: "11111111-2222-4333-8444-555555555555",
      woNo: "QP-2610-0005-1",
      modelCode: "FALCON-22150M",
      serialPump: "SN-OFFLINE-001",
      serialMotor: "MTR-01",
      serialEntryMode: "SCAN_CAMERA",
      inspectionNo: 1,
    });

    expect(insp.entryMode).toBe("PAPER_BACKFILL");
    expect(readOfflineOutbox()).toHaveLength(1);
    expect(getOfflineInspection(insp.id)?.serialPump).toBe("SN-OFFLINE-001");
    expect(getOfflineActiveClaims("11111111-2222-4333-8444-555555555555")).toHaveLength(1);

    // Mock claimUnitApi response when connection returns
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "claimed",
          inspection: { ...insp, entryMode: "PAPER_BACKFILL" },
          quota: { qtyNeed: 10, qtyDone: 0, inProgress: 1, remaining: 9, activeClaims: [] },
        }),
        { status: 200 },
      ),
    );

    await processOutboxGradually();

    expect(readOfflineOutbox()).toHaveLength(0);
    // Ping check after upload keeps "synced" status (cloud with green check)
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "ok", ts: Date.now() }), { status: 200 }),
    );
    const syncedSnap = await checkNetworkAndSync();
    expect(syncedSnap.status).toBe("synced");
    expect(syncedSnap.pendingCount).toBe(0);
  });
});
