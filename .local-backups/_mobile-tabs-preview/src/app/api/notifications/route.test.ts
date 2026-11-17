import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUser, getWorkNotifications } = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getWorkNotifications: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser }));
vi.mock("@/lib/notifications/service", () => ({ getWorkNotifications }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "11", roles: ["QC_INSPECTOR"], mustChangePassword: false });
  getWorkNotifications.mockResolvedValue({ userId: "11", items: [], total: 0 });
});

describe("GET /api/notifications", () => {
  it("returns 401 without redirecting or querying work for a signed-out browser", async () => {
    getCurrentUser.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(getWorkNotifications).not.toHaveBeenCalled();
  });

  it("requires a pending password change before exposing work", async () => {
    getCurrentUser.mockResolvedValue({ id: "11", mustChangePassword: true });
    expect((await GET()).status).toBe(403);
    expect(getWorkNotifications).not.toHaveBeenCalled();
  });

  it("returns only the verified user's snapshot with private cache headers", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: "11", items: [], total: 0 });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(getWorkNotifications).toHaveBeenCalledWith(await getCurrentUser());
  });

  it("reports an unavailable inbox without exposing raw errors or returning false success", async () => {
    getWorkNotifications.mockRejectedValue(new Error("private database connection details"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "notifications_unavailable" });
    log.mockRestore();
  });
});
