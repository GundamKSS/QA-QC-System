import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

const swSource = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const offlinePageSource = readFileSync(join(process.cwd(), "app/offline/page.tsx"), "utf8");

describe("PWA service worker & offline shell", () => {
  it("precaches the offline page, app icons, manifest, and ZXing WASM reader", () => {
    expect(swSource).toContain('"/offline"');
    expect(swSource).toContain('"/manifest.webmanifest"');
    expect(swSource).toContain('"/icons/icon-192.png"');
    expect(swSource).toContain('"/icons/icon-512.png"');
    expect(swSource).toContain('"/zxing/zxing_reader.wasm"');
  });

  it("never caches API routes, mutations, or RSC flight payloads", () => {
    expect(swSource).toContain('request.method !== "GET"');
    expect(swSource).toContain('url.pathname.startsWith("/api/")');
    expect(swSource).toContain('url.searchParams.has("_rsc")');
    expect(swSource).toContain('request.headers.get("RSC") === "1"');
  });

  it("serves /offline fallback when navigation requests fail while offline", () => {
    expect(swSource).toContain('request.mode === "navigate"');
    expect(swSource).toContain('shellCache.match("/offline")');
  });

  it("configures strict no-cache and scope headers for /sw.js in next.config.ts", async () => {
    const rules = await nextConfig.headers?.();
    const swRule = rules?.find((rule) => rule.source === "/sw.js");
    expect(swRule).toBeDefined();
    const map = new Map(swRule?.headers.map((h) => [h.key.toLowerCase(), h.value]));
    expect(map.get("cache-control")).toContain("no-store");
    expect(map.get("service-worker-allowed")).toBe("/");
    expect(map.get("content-type")).toContain("application/javascript");
  });

  it("keeps /offline static without reading session data", () => {
    expect(offlinePageSource).not.toContain("requireUser");
    expect(offlinePageSource).not.toContain("getCurrentUser");
    expect(offlinePageSource).toContain("OfflineRecovery");
  });
});
