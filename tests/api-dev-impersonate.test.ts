import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createSession: vi.fn(),
  dbConfigured: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/session", () => ({ createSession: mocks.createSession }));
vi.mock("@/lib/db/config", () => ({ dbConfigured: mocks.dbConfigured }));

import { GET, POST } from "@/app/api/dev/impersonate/route";

const postReq = (body: unknown, sameOrigin = true) =>
  new Request("http://localhost:3000/api/dev/impersonate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sec-fetch-site": sameOrigin ? "same-origin" : "cross-site",
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.dbConfigured.mockReturnValue(false);
});

describe("/api/dev/impersonate security & programRole preservation", () => {
  it("returns 401 when unauthenticated even if QCHECK_ALLOW_DEV_ROLE=on", async () => {
    vi.stubEnv("QCHECK_ALLOW_DEV_ROLE", "on");
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(postReq({ employeeCode: "dev" }))).status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("returns 403 for non-DEV users (including ADMIN & QC_INSPECTOR) even when QCHECK_ALLOW_DEV_ROLE=on", async () => {
    vi.stubEnv("QCHECK_ALLOW_DEV_ROLE", "on");
    mocks.getCurrentUser.mockResolvedValue({
      id: "9",
      employeeCode: "DEMO_ADMIN",
      fullName: "Admin",
      programRole: "ADMIN",
      roles: ["ADMIN"],
      mustChangePassword: false,
    });
    expect((await GET()).status).toBe(403);
    expect((await POST(postReq({ employeeCode: "dev" }))).status).toBe(403);
    vi.unstubAllEnvs();
  });

  it("blocks cross-site POST with 403", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "2",
      employeeCode: "dev",
      fullName: "Dev",
      programRole: "DEV",
      roles: [],
      mustChangePassword: false,
    });
    expect((await POST(postReq({ employeeCode: "dev" }, false))).status).toBe(403);
  });

  it("allows DEV user to list personas and switch, setting impersonatedByDev=true for non-DEV targets", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "2",
      employeeCode: "dev",
      fullName: "Dev",
      programRole: "DEV",
      roles: [],
      mustChangePassword: false,
    });
    expect((await GET()).status).toBe(200);

    const switchRes = await POST(postReq({ employeeCode: "TRW1001" }));
    expect(switchRes.status).toBe(200);
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeCode: "TRW1001",
        impersonatedByDev: true,
      }),
    );
  });

  it("allows an impersonatedByDev session to switch back to DEV cleanly (impersonatedByDev=false)", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "11",
      employeeCode: "DEMO_QC01",
      fullName: "QC",
      programRole: "USER",
      roles: ["QC_INSPECTOR"],
      impersonatedByDev: true,
      mustChangePassword: false,
    });
    expect((await GET()).status).toBe(200);

    const backRes = await POST(postReq({ employeeCode: "dev" }));
    expect(backRes.status).toBe(200);
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeCode: "dev",
        programRole: "DEV",
        impersonatedByDev: false,
      }),
    );
  });
});
