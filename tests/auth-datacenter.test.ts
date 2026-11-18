import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  })),
}));

import { authenticate } from "@/lib/auth/authenticate";
import { POST as login } from "@/app/api/auth/login/route";
import { MOCK_PASSWORD, mockUsers } from "@/lib/auth/mock-users";
import {
  authenticateWithDatacenter,
  checkProgramPermission,
  getDatacenterAuthUrl,
} from "@/lib/auth/datacenter-adapter";
import { getCurrentUser } from "@/lib/auth/dal";
import { createSession, readSession } from "@/lib/auth/session";
import type { DatacenterAuthResponse, DatacenterProgram } from "@/lib/auth/types";

beforeEach(() => {
  vi.stubEnv("QCHECK_AUTH", "central");
  vi.stubEnv("QCHECK_ALLOW_DEV_ROLE", "off");
});
afterEach(() => vi.unstubAllEnvs());

// User request sample JSON
const SAMPLE_USER_JSON: DatacenterAuthResponse = {
  access_token: "TRW_TOKEN_2026",
  display_name: "dev gundam",
  employee_no: "dev",
  email: "siwakorn.kh@tirawatgroup.com",
  role: "dev",
  programs: [
    {
      program_id: 1,
      program_code: "PRG001",
      program_name: "Auto-reconcile Bank",
      url: "http://192.168.0.248:8080",
      role_prog: "dev",
      can_use: true,
      is_active: true,
      granted_at: "2026-08-26T10:21:22.140000",
    },
    {
      program_id: 2,
      program_code: "PRG002",
      program_name: "Logbook tracking system",
      url: "http://192.168.0.248:8081",
      role_prog: "dev",
      can_use: true,
      is_active: true,
      granted_at: "2026-08-26T10:21:22.140000",
    },
  ],
};

const SAMPLE_PROGRAM_003: DatacenterProgram = {
  program_id: 3,
  program_code: "PRG003",
  program_name: "QCheck",
  url: "http://localhost:3000",
  role_prog: "qc_inspector",
  can_use: true,
  is_active: true,
  granted_at: "2026-10-19T10:00:00.000000",
};

describe("checkProgramPermission", () => {
  it("rejects when programs array is empty or undefined", () => {
    expect(checkProgramPermission([], "PRG003")).toMatchObject({
      allowed: false,
      reason: "not_granted",
    });
    expect(checkProgramPermission(undefined, "PRG003")).toMatchObject({
      allowed: false,
      reason: "not_granted",
    });
  });

  it("rejects when user has PRG001 and PRG002 but lacks PRG003 (user request sample)", () => {
    const result = checkProgramPermission(SAMPLE_USER_JSON.programs, "PRG003");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("not_granted");
      expect(result.message).toContain("PRG003");
    }
  });

  it("rejects when PRG003 is present but can_use is false", () => {
    const programs: DatacenterProgram[] = [
      { ...SAMPLE_PROGRAM_003, can_use: false },
    ];
    const result = checkProgramPermission(programs, "PRG003");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("cannot_use");
      expect(result.message).toContain("ถูกระงับ");
    }
  });

  it("rejects when PRG003 is present but is_active is false", () => {
    const programs: DatacenterProgram[] = [
      { ...SAMPLE_PROGRAM_003, is_active: false },
    ];
    const result = checkProgramPermission(programs, "PRG003");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("inactive");
      expect(result.message).toContain("ปิดการใช้งาน");
    }
  });

  it("allows when PRG003 is present and both can_use and is_active are true", () => {
    const programs: DatacenterProgram[] = [
      ...SAMPLE_USER_JSON.programs,
      SAMPLE_PROGRAM_003,
    ];
    const result = checkProgramPermission(programs, "PRG003");
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.program.program_code).toBe("PRG003");
      expect(result.program.role_prog).toBe("qc_inspector");
    }
  });

  it("performs case-insensitive comparison for program code", () => {
    const programs: DatacenterProgram[] = [SAMPLE_PROGRAM_003];
    expect(checkProgramPermission(programs, "prg003").allowed).toBe(true);
  });
});

describe("getDatacenterAuthUrl", () => {
  it("resolves the endpoint URL from config and env", () => {
    const url = getDatacenterAuthUrl();
    expect(url).toBe("http://192.168.0.248:8000/auth/auth_permission_prog");
  });
});

