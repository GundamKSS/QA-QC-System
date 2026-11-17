import "server-only";
import { createAttemptTracker, type AttemptOutcome, type AttemptTracker } from "./attempts";
import { normalizeEmployeeCode } from "./employee-code";
import { mockUsers } from "./mock-users";
import { hashPassword, verifyPassword } from "./password";
import type { SessionUser, UserRecord } from "./types";

/** The real account behind the typed code, for the audit trail only (never sent to the client). */
export type MatchedAccount = { id: string; employeeCode: string } | null;

export type AuthResult =
  | { kind: "success"; user: SessionUser; unknownRoles?: string[] }
  | { kind: "invalid"; attemptsLeft: number; account: MatchedAccount }
  | { kind: "locked"; lockedUntil: number; justLocked: boolean; account: MatchedAccount }
  /** Field user's PIN is locked until an Admin / QC Head unlocks it (DEC-12). */
  | { kind: "pinLocked"; justLocked: boolean; account: MatchedAccount }
  | { kind: "busy"; account: MatchedAccount }
  | { kind: "disabled"; account: MatchedAccount }
  | { kind: "forbidden"; reason: string; account: MatchedAccount; unknownRoles?: string[] }
  | { kind: "unavailable"; message: string; account: MatchedAccount };

type Store = { users: Promise<UserRecord[]>; dummyHash: Promise<string>; attempts: AttemptTracker };

// Survive dev hot reloads so lockouts don't reset on every edit.
const globalStore = globalThis as typeof globalThis & { __qcheckMockAuth?: Store };

/** Seeded demo users: always in dev/test, in production only with QCHECK_MOCK_AUTH=on. */
export function mockAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.QCHECK_MOCK_AUTH === "on";
}

function store(): Store {
  if (!mockAuthEnabled()) {
    throw new Error("Mock auth is disabled in production. Set QCHECK_MOCK_AUTH=on only for demos.");
  }
  globalStore.__qcheckMockAuth ??= {
    users: Promise.all(
      mockUsers.map(async ({ password, ...seed }) => ({
        ...seed,
        passwordHash: await hashPassword(password),
      })),
    ),
    dummyHash: hashPassword("qcheck-dummy-password"),
    attempts: createAttemptTracker(),
  };
  return globalStore.__qcheckMockAuth;
}

/** Tests only: forget seeded hashes and lockouts so each test starts clean. */
export function resetMockAuthForTests() {
  delete globalStore.__qcheckMockAuth;
}

export function toSessionUser(user: UserRecord): SessionUser {
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    fullName: user.fullName,
    roles: user.roles,
    mustChangePassword: user.mustChangePassword,
  };
}

export async function findUserById(id: string): Promise<UserRecord | undefined> {
  return (await store().users).find((user) => user.id === id);
}

export async function authenticate(employeeCodeInput: string, password: string): Promise<AuthResult> {
  const { users, dummyHash, attempts } = store();
  const employeeCode = normalizeEmployeeCode(employeeCodeInput);

  // Reserve the attempt before the first await (see createAttemptTracker).
  const ticket = attempts.begin(employeeCode);
  try {
    const user = (await users).find((candidate) => candidate.employeeCode === employeeCode);
    const account: MatchedAccount = user ? { id: user.id, employeeCode: user.employeeCode } : null;

    if (ticket.kind === "locked") return { kind: "locked", lockedUntil: ticket.lockedUntil, justLocked: false, account };
    if (ticket.kind === "busy") return { kind: "busy", account };

    // Always run scrypt so response time doesn't reveal whether the code exists.
    const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    const outcome: AttemptOutcome = ticket.settle(user !== undefined && passwordOk);

    if (outcome.kind === "locked") return { ...outcome, account };
    if (outcome.kind === "invalid") return { ...outcome, account };
    if (!user) throw new Error("Unreachable: an unknown code can't pass the password check");
    if (!user.isActive) return { kind: "disabled", account };
    return { kind: "success", user: toSessionUser(user) };
  } finally {
    if (ticket.kind === "started") ticket.release();
  }
}
