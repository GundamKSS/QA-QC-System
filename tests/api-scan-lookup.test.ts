import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  lookupScan: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/scan/service", () => ({
  lookupScan: mocks.lookupScan,
}));

import { POST } from "@/app/api/scan/lookup/route";

const inspectorUser = {
  id: "42",
  employeeCode: "TRW0042",
  fullName: "สมชาย ผู้ตรวจ",
  roles: ["QC_INSPECTOR"],
  mustChangePassword: false,
};

const post = (body: Record<string, unknown> | string = {}) =>
  POST(
    new Request("http://localhost:3000/api/scan/lookup", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(inspectorUser);
  mocks.lookupScan.mockResolvedValue({
    kind: "GENERIC_OR_IMPORTED",
    rawCode: "SN-001",
    serial: "SN-001",
    matchedJob: null,
    availableJobs: [],
  });
});

describe("POST /api/scan/lookup — Access & Security", () => {
  it("answers 401 when user is not signed in", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await post({ code: "SN-001" });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ status: "error", redirectTo: "/login?next=%2Fscan" });
  });

  it("answers 403 when user lacks 'scan' page permission", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...inspectorUser, roles: ["PURCHASING"] });
    const response = await post({ code: "SN-001" });
    expect(response.status).toBe(403);
  });

  it.each(["QC_INSPECTOR", "QC_HEAD", "QA_INSPECTOR", "QA_HEAD"])("allows %s to access scan lookup", async (role) => {
    mocks.getCurrentUser.mockResolvedValue({ ...inspectorUser, roles: [role] });
    const response = await post({ code: "SN-001" });
    expect(response.status).toBe(200);
  });
});

describe("POST /api/scan/lookup — Input Validation & Results", () => {
  it("answers 422 when code is missing or empty", async () => {
    const response = await post({ code: "" });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      status: "error",
      message: "กรุณาระบุรหัสที่สแกน (code)",
    });
  });

  it("calls service and returns result with 200 and status: done", async () => {
    mocks.lookupScan.mockResolvedValue({
      kind: "INTERNAL_PUMP",
      rawCode: "WO1274/69|...",
      parsed: { woNo: "WO1274/69", modelCode: "PP-23P", serial: "SN69/00014-15" },
      matchedJob: { id: "job-1", woNo: "WO1274/69" },
      availableJobs: [],
    });

    const response = await post({ code: "WO1274/69|..." });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("done");
    expect(body.result.kind).toBe("INTERNAL_PUMP");
    expect(body.result.matchedJob.id).toBe("job-1");
  });
});
