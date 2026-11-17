import type { Role } from "./types";

/** A field (LOCAL) user as the login path needs it (DEC-12, docs/12). */
export type LocalUser = {
  id: string;
  employeeCode: string;
  fullName: string;
  roles: Role[];
  pinHash: string;
  isActive: boolean;
  /** Persisted lock after too many wrong PINs — only an Admin / QC Head clears it. */
  pinLocked: boolean;
  /** A temporary PIN was issued: the user must choose their own before using the app. */
  mustChangePin: boolean;
};

/** What the Admin screen shows: the master-data columns from docs/03 §3.0 plus profile fields. */
export type LocalUserDetail = Omit<LocalUser, "pinHash"> & {
  hasPin: boolean;
  nickname: string | null;
  email: string | null;
  department: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LocalUserProfile = { fullName: string; nickname: string | null; email: string | null; department: string | null };

/** Where LOCAL users live. SQL Server in production, memory in tests and DB-less dev. */
export interface LocalUserStore {
  findByCode(employeeCode: string): Promise<LocalUser | null>;
  findById(id: string): Promise<LocalUser | null>;
  /** Persist the lock so it survives a restart. */
  lockPin(userId: string): Promise<void>;
  /** Best effort: remember the last successful login. */
  touchLogin(userId: string): Promise<void>;

  list(): Promise<LocalUserDetail[]>;
  /** Admin view, including profiles that have not been issued a PIN yet. */
  findDetailById(id: string): Promise<LocalUserDetail | null>;
  /** Creates the user with the next free code (F0001, F0002, …). */
  create(input: LocalUserProfile & { roles: Role[]; pinHash: string; mustChangePin: boolean; createdBy: string }): Promise<LocalUserDetail>;
  updateProfile(id: string, profile: LocalUserProfile, by: string): Promise<void>;
  setRoles(id: string, roles: Role[], by: string): Promise<void>;
  /** New PIN hash; clears any lock. */
  setPin(id: string, pinHash: string, options: { mustChange: boolean; by: string }): Promise<void>;
  unlockPin(id: string, by: string): Promise<void>;
  setActive(id: string, active: boolean, by: string): Promise<void>;
}

type Stored = LocalUser & Omit<LocalUserDetail, keyof LocalUser | "hasPin"> & { createdBy: string | null; updatedBy: string | null };

/** In-memory store: used by tests and when no database is configured. */
export function createMemoryLocalStore(seed: Array<Partial<Stored> & Pick<LocalUser, "id" | "employeeCode" | "fullName" | "roles" | "pinHash" | "isActive" | "pinLocked">> = []): LocalUserStore & { add(user: (typeof seed)[number]): void } {
  const users = new Map<string, Stored>();
  const now = () => new Date();
  const fill = (user: (typeof seed)[number]): Stored => ({
    mustChangePin: false,
    nickname: null,
    email: null,
    department: null,
    lastLoginAt: null,
    createdAt: now(),
    updatedAt: now(),
    createdBy: null,
    updatedBy: null,
    ...user,
  });
  for (const user of seed) users.set(user.id, fill(user));
  const toLogin = ({ id, employeeCode, fullName, roles, pinHash, isActive, pinLocked, mustChangePin }: Stored): LocalUser | null =>
    pinHash ? { id, employeeCode, fullName, roles: [...roles], pinHash, isActive, pinLocked, mustChangePin } : null;
  const toDetail = (user: Stored): LocalUserDetail => ({
    id: user.id,
    employeeCode: user.employeeCode,
    fullName: user.fullName,
    nickname: user.nickname,
    email: user.email,
    department: user.department,
    roles: [...user.roles],
    isActive: user.isActive,
    pinLocked: user.pinLocked,
    mustChangePin: user.mustChangePin,
    hasPin: Boolean(user.pinHash),
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
  const touch = (user: Stored, by: string | null) => {
    user.updatedAt = now();
    user.updatedBy = by;
  };
  const get = (id: string) => {
    const user = users.get(id);
    if (!user) throw new Error(`No such local user: ${id}`);
    return user;
  };
  return {
    add: (user) => void users.set(user.id, fill(user)),
    findByCode: async (code) => {
      const wanted = code.trim().toUpperCase();
      const found = [...users.values()].find((user) => user.employeeCode.toUpperCase() === wanted);
      return found ? toLogin(found) : null;
    },
    findById: async (id) => (users.has(id) ? toLogin(users.get(id)!) : null),
    lockPin: async (id) => {
      const user = users.get(id);
      if (user) user.pinLocked = true;
    },
    touchLogin: async (id) => {
      const user = users.get(id);
      if (user) user.lastLoginAt = now();
    },
    list: async () => [...users.values()].sort((a, b) => a.employeeCode.localeCompare(b.employeeCode)).map(toDetail),
    findDetailById: async (id) => (users.has(id) ? toDetail(users.get(id)!) : null),
    create: async (input) => {
      const highest = Math.max(0, ...[...users.values()].map((user) => Number(/^F(\d+)$/.exec(user.employeeCode)?.[1] ?? 0)));
      const code = `F${String(highest + 1).padStart(4, "0")}`;
      const user = fill({
        id: String(Math.max(0, ...[...users.keys()].map(Number)) + 1),
        employeeCode: code,
        fullName: input.fullName,
        nickname: input.nickname,
        email: input.email,
        department: input.department,
        roles: input.roles,
        pinHash: input.pinHash,
        isActive: true,
        pinLocked: false,
        mustChangePin: input.mustChangePin,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      });
      users.set(user.id, user);
      return toDetail(user);
    },
    updateProfile: async (id, profile, by) => {
      const user = get(id);
      Object.assign(user, profile);
      touch(user, by);
    },
    setRoles: async (id, roles, by) => {
      const user = get(id);
      user.roles = [...roles];
      touch(user, by);
    },
    setPin: async (id, pinHash, { mustChange, by }) => {
      const user = get(id);
      user.pinHash = pinHash;
      user.mustChangePin = mustChange;
      user.pinLocked = false;
      touch(user, by);
    },
    unlockPin: async (id, by) => {
      const user = get(id);
      user.pinLocked = false;
      touch(user, by);
    },
    setActive: async (id, active, by) => {
      const user = get(id);
      user.isActive = active;
      touch(user, by);
    },
  };
}