describe("authenticateWithDatacenter", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns forbidden when user authenticates but lacks PRG003", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => SAMPLE_USER_JSON,
    } as unknown as Response);

    const result = await authenticateWithDatacenter("dev", "mypassword", "PRG003");
    expect(result.kind).toBe("forbidden");
    if (result.kind === "forbidden") {
      expect(result.reason).toContain("PRG003");
      expect(result.account.employeeCode).toBe("dev");
    }
  });

  it("returns success when user authenticates and has PRG003", async () => {
    const grantedData: DatacenterAuthResponse = {
      ...SAMPLE_USER_JSON,
      programs: [...SAMPLE_USER_JSON.programs, SAMPLE_PROGRAM_003],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => grantedData,
    } as unknown as Response);

    const result = await authenticateWithDatacenter("dev", "mypassword", "PRG003");
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.user.employeeCode).toBe("dev");
      expect(result.user.fullName).toBe("dev gundam");
      expect(result.user.email).toBe("siwakorn.kh@tirawatgroup.com");
      // The central token must never ride along to the session or the browser.
      expect(result.user).not.toHaveProperty("accessToken");
      expect(JSON.stringify(result.user)).not.toContain("TRW_TOKEN_2026");
      expect(result.user.roles).toContain("QC_INSPECTOR");
    }
  });

  it("returns invalid on HTTP 401", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Invalid credentials" }),
    } as unknown as Response);

    const result = await authenticateWithDatacenter("dev", "wrong-password", "PRG003");
    expect(result.kind).toBe("invalid");
  });

  it("returns disabled on HTTP 403", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ detail: "Account disabled" }),
    } as unknown as Response);

    const result = await authenticateWithDatacenter("dev", "password", "PRG003");
    expect(result.kind).toBe("disabled");
  });
});

describe("unified authenticate service", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("rejects with forbidden when user lacks permission for PRG003", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => SAMPLE_USER_JSON,
    } as unknown as Response);

    const result = await authenticate("dev", "correct-password");
    expect(result.kind).toBe("forbidden");
    if (result.kind === "forbidden") {
      expect(result.reason).toContain("PRG003");
    }
  });

  it("logs in successfully when user has PRG003 permission", async () => {
    const grantedData: DatacenterAuthResponse = {
      ...SAMPLE_USER_JSON,
      programs: [...SAMPLE_USER_JSON.programs, SAMPLE_PROGRAM_003],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => grantedData,
    } as unknown as Response);

    const result = await authenticate("dev", "correct-password");
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.user.fullName).toBe("dev gundam");
      expect(result.user.employeeCode).toBe("dev");
      expect(result.user.roles).toContain("QC_INSPECTOR");
    }
  });
});

describe("session & DAL round trip for Datacenter user", () => {
  beforeEach(() => {
    cookieStore.clear();
    process.env.SESSION_SECRET = "ianaW5lojvpJ-ewFY229wTaUgSXZ1FoPu8JyugNNXm0";
  });

  it("stores and decrypts name and roles, without the central access token", async () => {
    const mockUser = {
      id: "dev",
      employeeCode: "dev",
      fullName: "dev gundam",
      email: "siwakorn.kh@tirawatgroup.com",
      roles: ["QC_INSPECTOR", "SOMETHING_ELSE"],
      mustChangePassword: false,
    };

    await createSession(mockUser);
    const read = await readSession();
    expect(read).not.toBeNull();
    expect(read?.employeeCode).toBe("dev");
    expect(read?.fullName).toBe("dev gundam");
    expect(read?.email).toBe("siwakorn.kh@tirawatgroup.com");
    expect(read).not.toHaveProperty("accessToken");

    const currentUser = await getCurrentUser();
    expect(currentUser).not.toBeNull();
    expect(currentUser?.fullName).toBe("dev gundam");
    expect(currentUser?.employeeCode).toBe("dev");
    // Unknown codes are dropped again when the cookie is read back.
    expect(currentUser?.roles).toEqual(["QC_INSPECTOR"]);
  });
});

function respondWith(program: Partial<DatacenterProgram>) {
  const data: DatacenterAuthResponse = {
    ...SAMPLE_USER_JSON,
    programs: [...SAMPLE_USER_JSON.programs, { ...SAMPLE_PROGRAM_003, ...program }],
  };
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => data } as unknown as Response);
}

