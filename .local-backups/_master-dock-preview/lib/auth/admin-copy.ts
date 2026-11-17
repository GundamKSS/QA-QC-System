import type { AdminError } from "./local-admin";

/** Thai messages for the user-management screens (never shows PINs or secrets). */
export const adminErrors: Record<AdminError, string> = {
  forbidden: "คุณไม่มีสิทธิ์ทำรายการนี้",
  not_found: "ไม่พบผู้ใช้นี้",
  name_required: "กรุณากรอกชื่อ-นามสกุล",
  email_invalid: "รูปแบบอีเมลไม่ถูกต้อง",
  roles_required: "เลือกบทบาทอย่างน้อย 1 บทบาท",
  roles_rejected: "ผู้ใช้หน้างานเลือกได้เฉพาะ QC Inspector และ QA Inspector",
  pin_format: "PIN ต้องเป็นตัวเลข 6 หลัก ไม่ซ้ำกันทั้งหมด และไม่เรียงต่อกัน (เช่น 111111, 123456)",
  pin_same: "PIN ใหม่ต้องไม่เหมือน PIN เดิม",
  pin_mismatch: "PIN ใหม่ทั้งสองช่องไม่ตรงกัน",
  pin_wrong: "PIN ปัจจุบันไม่ถูกต้อง",
  pin_locked: "PIN ถูกล็อก ติดต่อ Admin หรือหัวหน้า QC เพื่อปลดล็อก",
};
