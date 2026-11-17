/** Camera access for scanning (docs/04 "กล้อง"). Browser-only, apart from the message helpers. */

export const scanMessages = {
  needsHttps: "ต้องเปิดหน้านี้ผ่าน https จึงจะใช้กล้องได้",
  denied: "ไม่ได้รับอนุญาตให้ใช้กล้อง — อนุญาตกล้องให้เว็บนี้ในการตั้งค่าเบราว์เซอร์ แล้วกดลองอีกครั้ง",
  noCamera: "ไม่พบกล้องในเครื่องนี้",
  busy: "เปิดกล้องไม่ได้ — กล้องอาจถูกแอปอื่นใช้อยู่ ปิดแอปนั้นแล้วลองอีกครั้ง",
  failed: "เปิดกล้องไม่สำเร็จ — ลองอีกครั้ง",
  readerFailed: "โหลดตัวอ่าน QR ไม่สำเร็จ — ตรวจการเชื่อมต่อแล้วลองอีกครั้ง",
} as const;

/** Browsers hide `getUserMedia` outside https (localhost excepted); say that instead of a generic failure. */
export class InsecureContextError extends Error {
  override name = "InsecureContextError";
}

/** The back camera when there is one, asking for a picture sharp enough for a dense sticker QR. */
export async function openRearCamera(): Promise<MediaStream> {
  if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new InsecureContextError();
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
}

/** One Thai sentence for why the camera did not open (getUserMedia rejects with a DOMException named after the cause). */
export function cameraProblem(error: unknown): string {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  switch (name) {
    case "InsecureContextError":
      return scanMessages.needsHttps;
    case "NotAllowedError":
    case "SecurityError":
      return scanMessages.denied;
    case "NotFoundError":
    case "OverconstrainedError":
      return scanMessages.noCamera;
    case "NotReadableError":
    case "AbortError":
      return scanMessages.busy;
    default:
      return scanMessages.failed;
  }
}
