import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUser,
  dbConfigured,
  resolveActorId,
  listDevices,
  registerAndBindDevice,
  updateDevice,
  clearDeviceCookie,
  getCurrentDevicePolicy,
  audit,
} = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  dbConfigured: vi.fn(),
  resolveActorId: vi.fn(),
  listDevices: vi.fn(),
  registerAndBindDevice: vi.fn(),
  updateDevice: vi.fn(),
  clearDeviceCookie: vi.fn(),
  getCurrentDevicePolicy: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ getCurrentUser }));
vi.mock("@/lib/db/config", () => ({ dbConfigured }));
vi.mock("@/lib/db/actor", () => ({ resolveActorId }));
vi.mock("@/lib/auth/audit", () => ({ audit, auditContext: () => ({ ip: "127.0.0.1", userAgent: "vitest" }) }));
vi.mock("@/lib/auth/devices", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/devices")>();
  return {
    ...actual,
    listDevices,
    registerAndBindDevice,
    updateDevice,
    clearDeviceCookie,
    getCurrentDevicePolicy,
  };
});

import { DeviceConflictError } from "@/lib/auth/devices";
import { GET, POST } from "@/app/api/admin/devices/route";
import { PATCH } from "@/app/api/admin/devices/[id]/route";
import { POST as UNBIND } from "@/app/api/admin/devices/unbind/route";

const adminUser = {
  id: "1",
  employeeCode: "ADM0001",
  fullName: "Admin",
  roles: ["ADMIN"],
  mustChangePassword: false,
};

function makeRequest(url: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method,
    headers: {
      origin: "http://localhost:3000",
      host: "localhost:3000",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue(adminUser);
  dbConfigured.mockReturnValue(true);
  resolveActorId.mockResolvedValue("1");
  listDevices.mockResolvedValue({
    currentDevice: { deviceId: null, deviceCode: null, deviceName: null, location: null, kind: "personal", idleMinutes: null, warnSeconds: 0 },
    devices: [],
    dbAvailable: true,
  });
  registerAndBindDevice.mockResolvedValue({
    id: "7",
    deviceCode: "TAB-QC-01",
    deviceName: "แท็บเล็ตสายพาน 1",
    location: "แผนก 408",
    deviceKind: "shared",
    idleMinutes: 30,
    isActive: true,
    lastSeenAt: "2026-11-19T10:00:00.000Z",
    createdAt: "2026-11-19T10:00:00.000Z",
    updatedAt: "2026-11-19T10:00:00.000Z",
    isCurrentDevice: true,
  });
  updateDevice.mockResolvedValue({
    before: { id: "7", deviceCode: "TAB-QC-01", deviceName: "แท็บเล็ตสายพาน 1", location: null, deviceKind: "shared", idleMinutes: 30, isActive: true, lastSeenAt: null, createdAt: "", updatedAt: "", isCurrentDevice: true },
    after: { id: "7", deviceCode: "TAB-QC-01", deviceName: "แท็บเล็ตสายพาน 1", location: null, deviceKind: "shared", idleMinutes: 30, isActive: false, lastSeenAt: null, createdAt: "", updatedAt: "", isCurrentDevice: true },
  });
  getCurrentDevicePolicy.mockResolvedValue({
    deviceId: "7",
    deviceCode: "TAB-QC-01",
    deviceName: "แท็บเล็ตสายพาน 1",
    location: null,
    kind: "shared",
    idleMinutes: 30,
    warnSeconds: 60,
  });
  clearDeviceCookie.mockResolvedValue(undefined);
});

describe("Admin Devices API", () => {
  it("GET requires Admin settings access and returns device list", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await GET(makeRequest("http://localhost:3000/api/admin/devices", "GET"))).status).toBe(401);

    getCurrentUser.mockResolvedValue({ ...adminUser, roles: ["QC_INSPECTOR"] });
    expect((await GET(makeRequest("http://localhost:3000/api/admin/devices", "GET"))).status).toBe(403);

    getCurrentUser.mockResolvedValue(adminUser);
    const ok = await GET(makeRequest("http://localhost:3000/api/admin/devices", "GET"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ dbAvailable: true, devices: [] });
  });

  it("POST validates CSRF, payload, duplicates, and audits registration", async () => {
    const cross = await POST(
      makeRequest("http://localhost:3000/api/admin/devices", "POST", { deviceCode: "TAB-01", deviceName: "Test" }, { origin: "https://evil.example" }),
    );
    expect(cross.status).toBe(403);

    const invalid = await POST(makeRequest("http://localhost:3000/api/admin/devices", "POST", { deviceCode: "!", deviceName: "x" }));
    expect(invalid.status).toBe(422);

    registerAndBindDevice.mockRejectedValueOnce(new DeviceConflictError("รหัสอุปกรณ์ TAB-QC-01 มีอยู่ในระบบแล้ว"));
    const dup = await POST(
      makeRequest("http://localhost:3000/api/admin/devices", "POST", { deviceCode: "TAB-QC-01", deviceName: "แท็บเล็ตสายพาน 1", deviceKind: "shared", idleMinutes: 30 }),
    );
    expect(dup.status).toBe(409);

    const created = await POST(
      makeRequest("http://localhost:3000/api/admin/devices", "POST", { deviceCode: "TAB-QC-01", deviceName: "แท็บเล็ตสายพาน 1", location: "แผนก 408", deviceKind: "shared", idleMinutes: 30 }),
    );
    expect(created.status).toBe(201);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "device.register" }), expect.anything());
  });

  it("PATCH validates id/body and audits device deactivation", async () => {
    const badId = await PATCH(
      makeRequest("http://localhost:3000/api/admin/devices/abc", "PATCH", { isActive: false }),
      { params: Promise.resolve({ id: "abc" }) },
    );
    expect(badId.status).toBe(404);

    const emptyBody = await PATCH(
      makeRequest("http://localhost:3000/api/admin/devices/7", "PATCH", {}),
      { params: Promise.resolve({ id: "7" }) },
    );
    expect(emptyBody.status).toBe(422);

    const res = await PATCH(
      makeRequest("http://localhost:3000/api/admin/devices/7", "PATCH", { isActive: false }),
      { params: Promise.resolve({ id: "7" }) },
    );
    expect(res.status).toBe(200);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "device.deactivate" }), expect.anything());
  });

  it("POST /unbind clears the device cookie and writes audit log", async () => {
    const res = await UNBIND(makeRequest("http://localhost:3000/api/admin/devices/unbind", "POST"));
    expect(res.status).toBe(200);
    expect(clearDeviceCookie).toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "device.unbind" }), expect.anything());
  });
});
