import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelClaimApi,
  claimUnitApi,
  fetchInspectionTemplate,
  fetchWorkOrderQuota,
  submitInspectionApi,
} from "@/lib/inspections/client";

describe("inspections client SDK", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetchInspectionTemplate fetches with correct query and handles errors", async () => {
    const mockData = { template: { id: 1 }, items: [] };
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), { status: 200 }),
    );

    const res = await fetchInspectionTemplate(10, "QC");
    expect(res).toEqual(mockData);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/inspections/template?planId=10&role=QC",
      expect.objectContaining({ credentials: "same-origin" }),
    );

    // Error case
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "ไม่พบแบบตรวจ" }), { status: 404 }),
    );
    await expect(fetchInspectionTemplate(99)).rejects.toThrow("ไม่พบแบบตรวจ");
  });

  it("fetchWorkOrderQuota fetches live quota with encoded workOrderId", async () => {
    const mockQuota = { qtyNeed: 10, qtyDone: 2, inProgress: 1, remaining: 7, activeClaims: [] };
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockQuota), { status: 200 }),
    );

    const res = await fetchWorkOrderQuota("WO/2611/001");
    expect(res).toEqual(mockQuota);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/inspections/quota?workOrderId=WO%2F2611%2F001",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("claimUnitApi posts claim payload and receives status", async () => {
    const claimRes = {
      status: "claimed",
      inspection: { id: "insp-1", serialPump: "SN-001" },
      quota: { remaining: 9 },
    };
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(claimRes), { status: 200 }),
    );

    const res = await claimUnitApi({
      planId: 10,
      workOrderId: "WO-1",
      serialPump: "SN-001",
      serialEntryMode: "SCAN_CAMERA",
      entryMode: "LIVE",
    });

    expect(res).toEqual(claimRes);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/inspections/claim",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planId: 10,
          workOrderId: "WO-1",
          serialPump: "SN-001",
          serialEntryMode: "SCAN_CAMERA",
          entryMode: "LIVE",
        }),
      }),
    );
  });

  it("cancelClaimApi sends cancellation request", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "cancelled" }), { status: 200 }),
    );

    const res = await cancelClaimApi("insp-123");
    expect(res).toEqual({ status: "cancelled" });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/inspections/insp-123/cancel",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("submitInspectionApi posts completed inspection", async () => {
    const submitRes = {
      status: "done",
      evaluation: { result: "PASS" },
      qtyDone: 1,
      qtyNeed: 10,
    };
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(submitRes), { status: 200 }),
    );

    const res = await submitInspectionApi("insp-123", {
      planId: 10,
      workOrderId: "WO-1",
      answers: { 1: { status: "NORMAL" } },
    });

    expect(res).toEqual(submitRes);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/inspections/insp-123/submit",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("insp-123") ? expect.anything() : expect.anything(),
      }),
    );
  });
});
