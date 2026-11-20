/* QCheck PWA Service Worker — Offline App Shell & Static Asset Cache (Zero-dependency, Next.js 16) */
const SHELL_CACHE = "qcheck-shell-v1";
const STATIC_CACHE = "qcheck-static-v1";
const VALID_CACHES = new Set([SHELL_CACHE, STATIC_CACHE]);

const PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/zxing/zxing_reader.wasm",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) =>
            cache.add(new Request(url, { cache: "reload" })).catch(() => undefined)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !VALID_CACHES.has(key)).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (!event.data || typeof event.data !== "object") return;
  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data.type === "CLEAR_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    );
  }
});

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/zxing/") ||
    pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Never intercept mutations or non-GET requests
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Only handle same-origin HTTP(S) requests
  if (url.origin !== self.location.origin) return;

  // Never cache API endpoints, RSC payloads, or Next image optimizer responses (protects per-user data on shared devices)
  if (
    url.pathname.startsWith("/api/") ||
    url.searchParams.has("_rsc") ||
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-Prefetch") === "1"
  ) {
    return;
  }

  // Immutable static assets & ZXing WASM: Cache-First with network fill
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response && response.ok && response.type === "basic") {
          cache.put(request, response.clone()).catch(() => undefined);
        }
        return response;
      })
    );
    return;
  }

  // Page navigations: Network-First so session/RBAC is always fresh; fallback to /offline when disconnected
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const shellCache = await caches.open(SHELL_CACHE);
        const offlinePage = await shellCache.match("/offline");
        if (offlinePage) return offlinePage;
        return new Response(
          "<!doctype html><html lang='th'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>ออฟไลน์ · QA & QC System</title><body style='font-family:sans-serif;background:#12151a;color:#f4f5f7;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center'><div><h1>ไม่มีการเชื่อมต่ออินเทอร์เน็ต</h1><p>กรุณาตรวจสอบ Wi-Fi ของโรงงานแล้วลองใหม่อีกครั้ง</p><button onclick='location.reload()' style='padding:12px 20px;border-radius:10px;border:0;background:#f97316;color:#fff;font-size:15px'>ลองเชื่อมต่ออีกครั้ง</button></div></body></html>",
          { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      })
    );
  }
});
