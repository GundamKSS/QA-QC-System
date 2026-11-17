import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readSession: vi.fn(), deleteSession: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ readSession: mocks.readSession, deleteSession: mocks.deleteSession }));
vi.mock("@/lib/auth/audit", () => ({ audit: mocks.audit, auditContext: () => ({ ip: "10.0.0.5", userAgent: "test" }) }));

import { POST } from "@/app/api/auth/logout/route";

const post = (headers: Record<string, string> = { "sec-fetch-site": "same-origin" }) => POST(new Request("http://localhost:3000/api/auth/logout", { method: "POST", headers }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.readSession.mockResolvedValue({ id: "11", employeeCode: "TRW0011" });
});

describe("POST /api/auth/logout", () => {
  it("ends the session, audits it and sends the browser to /login with a relative 303 (a full page load)", async () => {
    const response = await post();
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/login");
    expect(await response.text()).toBe("");
    expect(mocks.deleteSession).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledWith({ action: "logout", employeeCode: "TRW0011", userId: "11" }, { ip: "10.0.0.5", userAgent: "test" });
  });

  it("still signs the browser out when there was no session, without an audit row", async () => {
    mocks.readSession.mockResolvedValue(null);
    const response = await post();
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/login");
    expect(mocks.deleteSession).toHaveBeenCalledTimes(1);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("refuses a cross-site POST and leaves the session alone (no forced sign-out from another site)", async () => {
    const response = await post({ "sec-fetch-site": "cross-site" });
    expect(response.status).toBe(403);
    expect(mocks.readSession).not.toHaveBeenCalled();
    expect(mocks.deleteSession).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("refuses a POST whose Origin is another host when the browser sends no Sec-Fetch-Site", async () => {
    const response = await post({ origin: "https://evil.example", host: "localhost:3000" });
    expect(response.status).toBe(403);
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });
});
