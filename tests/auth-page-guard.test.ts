import { beforeEach, describe, expect, it, vi } from "vitest";

const { readSession } = vi.hoisted(() => ({ readSession: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ readSession }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));

import { requirePageAccess } from "@/lib/auth/dal";

beforeEach(() => {
  readSession.mockReset();
  readSession.mockResolvedValue({ id: "fixture-qc", employeeCode: "TEST004", fullName: "Test QC", roles: ["QC_INSPECTOR"] });
});

describe("server page guard", () => {
  it("rejects a direct protected-page request despite being signed in", async () => {
    await expect(requirePageAccess("settings", "/settings")).rejects.toThrow("NOT_FOUND");
    await expect(requirePageAccess("qa-queue", "/qa-queue")).rejects.toThrow("NOT_FOUND");
    await expect(requirePageAccess("plans", "/plans")).rejects.toThrow("NOT_FOUND");
  });

  it("allows permitted data loaders", async () => {
    await expect(requirePageAccess("jobs", "/jobs")).resolves.toMatchObject({ employeeCode: "TEST004" });
    await expect(requirePageAccess("home", "/home")).resolves.toMatchObject({ roles: ["QC_INSPECTOR"] });
  });

  it("redirects unsigned requests to login before granting access", async () => {
    readSession.mockResolvedValue(null);
    await expect(requirePageAccess("home", "/home")).rejects.toThrow("REDIRECT:/login?next=%2Fhome");
  });

  it("rejects sessions without a recognized role", async () => {
    readSession.mockResolvedValue({ id: "fixture", employeeCode: "fixture", fullName: "Fixture", roles: ["SUPERUSER"] });
    await expect(requirePageAccess("home", "/home")).rejects.toThrow("REDIRECT:/login?next=%2Fhome");
  });
});
