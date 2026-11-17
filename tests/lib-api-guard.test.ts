import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser }));

import { guardApi } from "@/lib/api/guard";

const head = { id: "11", employeeCode: "TRW0001", fullName: "หัวหน้า QC", roles: ["QC_HEAD"], mustChangePassword: false };
const post = (headers: Record<string, string> = {}) => new Request("http://localhost:3000/api/x", { method: "POST", headers });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue(head);
});

describe("guardApi", () => {
  it("returns the user when the request is same-origin, signed in and allowed", async () => {
    const guard = await guardApi(post({ "sec-fetch-site": "same-origin" }), { page: "plan-open" });
    expect(guard).toEqual({ user: head });
  });

  it("refuses a cross-site POST before looking at the session", async () => {
    const guard = await guardApi(post({ "sec-fetch-site": "cross-site" }));
    expect("response" in guard && guard.response.status).toBe(403);
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("refuses a POST whose Origin is another host", async () => {
    const guard = await guardApi(post({ origin: "https://evil.example", host: "localhost:3000" }));
    expect("response" in guard && guard.response.status).toBe(403);
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("does not apply the origin check to a GET", async () => {
    const guard = await guardApi(new Request("http://localhost:3000/api/x", { headers: { "sec-fetch-site": "cross-site" } }));
    expect(guard).toEqual({ user: head });
  });

  it("answers 401 JSON with the sign-in address (and where to come back to) instead of redirecting", async () => {
    getCurrentUser.mockResolvedValue(null);
    const guard = await guardApi(post(), { returnTo: "/plans/new" });
    if (!("response" in guard)) throw new Error("expected a response");
    expect(guard.response.status).toBe(401);
    expect(guard.response.headers.get("Location")).toBeNull();
    expect(guard.response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await guard.response.json()).toMatchObject({ status: "error", redirectTo: "/login?next=%2Fplans%2Fnew" });
  });

  it("points a signed-out person to /login with no next when no return address is given", async () => {
    getCurrentUser.mockResolvedValue(null);
    const guard = await guardApi(post());
    if (!("response" in guard)) throw new Error("expected a response");
    expect(await guard.response.json()).toMatchObject({ redirectTo: "/login" });
  });

  it("blocks someone who still owes a PIN change, unless the route allows it", async () => {
    getCurrentUser.mockResolvedValue({ ...head, mustChangePassword: true });
    const blocked = await guardApi(post());
    if (!("response" in blocked)) throw new Error("expected a response");
    expect(blocked.response.status).toBe(403);
    expect(await blocked.response.json()).toMatchObject({ redirectTo: "/change-password" });

    expect(await guardApi(post(), { allowPasswordChange: true })).toHaveProperty("user");
  });

  it("answers 403 when the role may not use the page", async () => {
    getCurrentUser.mockResolvedValue({ ...head, roles: ["QC_INSPECTOR"] });
    const guard = await guardApi(post(), { page: "plan-open" });
    if (!("response" in guard)) throw new Error("expected a response");
    expect(guard.response.status).toBe(403);
    expect(await guard.response.json()).toEqual({ status: "error", message: "คุณไม่มีสิทธิ์ทำรายการนี้" });
  });

  it("takes any signed-in user when no page is named", async () => {
    getCurrentUser.mockResolvedValue({ ...head, roles: ["QC_INSPECTOR"] });
    expect(await guardApi(post())).toHaveProperty("user");
  });
});
