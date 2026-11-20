import "server-only";
import { createHash, randomBytes } from "node:crypto";
import sql from "mssql";
import { cookies, headers } from "next/headers";
import { authPolicy } from "@/lib/config/auth";
import { dbConfigured } from "@/lib/db/config";
import { getPool } from "@/lib/db/pool";
import type {
  ActiveDevicePolicy,
  DeviceRecord,
  DevicesPayload,
  RegisterDeviceInput,
  UpdateDeviceInput,
} from "./device-validation";
import type { DeviceKind } from "./idle";

const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const DEFAULT_PERSONAL_POLICY: ActiveDevicePolicy = {
  deviceId: null,
  deviceCode: null,
  deviceName: null,
  location: null,
  kind: "personal",
  idleMinutes: null,
  warnSeconds: 0,
};

type MemoryDeviceRow = Omit<DeviceRecord, "isCurrentDevice"> & { tokenHash: string };

const globalDevices = globalThis as typeof globalThis & {
  __qcheckDevices?: { nextId: number; rows: MemoryDeviceRow[] };
};

function memoryStore() {
  if (!globalDevices.__qcheckDevices) {
    globalDevices.__qcheckDevices = { nextId: 1, rows: [] };
  }
  return globalDevices.__qcheckDevices;
}

function hashToken(raw: string): string {
  return createHash("sha256").update(`qcheck-device:${raw}`).digest("hex");
}

function isMissingDevicesTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { number?: unknown; message?: unknown };
  if (err.number === 208) return true;
  return typeof err.message === "string" && err.message.includes("dbo.devices");
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { number?: unknown };
  return err.number === 2627 || err.number === 2601;
}

export class DeviceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceConflictError";
  }
}

export class DeviceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceNotFoundError";
  }
}

async function readCurrentTokenHash(): Promise<string | null> {
  try {
    const raw = (await cookies()).get(authPolicy.deviceCookie)?.value;
    if (!raw || raw.length < 16 || raw.length > 128) return null;
    return hashToken(raw);
  } catch {
    return null;
  }
}

async function writeDeviceCookie(rawToken: string) {
  const reqHeaders = await headers();
  const forwardedProto = reqHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const origin = reqHeaders.get("origin");
  const isHttps = forwardedProto === "https" || origin?.startsWith("https://") === true;

  (await cookies()).set(authPolicy.deviceCookie, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });
}

export async function clearDeviceCookie() {
  (await cookies()).delete(authPolicy.deviceCookie);
}

function toPolicy(row: {
  id: string;
  deviceCode: string;
  deviceName: string;
  location: string | null;
  deviceKind: DeviceKind;
  idleMinutes: number;
  isActive: boolean;
}): ActiveDevicePolicy {
  if (!row.isActive || row.deviceKind !== "shared") {
    return {
      deviceId: row.id,
      deviceCode: row.deviceCode,
      deviceName: row.deviceName,
      location: row.location,
      kind: "personal",
      idleMinutes: null,
      warnSeconds: 0,
    };
  }
  return {
    deviceId: row.id,
    deviceCode: row.deviceCode,
    deviceName: row.deviceName,
    location: row.location,
    kind: "shared",
    idleMinutes: row.idleMinutes,
    warnSeconds: authPolicy.devices.shared.warnSeconds,
  };
}

