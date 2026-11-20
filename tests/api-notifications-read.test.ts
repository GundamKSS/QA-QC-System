import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUser, dbConfigured, resolveActorId, markNotificationsRead } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  dbConfigured: vi.fn(),
  resolveActorId: vi.fn(),
  markNotificationsRead: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ getCurrentUser }));
vi.mock("@/lib/db/config", () => ({ dbConfigured }));
vi.mock("@/lib/db/actor", () => ({ resolveActorId }));
vi.mock("@/lib/notifications/read-store", () => ({ markNotificationsRead }));

import { POST } from "@/app/api/notifications/read/route";

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/notifications/read", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      host: "localhost:3000",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({
    id: "11",
    employeeCode: "F0011",
    fullName: "ผู้ตรวจ",
    roles: ["QC_INSPECTOR"],
    mustChangePassword: false,
  });
  dbConfigured.mockReturnValue(true);
  resolveActorId.mockResolvedValue("11");
  markNotificationsRead.mockResolvedValue({ marked: 1, readIds: ["work-order:5:IN_PROGRESS"], synced: true });
});

describe("POST /api/notifications/read", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await POST(postRequest({ ids: ["work-order:5:IN_PROGRESS"] }));
    expect(res.status).toBe(401);
    expect(markNotificationsRead).not.toHaveBeenCalled();
  });

  it("blocks cross-origin POST requests with 403", async () => {
    const res = await POST(
      postRequest({ ids: ["work-order:5:IN_PROGRESS"] }, { origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
    expect(markNotificationsRead).not.toHaveBeenCalled();
  });

  it("blocks users with a pending PIN change with 403", async () => {
    getCurrentUser.mockResolvedValue({
      id: "11",
      roles: ["QC_INSPECTOR"],
      mustChangePassword: true,
    });
    const res = await POST(postRequest({ ids: ["work-order:5:IN_PROGRESS"] }));
    expect(res.status).toBe(403);
    expect(markNotificationsRead).not.toHaveBeenCalled();
  });

  it("returns 422 on empty or invalid payload", async () => {
    const emptyRes = await POST(postRequest({ items: [] }));
    expect(emptyRes.status).toBe(422);

    const badJsonRes = await POST(postRequest("{invalid-json"));
    expect(badJsonRes.status).toBe(422);
    expect(markNotificationsRead).not.toHaveBeenCalled();
  });

  it("persists validated items and returns synced read receipt response", async () => {
    const res = await POST(
      postRequest({
        items: [
          {
            id: "work-order:5:IN_PROGRESS",
            woNo: "QP-2611-0001-1",
            kind: "assigned",
            title: "คุณมีงานที่ต้องทำ",
            body: "QP-2611-0001-1 · M-100",
            href: "/jobs?view=mine",
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "done",
      marked: 1,
      readIds: ["work-order:5:IN_PROGRESS"],
      synced: true,
    });
    expect(markNotificationsRead).toHaveBeenCalledWith("11", [
      {
        id: "work-order:5:IN_PROGRESS",
        woNo: "QP-2611-0001-1",
        kind: "assigned",
        title: "คุณมีงานที่ต้องทำ",
        body: "QP-2611-0001-1 · M-100",
        href: "/jobs?view=mine",
      },
    ]);
  });

  it("returns 503 when SQL Server is unreachable without exposing raw error details", async () => {
    const err = Object.assign(new Error("ConnectionError: secret-host:1433 failed"), {
      name: "ConnectionError",
      code: "ESOCKET",
    });
    markNotificationsRead.mockRejectedValue(err);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(postRequest({ ids: ["work-order:5:IN_PROGRESS"] }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.status).toBe("error");
    expect(json.message).not.toContain("secret-host");
    log.mockRestore();
  });
});
