import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cameraProblem, InsecureContextError, scanMessages } from "@/lib/scan/camera";
import { createQrDetector, locateZXingFile, nativeQrDetector, ZXING_WASM_PATH, type DetectorClass } from "@/lib/scan/detector";

const ponyfill = vi.hoisted(() => ({
  prepareZXingModule: vi.fn<(options: unknown) => Promise<object>>(async () => ({})),
  detect: vi.fn<(source: unknown) => Promise<{ rawValue: string }[]>>(async () => []),
}));

vi.mock("barcode-detector/ponyfill", () => ({
  ZXING_WASM_VERSION: "9.9.9",
  prepareZXingModule: ponyfill.prepareZXingModule,
  BarcodeDetector: class {
    detect = ponyfill.detect;
  },
}));

/** A stand-in for the browser's own BarcodeDetector. */
function nativeClass(formats: string[] | Error, found: string[] = []): DetectorClass {
  return class {
    static getSupportedFormats = async () => {
      if (formats instanceof Error) throw formats;
      return formats;
    };
    detect = async () => found.map((rawValue) => ({ rawValue }));
  } as unknown as DetectorClass;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("nativeQrDetector", () => {
  it("uses the browser's detector only when it reads QR codes", async () => {
    const reads = nativeClass(["code_128", "qr_code"]);
    expect(await nativeQrDetector({ BarcodeDetector: reads })).toBe(reads);
    expect(await nativeQrDetector({ BarcodeDetector: nativeClass(["code_128"]) })).toBeNull();
    expect(await nativeQrDetector({})).toBeNull();
  });

  it("treats a detector that fails to list its formats as missing", async () => {
    expect(await nativeQrDetector({ BarcodeDetector: nativeClass(new Error("no platform detector")) })).toBeNull();
  });
});

describe("createQrDetector", () => {
  it("prefers the browser's own detector and returns every code in the frame (a sticker has two)", async () => {
    vi.stubGlobal("BarcodeDetector", nativeClass(["qr_code"], ["https://www.tirawatgroup.com", "WO1274/69"]));
    const detector = await createQrDetector();
    expect(detector.kind).toBe("native");
    expect(await detector.read({} as ImageBitmapSource)).toEqual(["https://www.tirawatgroup.com", "WO1274/69"]);
    expect(ponyfill.prepareZXingModule).not.toHaveBeenCalled();
  });

  it("falls back to WebAssembly, loads it from our own server first, and reads nothing from an empty frame", async () => {
    const detector = await createQrDetector();
    expect(detector.kind).toBe("wasm");
    expect(ponyfill.prepareZXingModule).toHaveBeenCalledWith({ overrides: { locateFile: expect.any(Function) }, fireImmediately: true });
    const { overrides } = ponyfill.prepareZXingModule.mock.calls[0][0] as { overrides: { locateFile: (path: string, prefix: string) => string } };
    expect(overrides.locateFile("zxing_reader.wasm", "https://cdn.example/")).toBe("/zxing/zxing_reader.wasm?v=9.9.9");
    expect(await detector.read({} as ImageBitmapSource)).toEqual([]);
  });

  it("rejects when the WebAssembly build cannot be fetched", async () => {
    ponyfill.prepareZXingModule.mockRejectedValueOnce(new Error("404"));
    await expect(createQrDetector()).rejects.toThrow("404");
  });
});

describe("locateZXingFile", () => {
  it("serves the .wasm from /zxing/ with the version in the address, anything else as asked", () => {
    expect(locateZXingFile("zxing_reader.wasm", "https://cdn/", "3.1.3")).toBe(`${ZXING_WASM_PATH}?v=3.1.3`);
    expect(locateZXingFile("zxing_reader.js", "https://cdn/", "3.1.3")).toBe("https://cdn/zxing_reader.js");
  });
});

describe("public/zxing", () => {
  it("holds the same .wasm as the installed zxing-wasm (run `npm run postinstall` after an upgrade)", () => {
    const sha = (path: string) => createHash("sha256").update(readFileSync(join(process.cwd(), path))).digest("hex");
    expect(sha("public/zxing/zxing_reader.wasm")).toBe(sha("node_modules/zxing-wasm/dist/reader/zxing_reader.wasm"));
  });
});

describe("cameraProblem", () => {
  it.each([
    [new InsecureContextError(), scanMessages.needsHttps],
    [new DOMException("denied", "NotAllowedError"), scanMessages.denied],
    [new DOMException("blocked", "SecurityError"), scanMessages.denied],
    [new DOMException("none", "NotFoundError"), scanMessages.noCamera],
    [new DOMException("constraints", "OverconstrainedError"), scanMessages.noCamera],
    [new DOMException("in use", "NotReadableError"), scanMessages.busy],
    [new Error("boom"), scanMessages.failed],
    ["not an error", scanMessages.failed],
  ])("%s → Thai sentence", (error, message) => {
    expect(cameraProblem(error)).toBe(message);
  });
});