/** Resolves the active device policy for this browser from its HttpOnly `qcheck_device` cookie. */
export async function getCurrentDevicePolicy(): Promise<ActiveDevicePolicy> {
  const tokenHash = await readCurrentTokenHash();
  if (!tokenHash) return DEFAULT_PERSONAL_POLICY;

  if (!dbConfigured()) {
    const found = memoryStore().rows.find((r) => r.tokenHash === tokenHash && r.isActive);
    return found ? toPolicy(found) : DEFAULT_PERSONAL_POLICY;
  }

  try {
    const pool = await getPool();
    const res = await pool
      .request()
      .input("tokenHash", sql.Char(64), tokenHash)
      .query<{
        id: number | string;
        device_code: string;
        device_name: string;
        location: string | null;
        device_kind: string;
        idle_minutes: number;
        is_active: boolean;
      }>(`
        SELECT TOP (1)
          id, device_code, device_name, location, device_kind, idle_minutes, is_active
        FROM dbo.devices
        WHERE token_hash = @tokenHash
          AND is_active = 1
      `);
    const row = res.recordset[0];
    if (!row) return DEFAULT_PERSONAL_POLICY;

    // Best-effort heartbeat update (never fail page load if update races)
    pool
      .request()
      .input("id", sql.BigInt, String(row.id))
      .query(`UPDATE dbo.devices SET last_seen_at = SYSUTCDATETIME() WHERE id = @id`)
      .catch(() => undefined);

    return toPolicy({
      id: String(row.id),
      deviceCode: row.device_code,
      deviceName: row.device_name,
      location: row.location,
      deviceKind: row.device_kind === "shared" ? "shared" : "personal",
      idleMinutes: Number(row.idle_minutes) || 30,
      isActive: Boolean(row.is_active),
    });
  } catch (error) {
    if (isMissingDevicesTable(error)) return DEFAULT_PERSONAL_POLICY;
    return DEFAULT_PERSONAL_POLICY;
  }
}

/** Lists all registered devices and identifies whether this browser is currently bound to one. */
export async function listDevices(): Promise<DevicesPayload> {
  const tokenHash = await readCurrentTokenHash();

  if (!dbConfigured()) {
    const store = memoryStore();
    const devices: DeviceRecord[] = store.rows
      .slice()
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.deviceCode.localeCompare(b.deviceCode))
      .map((row) => ({
        id: row.id,
        deviceCode: row.deviceCode,
        deviceName: row.deviceName,
        location: row.location,
        deviceKind: row.deviceKind,
        idleMinutes: row.idleMinutes,
        isActive: row.isActive,
        lastSeenAt: row.lastSeenAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        isCurrentDevice: tokenHash !== null && row.tokenHash === tokenHash,
      }));
    const current = store.rows.find((r) => tokenHash !== null && r.tokenHash === tokenHash && r.isActive);
    return {
      currentDevice: current ? toPolicy(current) : DEFAULT_PERSONAL_POLICY,
      devices,
      dbAvailable: true,
    };
  }

  try {
    const pool = await getPool();
    const res = await pool.request().query<{
      id: number | string;
      device_code: string;
      device_name: string;
      location: string | null;
      device_kind: string;
      idle_minutes: number;
      token_hash: string;
      last_seen_at: Date | null;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    }>(`
      SELECT
        id, device_code, device_name, location, device_kind, idle_minutes,
        token_hash, last_seen_at, is_active, created_at, updated_at
      FROM dbo.devices
      ORDER BY is_active DESC, device_code ASC
    `);

    let currentDevice: ActiveDevicePolicy = DEFAULT_PERSONAL_POLICY;
    const devices: DeviceRecord[] = res.recordset.map((row) => {
      const isCurrent = tokenHash !== null && row.token_hash.trim() === tokenHash;
      const mapped: DeviceRecord = {
        id: String(row.id),
        deviceCode: row.device_code,
        deviceName: row.device_name,
        location: row.location,
        deviceKind: row.device_kind === "shared" ? "shared" : "personal",
        idleMinutes: Number(row.idle_minutes) || 30,
        isActive: Boolean(row.is_active),
        lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        isCurrentDevice: isCurrent,
      };
      if (isCurrent && mapped.isActive) {
        currentDevice = toPolicy(mapped);
      }
      return mapped;
    });

    return { currentDevice, devices, dbAvailable: true };
  } catch (error) {
    if (isMissingDevicesTable(error)) {
      return { currentDevice: DEFAULT_PERSONAL_POLICY, devices: [], dbAvailable: false };
    }
    throw error;
  }
}

