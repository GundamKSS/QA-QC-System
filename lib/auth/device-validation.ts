import type { DeviceKind } from "./idle";

export type DeviceRecord = {
  id: string;
  deviceCode: string;
  deviceName: string;
  location: string | null;
  deviceKind: DeviceKind;
  idleMinutes: number;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  isCurrentDevice: boolean;
};

export type ActiveDevicePolicy = {
  deviceId: string | null;
  deviceCode: string | null;
  deviceName: string | null;
  location: string | null;
  kind: DeviceKind;
  idleMinutes: number | null;
  warnSeconds: number;
};

export type DevicesPayload = {
  currentDevice: ActiveDevicePolicy;
  devices: DeviceRecord[];
  dbAvailable: boolean;
};

export type RegisterDeviceInput = {
  deviceCode: string;
  deviceName: string;
  location: string | null;
  deviceKind: DeviceKind;
  idleMinutes: number;
};

export type UpdateDeviceInput = {
  deviceName?: string;
  location?: string | null;
  deviceKind?: DeviceKind;
  idleMinutes?: number;
  isActive?: boolean;
};

const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/;

export function parseRegisterDeviceInput(raw: {
  deviceCode?: string | null;
  deviceName?: string | null;
  location?: string | null;
  deviceKind?: string | null;
  idleMinutes?: string | number | null;
}): { ok: true; value: RegisterDeviceInput } | { ok: false; message: string } {
  const deviceCode = (raw.deviceCode ?? "").trim().toUpperCase();
  if (!CODE_PATTERN.test(deviceCode)) {
    return {
      ok: false,
      message: "รหัสอุปกรณ์ต้องยาว 2–40 ตัวอักษร ใช้ได้เฉพาะ A-Z, 0-9, ขีดกลาง (-) และขีดล่าง (_)",
    };
  }

  const deviceName = (raw.deviceName ?? "").trim();
  if (deviceName.length < 2 || deviceName.length > 120) {
    return { ok: false, message: "ชื่ออุปกรณ์ต้องยาว 2–120 ตัวอักษร" };
  }

  const locationRaw = (raw.location ?? "").trim();
  if (locationRaw.length > 120) {
    return { ok: false, message: "จุดติดตั้งต้องยาวไม่เกิน 120 ตัวอักษร" };
  }

  const deviceKindRaw = (raw.deviceKind ?? "shared").trim().toLowerCase();
  if (deviceKindRaw !== "shared" && deviceKindRaw !== "personal") {
    return { ok: false, message: "ประเภทอุปกรณ์ต้องเป็น shared หรือ personal" };
  }

  const idleRaw = raw.idleMinutes === undefined || raw.idleMinutes === null || raw.idleMinutes === "" ? 30 : Number(raw.idleMinutes);
  if (!Number.isInteger(idleRaw) || idleRaw < 5 || idleRaw > 480) {
    return { ok: false, message: "เวลาหมดอายุเมื่อไม่ใช้งานต้องเป็นจำนวนเต็ม 5–480 นาที" };
  }

  return {
    ok: true,
    value: {
      deviceCode,
      deviceName,
      location: locationRaw || null,
      deviceKind: deviceKindRaw,
      idleMinutes: idleRaw,
    },
  };
}

export function parseUpdateDeviceInput(raw: {
  deviceName?: string | null;
  location?: string | null;
  deviceKind?: string | null;
  idleMinutes?: string | number | null;
  isActive?: string | boolean | null;
}): { ok: true; value: UpdateDeviceInput } | { ok: false; message: string } {
  const out: UpdateDeviceInput = {};

  if (raw.deviceName !== undefined && raw.deviceName !== null) {
    const name = raw.deviceName.trim();
    if (name.length < 2 || name.length > 120) {
      return { ok: false, message: "ชื่ออุปกรณ์ต้องยาว 2–120 ตัวอักษร" };
    }
    out.deviceName = name;
  }

  if (raw.location !== undefined) {
    const loc = (raw.location ?? "").trim();
    if (loc.length > 120) {
      return { ok: false, message: "จุดติดตั้งต้องยาวไม่เกิน 120 ตัวอักษร" };
    }
    out.location = loc || null;
  }

  if (raw.deviceKind !== undefined && raw.deviceKind !== null) {
    const kind = raw.deviceKind.trim().toLowerCase();
    if (kind !== "shared" && kind !== "personal") {
      return { ok: false, message: "ประเภทอุปกรณ์ต้องเป็น shared หรือ personal" };
    }
    out.deviceKind = kind;
  }

  if (raw.idleMinutes !== undefined && raw.idleMinutes !== null && raw.idleMinutes !== "") {
    const mins = Number(raw.idleMinutes);
    if (!Number.isInteger(mins) || mins < 5 || mins > 480) {
      return { ok: false, message: "เวลาหมดอายุเมื่อไม่ใช้งานต้องเป็นจำนวนเต็ม 5–480 นาที" };
    }
    out.idleMinutes = mins;
  }

  if (raw.isActive !== undefined && raw.isActive !== null) {
    if (typeof raw.isActive === "boolean") {
      out.isActive = raw.isActive;
    } else {
      out.isActive = raw.isActive === "1" || raw.isActive.toLowerCase() === "true";
    }
  }

  if (Object.keys(out).length === 0) {
    return { ok: false, message: "ไม่มีข้อมูลที่ต้องการแก้ไข" };
  }

  return { ok: true, value: out };
}
