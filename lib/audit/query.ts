export const AUDIT_PAGE_SIZE = 50;

export const AUDIT_ACTION_GROUPS = [
  { value: "", label: "ทุกหมวดเหตุการณ์" },
  { value: "login", label: "การเข้าสู่ระบบ / ล็อกบัญชี" },
  { value: "logout", label: "การออกจากระบบ" },
  { value: "plan", label: "แผนตรวจ (Plans)" },
  { value: "work_order", label: "ใบงานเรียกเข้า (Work Orders)" },
  { value: "unit_inspection", label: "การตรวจรายเครื่อง / Rework" },
  { value: "qa", label: "คิวสุ่มตรวจ QA & AQL" },
  { value: "master", label: "ข้อมูลหลัก (Master Data)" },
  { value: "user", label: "ผู้ใช้และสิทธิ์ (Users / PIN)" },
  { value: "device", label: "อุปกรณ์ส่วนกลาง (Devices)" },
] as const;

export type AuditActionGroup = (typeof AUDIT_ACTION_GROUPS)[number]["value"];

const VALID_GROUPS = new Set<string>(AUDIT_ACTION_GROUPS.map((g) => g.value));
const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ACTION_LABELS: Record<string, string> = {
  "login.success": "เข้าสู่ระบบสำเร็จ",
  "login.failure": "เข้าสู่ระบบไม่สำเร็จ",
  "login.lockout": "บัญชีถูกล็อก (รหัสผิดครบเกณฑ์)",
  "login.locked": "พยายามเข้าสู่ระบบขณะถูกล็อก",
  "login.throttled": "ถูกจำกัดความถี่การเข้าสู่ระบบ",
  "login.pin_failure": "กรอก PIN ผิด",
  "login.pin_lockout": "PIN ถูกล็อก (ผิดครบ 5 ครั้ง)",
  "login.pin_locked": "พยายามเข้าด้วย PIN ขณะถูกล็อก",
  "login.disabled": "บัญชีถูกปิดใช้งาน",
  "login.forbidden": "ไม่มีสิทธิ์เข้าใช้งานโปรแกรม",
  "login.unavailable": "ระบบยืนยันตัวตนกลางไม่พร้อมใช้งาน",
  "login.unknown_role": "พบบทบาทที่ไม่รู้จักจากระบบกลาง",
  logout: "ออกจากระบบ",
  "logout.idle": "ออกจากระบบอัตโนมัติ (Idle Timeout)",
  "plan.open": "เปิดแผนตรวจใหม่",
  "plan.cancel": "ยกเลิกแผนตรวจ",
  "plan.waiting_goods": "เปลี่ยนสถานะรอของ",
  "plan.vendor": "แก้ไข Vendor ของแผน",
  "plan.submit_to_qa": "ส่งต่อแผนให้ฝ่าย QA",
  "work_order.open": "เปิดใบงานเรียกเข้า",
  "work_order.assignees": "แก้ไขผู้รับผิดชอบใบงาน",
  "work_order.cancel": "ยกเลิกใบงาน",
  "unit_inspection.claim": "เริ่มตรวจเครื่อง (Claim Serial)",
  "unit_inspection.cancel_claim": "ยกเลิก/พักการตรวจเครื่อง",
  "unit_inspection.submit": "บันทึกผลตรวจเครื่องเสร็จสิ้น",
  "unit_inspection.rework": "บันทึกผลตรวจซ้ำ (Rework)",
  "qa.set_aql_level": "กำหนดระดับสุ่มตรวจ AQL",
  "qa.accept_plan": "QA รับงานต่อจาก QC",
  "qa.assign_inspectors": "มอบหมายผู้ตรวจ QA",
  "qa.confirm_plan": "QA ยืนยันปิดแผน",
  "qa.return_unit_to_qc": "QA ตีกลับเครื่องให้ QC แก้ไข",
  "master.create": "เพิ่มข้อมูลหลัก",
  "master.update": "แก้ไขข้อมูลหลัก",
  "master.disable": "ปิดใช้งานข้อมูลหลัก",
  "master.enable": "เปิดใช้งานข้อมูลหลัก",
  "user.create": "สร้างผู้ใช้หน้างาน (PIN)",
  "user.update": "แก้ไขข้อมูลผู้ใช้",
  "user.roles_change": "ปรับสิทธิ์ผู้ใช้",
  "user.pin_reset": "ออก PIN ชั่วคราวใหม่",
  "user.pin_unlock": "ปลดล็อก PIN",
  "user.pin_change": "ผู้ใช้เปลี่ยน PIN เอง",
  "user.deactivate": "ปิดใช้งานบัญชีผู้ใช้",
  "user.activate": "เปิดใช้งานบัญชีผู้ใช้",
  "device.register": "ลงทะเบียนอุปกรณ์ส่วนกลาง",
  "device.update": "แก้ไขข้อมูลอุปกรณ์",
  "device.activate": "เปิดใช้งานอุปกรณ์",
  "device.deactivate": "ปิดใช้งานอุปกรณ์",
  "device.unbind": "ยกเลิกการผูกอุปกรณ์บนเบราว์เซอร์",
};

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export type AuditQuery = {
  q: string;
  group: AuditActionGroup;
  from: string;
  to: string;
  page: number;
};

export type AuditLogItem = {
  id: string;
  at: string;
  action: string;
  actorId: string | null;
  actorCode: string | null;
  actorName: string | null;
  entityType: string | null;
  entityId: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  detailJson: string | null;
  ip: string | null;
  userAgent: string | null;
  deviceId: string | null;
};

export type AuditLogPayload = {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  dbAvailable: boolean;
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function parseAuditQuery(raw: Record<string, string | string[] | undefined>): AuditQuery {
  const q = first(raw.q).trim().slice(0, 100);
  const groupRaw = first(raw.group).trim();
  const group: AuditActionGroup = VALID_GROUPS.has(groupRaw) ? (groupRaw as AuditActionGroup) : "";
  const fromRaw = first(raw.from).trim();
  const toRaw = first(raw.to).trim();
  const from = YMD_PATTERN.test(fromRaw) ? fromRaw : "";
  const to = YMD_PATTERN.test(toRaw) ? toRaw : "";
  const pageNum = Number.parseInt(first(raw.page), 10);
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? Math.min(pageNum, 10_000) : 1;
  return { q, group, from, to, page };
}

export function auditQueryString(query: AuditQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.group) params.set("group", query.group);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.page > 1) params.set("page", String(query.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Converts a Bangkok calendar date (YYYY-MM-DD) to UTC ISO start timestamp (inclusive). */
export function bangkokDayStartUtc(ymd: string): string | null {
  if (!YMD_PATTERN.test(ymd)) return null;
  const date = new Date(`${ymd}T00:00:00+07:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Converts a Bangkok calendar date (YYYY-MM-DD) to the next day's UTC ISO start timestamp (exclusive). */
export function bangkokDayEndExclusiveUtc(ymd: string): string | null {
  if (!YMD_PATTERN.test(ymd)) return null;
  const date = new Date(`${ymd}T00:00:00+07:00`);
  if (!Number.isFinite(date.getTime())) return null;
  return new Date(date.getTime() + 86_400_000).toISOString();
}