/** Registers a new device and binds the current browser to it via an HttpOnly token cookie. */
export async function registerAndBindDevice(
  input: RegisterDeviceInput,
  actorId: string | null,
): Promise<DeviceRecord> {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const nowIso = new Date().toISOString();

  if (!dbConfigured()) {
    const store = memoryStore();
    if (store.rows.some((r) => r.deviceCode.toLowerCase() === input.deviceCode.toLowerCase())) {
      throw new DeviceConflictError(`รหัสอุปกรณ์ ${input.deviceCode} มีอยู่ในระบบแล้ว`);
    }
    const row: MemoryDeviceRow = {
      id: String(store.nextId++),
      deviceCode: input.deviceCode,
      deviceName: input.deviceName,
      location: input.location,
      deviceKind: input.deviceKind,
      idleMinutes: input.idleMinutes,
      isActive: true,
      lastSeenAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      tokenHash,
    };
    store.rows.push(row);
    await writeDeviceCookie(rawToken);
    return {
      id: row.id,
      deviceCode: row.deviceCode,
      deviceName: row.deviceName,
      location: row.location,
      deviceKind: row.deviceKind,
      idleMinutes: row.idleMinutes,
      isActive: row.isActive,
      lastSeenAt: row.lastSeenAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isCurrentDevice: true,
    };
  }

  try {
    const pool = await getPool();
    const actorBigInt = actorId && /^\d+$/.test(actorId) ? actorId : null;
    const res = await pool
      .request()
      .input("code", sql.NVarChar(40), input.deviceCode)
      .input("name", sql.NVarChar(120), input.deviceName)
      .input("location", sql.NVarChar(120), input.location)
      .input("kind", sql.VarChar(16), input.deviceKind)
      .input("idle", sql.Int, input.idleMinutes)
      .input("tokenHash", sql.Char(64), tokenHash)
      .input("actorId", sql.BigInt, actorBigInt)
      .query<{
        id: number | string;
        device_code: string;
        device_name: string;
        location: string | null;
        device_kind: string;
        idle_minutes: number;
        last_seen_at: Date | null;
        is_active: boolean;
        created_at: Date;
        updated_at: Date;
      }>(`
        INSERT INTO dbo.devices (
          device_code, device_name, location, device_kind, idle_minutes,
          token_hash, last_seen_at, is_active, created_at, created_by, updated_at, updated_by
        )
        OUTPUT
          INSERTED.id, INSERTED.device_code, INSERTED.device_name, INSERTED.location,
          INSERTED.device_kind, INSERTED.idle_minutes, INSERTED.last_seen_at,
          INSERTED.is_active, INSERTED.created_at, INSERTED.updated_at
        VALUES (
          @code, @name, @location, @kind, @idle,
          @tokenHash, SYSUTCDATETIME(), 1, SYSUTCDATETIME(), @actorId, SYSUTCDATETIME(), @actorId
        )
      `);

    const row = res.recordset[0];
    await writeDeviceCookie(rawToken);
    return {
      id: String(row.id),
      deviceCode: row.device_code,
      deviceName: row.device_name,
      location: row.location,
      deviceKind: row.device_kind === "shared" ? "shared" : "personal",
      idleMinutes: Number(row.idle_minutes) || 30,
      isActive: Boolean(row.is_active),
      lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      isCurrentDevice: true,
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DeviceConflictError(`รหัสอุปกรณ์ ${input.deviceCode} มีอยู่ในระบบแล้ว`);
    }
    throw error;
  }
}

