// Usage: node tools/copy-zxing-wasm.mjs   (runs by itself after `npm install`)
// The camera scanner's WebAssembly QR reader (lib/scan/detector.ts) is served from our own /zxing/ path rather than
// a CDN, so it keeps working on a network that blocks one. Copies the build of the installed zxing-wasm;
// tests/scan.test.ts fails if public/ ever holds a different one.
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "node_modules", "zxing-wasm");
const target = join(root, "public", "zxing", "zxing_reader.wasm");

await mkdir(dirname(target), { recursive: true });
await copyFile(join(pkg, "dist", "reader", "zxing_reader.wasm"), target);
const { version } = JSON.parse(await readFile(join(pkg, "package.json"), "utf8"));
console.log(`zxing-wasm ${version}: copied zxing_reader.wasm to public/zxing/`);
