import fs from "node:fs";
import path from "node:path";

const ARTIFACT_DIR = "/Users/gundam/.gemini/antigravity/brain/ae63dc2e-067f-458e-b95f-3211893b86fc";

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.callbacks = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function impersonateCookie(employeeCode) {
  const res = await fetch("http://localhost:3000/api/dev/impersonate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeCode })
  });
  const cookieHeader = res.headers.get("set-cookie") || "";
  const match = cookieHeader.match(/([^=]+)=([^;]+)/);
  if (!match) throw new Error("Could not extract cookie");
  return { name: match[1], value: match[2] };
}

async function capture(url, cookie, viewport, outputPath, delayMs = 1500) {
  const newTarget = await fetch("http://localhost:9222/json/new?about:blank", { method: "PUT" });
  const target = await newTarget.json();
  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();

  try {
    await cdp.send("Page.enable");
    await cdp.send("Network.enable");

    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 2,
      mobile: viewport.mobile ?? false
    });

    if (cookie) {
      await cdp.send("Network.setCookie", {
        name: cookie.name,
        value: cookie.value,
        domain: "localhost",
        path: "/"
      });
    }

    await cdp.send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, delayMs));

    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false
    });

    const fullPath = path.join(ARTIFACT_DIR, outputPath);
    fs.writeFileSync(fullPath, Buffer.from(data, "base64"));
    console.log(`Saved screenshot to: ${fullPath}`);
  } finally {
    cdp.close();
    await fetch(`http://localhost:9222/json/close/${target.id}`);
  }
}

async function main() {
  console.log("Starting screenshot capture...");

  // 1. Mobile QA Queue (Screen S10) as QA Inspector F0001
  const qaCookie = await impersonateCookie("F0001");
  await capture(
    "http://localhost:3000/qa-queue",
    qaCookie,
    { width: 390, height: 844, mobile: true },
    "36-mobile-qa-queue-screen-s10.png",
    2000
  );

  // 2. Desktop Reports List (Screen S15 index) as Admin dev
  const adminCookie = await impersonateCookie("dev");
  await capture(
    "http://localhost:3000/reports",
    adminCookie,
    { width: 1280, height: 800, mobile: false },
    "37-desktop-reports-list-screen-s15.png",
    2000
  );

  // 3. Desktop Official Inspection Report (Screen S15 certificate) as Admin dev
  await capture(
    "http://localhost:3000/plans/35/report",
    adminCookie,
    { width: 1280, height: 950, mobile: false },
    "38-desktop-official-inspection-report-certificate.png",
    2500
  );

  console.log("All screenshots captured successfully!");
}

main().catch(console.error);