/** Updates an existing registered device (name, location, kind, idle timeout, or active status). */
export async function updateDevice(
  deviceId: string,
  patch: UpdateDeviceInput,
  actorId: string | null,
): Promise<{ before: DeviceRecord; after: DeviceRecord }> {
  if (!/^\d+$/.test(deviceId)) {
    throw new DeviceNotFoundError("ไม่พบอุปกรณ์ที่ระบุ");
  }
  const tokenHash = await readCurrentTokenHash();

  if (!dbConfigured()) {
    const store = memoryStore();
    const row = store.rows.find((r) => r.id === deviceId);
    if (!row) throw new DeviceNotFoundError("ไม่พบอุปกรณ์ที่ระบุ");
    const isCurrent = tokenHash !== null && row.tokenHash === tokenHash;
    const before: DeviceRecord = {
      id: row.id,
      deviceCode: row.deviceCode,
      deviceName: row.deviceName,
      location: row.location,
      deviceKind: row.deviceKind,
      idleMinutes: row.idleMinutes,
      isActive: row.isActive,
      lastSeenAt: row.lastSeenAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isCurrentDevice: isCurrent,
    };
    if (patch.deviceName !== undefined) row.deviceName = patch.deviceName;
    if (patch.location !== undefined) row.location = patch.location;
    if (patch.deviceKind !== undefined) row.deviceKind = patch.deviceKind;
    if (patch.idleMinutes !== undefined) row.idleMinutes = patch.idleMinutes;
    if (patch.isActive !== undefined) row.isActive = patch.isActive;
    row.updatedAt = new Date().toISOString();

    const after: DeviceRecord = {
      ...before,
      deviceName: row.deviceName,
      location: row.location,
      deviceKind: row.deviceKind,
      idleMinutes: row.idleMinutes,
      isActive: row.isActive,
      updatedAt: row.updatedAt,
    };
    return { before, after };
  }

  const pool = await getPool();
  const existingRes = await pool
    .request()
    .input("id", sql.BigInt, deviceId)
    .query<{
      id: number | string;
      device_code: string;
      device_name: string;
      location: string | null;
      device_kind: string;
      idle_minutes: number;
      token_hash: string;
      last_seen_at: Date | null;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    }>(`
      SELECT id, device_code, device_name, location, device_kind, idle_minutes,
             token_hash, last_seen_at, is_active, created_at, updated_at
      FROM dbo.devices
      WHERE id = @id
    `);

  const cur = existingRes.recordset[0];
  if (!cur) throw new DeviceNotFoundError("ไม่พบอุปกรณ์ที่ระบุ");
  const isCurrent = tokenHash !== null && cur.token_hash.trim() === tokenHash;

  const before: DeviceRecord = {
    id: String(cur.id),
    deviceCode: cur.device_code,
    deviceName: cur.device_name,
    location: cur.location,
    deviceKind: cur.device_kind === "shared" ? "shared" : "personal",
    idleMinutes: Number(cur.idle_minutes) || 30,
    isActive: Boolean(cur.is_active),
    lastSeenAt: cur.last_seen_at ? new Date(cur.last_seen_at).toISOString() : null,
    createdAt: new Date(cur.created_at).toISOString(),
    updatedAt: new Date(cur.updated_at).toISOString(),
    isCurrentDevice: isCurrent,
  };

  const nextName = patch.deviceName ?? before.deviceName;
  const nextLocation = patch.location !== undefined ? patch.location : before.location;
  const nextKind = patch.deviceKind ?? before.deviceKind;
  const nextIdle = patch.idleMinutes ?? before.idleMinutes;
  const nextActive = patch.isActive ?? before.isActive;
  const actorBigInt = actorId && /^\d+$/.test(actorId) ? actorId : null;

  const updRes = await pool
    .request()
    .input("id", sql.BigInt, deviceId)
    .input("name", sql.NVarChar(120), nextName)
    .input("location", sql.NVarChar(120), nextLocation)
    .input("kind", sql.VarChar(16), nextKind)
    .input("idle", sql.Int, nextIdle)
    .input("active", sql.Bit, nextActive)
    .input("actorId", sql.BigInt, actorBigInt)
    .query<{ updated_at: Date }>(`
      UPDATE dbo.devices
         SET device_name = @name,
             location = @location,
             device_kind = @kind,
             idle_minutes = @idle,
             is_active = @active,
             updated_at = SYSUTCDATETIME(),
             updated_by = @actorId
      OUTPUT INSERTED.updated_at
       WHERE id = @id
    `);

  const updatedAt = updRes.recordset[0]?.updated_at
    ? new Date(updRes.recordset[0].updated_at).toISOString()
    : new Date().toISOString();

  const after: DeviceRecord = {
    ...before,
    deviceName: nextName,
    location: nextLocation,
    deviceKind: nextKind,
    idleMinutes: nextIdle,
    isActive: nextActive,
    updatedAt,
  };

  return { before, after };
}
