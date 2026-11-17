/** Thai sentences shared by every API route and by the browser side that calls them (no server-only imports). */
export const apiMessages = {
  origin: "คำขอไม่ถูกต้อง — ส่งได้เฉพาะจากหน้าของ QCheck",
  signedOut: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง",
  passwordChange: "ต้องตั้ง PIN ใหม่ก่อนใช้งานต่อ",
  forbidden: "คุณไม่มีสิทธิ์ทำรายการนี้",
  /** The browser could not reach the server at all (offline, server restarting). */
  network: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสัญญาณแล้วลองอีกครั้ง",
  /** The server answered something that is not our JSON (a crash page, a proxy error). */
  unexpected: "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองอีกครั้ง",
} as const;
