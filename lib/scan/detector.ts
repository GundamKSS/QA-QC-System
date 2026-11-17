/**
 * Reads QR codes from camera frames (docs/04 "สแกน"): the browser's own BarcodeDetector when it reads QR
 * (Chrome on Android and macOS), otherwise ZXing-C++ compiled to WebAssembly, fetched only when a camera opens
 * (iPhone, Chrome/Edge on Windows). Picked by what the browser can do, never by its User-Agent. Browser-only.
 */

/** Same-origin copy written by tools/copy-zxing-wasm.mjs: no CDN, so a factory network that blocks one still works. */
export const ZXING_WASM_PATH = "/zxing/zxing_reader.wasm";

export type QrDetector = {
  kind: "native" | "wasm";
  /** Every QR code in the frame, in the order the reader found them: a sticker carries two, so the caller picks. */
  read(source: ImageBitmapSource): Promise<string[]>;
};

type DetectorLike = { detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]> };
export type DetectorClass = {
  new (options: { formats: string[] }): DetectorLike;
  getSupportedFormats(): Promise<string[]>;
};

/** The browser's own detector class when it reads QR codes, else null. */
export async function nativeQrDetector(
  scope: { BarcodeDetector?: DetectorClass } = globalThis as { BarcodeDetector?: DetectorClass },
): Promise<DetectorClass | null> {
  const native = scope.BarcodeDetector;
  if (!native) return null;
  try {
    return (await native.getSupportedFormats()).includes("qr_code") ? native : null;
  } catch {
    // Some builds expose the class but fail when the platform has no detector behind it.
    return null;
  }
}

/** Where the WebAssembly build fetches its files: the `.wasm` from our own server, versioned so an upgrade isn't served from cache. */
export function locateZXingFile(path: string, prefix: string, version: string): string {
  return path.endsWith(".wasm") ? `${ZXING_WASM_PATH}?v=${version}` : prefix + path;
}

/** Standard barcode & 2D formats used across TRW/PUMA factories (QR code, Code 128, Code 39, EAN-13, DataMatrix). */
export const SCAN_BARCODE_FORMATS = ["qr_code", "code_128", "code_39", "ean_13", "data_matrix"] as const;

const allQr = (detector: DetectorLike) => async (source: ImageBitmapSource) => (await detector.detect(source)).map((code) => code.rawValue);

/** Rejects when the WebAssembly build can't be fetched, so the camera screen can say so before the first frame. */
export async function createQrDetector(): Promise<QrDetector> {
  const native = await nativeQrDetector();
  if (native) {
    let supported: string[] = ["qr_code"];
    try {
      supported = await native.getSupportedFormats();
    } catch {
      supported = ["qr_code"];
    }
    const formats = SCAN_BARCODE_FORMATS.filter((f) => supported.includes(f));
    return { kind: "native", read: allQr(new native({ formats: formats.length > 0 ? formats : ["qr_code"] })) };
  }

  const { BarcodeDetector, prepareZXingModule, ZXING_WASM_VERSION } = await import("barcode-detector/ponyfill");
  await prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => locateZXingFile(path, prefix, ZXING_WASM_VERSION) },
    fireImmediately: true,
  });
  return { kind: "wasm", read: allQr(new BarcodeDetector({ formats: ["qr_code", "code_128", "code_39", "ean_13", "data_matrix"] })) };
}