describe("role_prog mapping (FR-AUTH-04)", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("reads several roles from a comma-separated string", async () => {
    respondWith({ role_prog: " qa_head, QA_INSPECTOR ,master_admin" });
    const result = await authenticateWithDatacenter("dev", "pw", "PRG003");
    expect(result.kind === "success" && result.user.roles).toEqual(["MASTER_ADMIN", "QA_HEAD", "QA_INSPECTOR"]);
  });

  it("reads several roles from an array and drops unknown codes", async () => {
    respondWith({ role_prog: ["QC_HEAD", "SUPERUSER", "QC_INSPECTOR"] });
    const result = await authenticateWithDatacenter("dev", "pw", "PRG003");
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.user.roles).toEqual(["QC_HEAD", "QC_INSPECTOR"]);
      expect(result.unknownRoles).toEqual(["SUPERUSER"]);
    }
  });

  it("ignores the top-level role and refuses when PRG003 has no known role", async () => {
    respondWith({ role_prog: "superuser" });
    const result = await authenticateWithDatacenter("dev", "pw", "PRG003");
    expect(result.kind).toBe("forbidden");
    if (result.kind === "forbidden") expect(result.unknownRoles).toEqual(["SUPERUSER"]);
  });

  it("grants every role for dev when QCHECK_ALLOW_DEV_ROLE=on (including in production)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("QCHECK_ALLOW_DEV_ROLE", "on");
    respondWith({ role_prog: "dev" });
    const result = await authenticateWithDatacenter("dev", "pw", "PRG003");
    expect(result.kind === "success" && result.user.roles).toHaveLength(9);
  });

  it("refuses dev in production when QCHECK_ALLOW_DEV_ROLE is off", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("QCHECK_ALLOW_DEV_ROLE", "off");
    respondWith({ role_prog: "dev" });
    const result = await authenticateWithDatacenter("dev", "pw", "PRG003");
    expect(result.kind).toBe("forbidden");
  });
});

describe("central authentication boundaries", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("does not implicitly grant the development role", async () => {
    respondWith({ role_prog: "dev" });
    expect((await authenticateWithDatacenter("fixture", "fixture-password")).kind).toBe("forbidden");
  });

  it.each([{ can_use: "false" }, { is_active: 1 }])("rejects malformed permission flags: %j", async (flags) => {
    respondWith(flags as unknown as Partial<DatacenterProgram>);
    expect((await authenticateWithDatacenter("fixture", "fixture-password")).kind).toBe("error");
  });

  it("rejects malformed program entries instead of granting permission", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ employee_no: "fixture", programs: [null] }) });
    expect((await authenticateWithDatacenter("fixture", "fixture-password")).kind).toBe("error");
  });

  it("never falls back to demo credentials while central authentication is selected", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("fixture outage"));
    expect((await authenticate(mockUsers[0].employeeCode, MOCK_PASSWORD)).kind).toBe("unavailable");
  });

  it("uses demo authentication without sending its credentials to the company API", async () => {
    vi.stubEnv("QCHECK_AUTH", "mock");
    globalThis.fetch = vi.fn();
    expect((await authenticate(mockUsers[0].employeeCode, MOCK_PASSWORD)).kind).toBe("success");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("keeps an unverified username out of the audit account", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const result = await authenticate("unknown-fixture-user", "fixture-password");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.account).toBeNull();
  });

  it("preserves username case through the login route while trimming surrounding spaces", async () => {
    process.env.SESSION_SECRET = "ianaW5lojvpJ-ewFY229wTaUgSXZ1FoPu8JyugNNXm0";
    respondWith({ role_prog: ["QC_INSPECTOR"] });
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ employeeCode: "  FixtureUser  ", password: "fixture-password" }),
    });
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const response = await login(request);
      const result = await response.json();
      expect(response.status).toBe(200);
      expect(result.status).toBe("success");
      expect(result.employeeCode).toBe("FixtureUser");
      expect(JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body as string).username).toBe("FixtureUser");
    } finally { log.mockRestore(); }
  });
});

describe("central system outages (FR-AUTH-08)", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("reports a network failure as an error, not invalid", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    expect((await authenticateWithDatacenter("dev", "pw", "PRG003")).kind).toBe("error");
  });

  it("reports a 5xx as an error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => "" } as unknown as Response);
    expect((await authenticateWithDatacenter("dev", "pw", "PRG003")).kind).toBe("error");
  });

  it("reports a 200 with an unexpected body as an error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: 1 }) } as unknown as Response);
    expect((await authenticateWithDatacenter("dev", "pw", "PRG003")).kind).toBe("error");
  });

  it("returns unavailable and never counts it toward the lockout", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    for (let i = 0; i < 6; i++) {
      expect((await authenticate("outage-user", "pw")).kind).toBe("unavailable");
    }
  });
});
