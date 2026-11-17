"use client";

import { useEffect, useRef, useState } from "react";
import { AppBack } from "@/components/ui/AppBack";
import { DevPersonaSection } from "./DevPersonaSection";

type Props = {
  isDevMode: boolean;
};

export function SettingsView({ isDevMode }: Props) {
  // Device & Camera testing states
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Barcode scanner test state
  const [scannedInput, setScannedInput] = useState("");
  const [recentScans, setRecentScans] = useState<string[]>([]);

  // System & Environment info
  const [sysInfo, setSysInfo] = useState(() => {
    if (typeof window === "undefined") {
      return { userAgent: "", screen: "", isOnline: true };
    }
    return {
      userAgent: navigator.userAgent,
      screen: `${window.screen.width} × ${window.screen.height} (Pixel Ratio: ${window.devicePixelRatio || 1})`,
      isOnline: navigator.onLine,
    };
  });

  // Offline storage count
  const [offlineDraftCount, setOfflineDraftCount] = useState(() => {
    if (typeof window === "undefined") return 0;
    try {
      const raw = localStorage.getItem("qcheck_offline_claims") || "[]";
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.length : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    const handleOnline = () => setSysInfo((s) => ({ ...s, isOnline: true }));
    const handleOffline = () => setSysInfo((s) => ({ ...s, isOnline: false }));
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      stopCamera();
    };
  }, []);

  async function startCamera() {
    stopCamera();
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((d) => d.kind === "videoinput"));
    } catch (err: unknown) {
      setCameraActive(false);
      setCameraError(err instanceof Error ? err.message : "ไม่สามารถเข้าถึงกล้องได้");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }

  function handleScannerSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!scannedInput.trim()) return;
    setRecentScans((prev) => [scannedInput.trim(), ...prev].slice(0, 5));
    setScannedInput("");
  }

  function clearOfflineCache() {
    if (confirm("ต้องการล้างแคชรายการตรวจสอบออฟไลน์ที่ค้างอยู่ใช่หรือไม่?")) {
      try {
        localStorage.removeItem("qcheck_offline_claims");
        setOfflineDraftCount(0);
      } catch (e) {
        console.error(e);
      }
    }
  }

  return (
    <div className="min-w-0 w-full space-y-6 p-4 sm:p-6 max-w-4xl mx-auto">
      <AppBack href="/home">กลับหน้าหลัก</AppBack>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ti-50">การตั้งค่า และอุปกรณ์</h1>
          <p className="text-sm text-ti-400">
            ทดสอบอุปกรณ์ฮาร์ดแวร์ประจำเครื่อง สแกนเนอร์ กล้องถ่ายภาพ และระบบจำลองบทบาท
          </p>
        </div>
      </div>

      {/* Dev Persona Switcher Section */}
      {isDevMode && <DevPersonaSection />}

      {/* Hardware Section: Camera */}
      <section aria-labelledby="camera-heading" className="space-y-3 rounded-panel border border-carbon-700 bg-carbon-800 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-carbon-700 text-ti-200">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
            </span>
            <div>
              <h2 id="camera-heading" className="text-base font-semibold text-ti-50">
                ทดสอบกล้องถ่ายภาพ (Camera Diagnostic)
              </h2>
              <p className="text-xs text-ti-400">
                ทดสอบความคมชัดและสิทธิ์การเข้าถึงกล้องสำหรับถ่ายรูปอาการเสีย
              </p>
            </div>
          </div>

          <div>
            {cameraActive ? (
              <button
                type="button"
                onClick={stopCamera}
                className="rounded-lg bg-carbon-700 hover:bg-carbon-600 px-3 py-1.5 text-xs font-semibold text-ti-200"
              >
                ปิดกล้อง
              </button>
            ) : (
              <button
                type="button"
                onClick={startCamera}
                className="rounded-lg bg-ti-50 hover:bg-white px-3 py-1.5 text-xs font-semibold text-carbon-950 shadow-sm"
              >
                เปิดทดสอบกล้อง
              </button>
            )}
          </div>
        </div>

        {cameraError && (
          <div className="rounded-lg border border-rose-500/50 bg-rose-950/30 p-3 text-xs text-rose-300">
            ⚠️ เกิดข้อผิดพลาด: {cameraError}
          </div>
        )}

        {cameraActive && (
          <div className="space-y-2 mt-3">
            <div className="relative aspect-video max-h-64 overflow-hidden rounded-xl border border-carbon-600 bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
              <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[11px] text-emerald-400 font-mono">
                ● กล้องทำงานปกติ (Live)
              </span>
            </div>
            {cameras.length > 0 && (
              <p className="text-xs text-ti-400">
                พบอุปกรณ์กล้องในระบบ: {cameras.map((c) => c.label || "Camera").join(", ")}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Hardware Section: Barcode Scanner */}
      <section aria-labelledby="scanner-heading" className="space-y-3 rounded-panel border border-carbon-700 bg-carbon-800 p-5">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-carbon-700 text-ti-200">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="5" height="12" x="3" y="6" rx="1" />
              <rect width="2" height="12" x="10" y="6" />
              <rect width="4" height="12" x="14" y="6" rx="1" />
              <rect width="1" height="12" x="20" y="6" />
            </svg>
          </span>
          <div>
            <h2 id="scanner-heading" className="text-base font-semibold text-ti-50">
              ทดสอบหัวอ่านบาร์โค้ด (Barcode / QR Scanner)
            </h2>
            <p className="text-xs text-ti-400">
              ยิงบาร์โค้ดหรือ Serial Number เพื่อทดสอบความพร้อมของหัวอ่านแบบ USB หรือ Bluetooth
            </p>
          </div>
        </div>

        <form onSubmit={handleScannerSubmit} className="flex gap-2">
          <input
            type="text"
            value={scannedInput}
            onChange={(e) => setScannedInput(e.target.value)}
            placeholder="คลิกที่นี่แล้วยิงบาร์โค้ด หรือพิมพ์ข้อความแล้วกด Enter…"
            className="flex-1 rounded-lg border border-carbon-600 bg-carbon-900 px-3 py-2 text-sm text-ti-100 placeholder:text-ti-500 focus:border-amber-400 focus:outline-none font-mono"
          />
          <button
            type="submit"
            className="rounded-lg bg-carbon-700 hover:bg-carbon-600 px-4 py-2 text-xs font-semibold text-ti-200"
          >
            ทดสอบ
          </button>
        </form>

        {recentScans.length > 0 && (
          <div className="mt-2 space-y-1">
            <span className="text-xs font-medium text-ti-400">ประวัติการสแกนล่าสุด:</span>
            <div className="flex flex-wrap gap-1.5">
              {recentScans.map((code, idx) => (
                <span
                  key={`${code}-${idx}`}
                  className="rounded bg-carbon-700/80 px-2 py-0.5 font-mono text-xs text-emerald-400"
                >
                  ✓ {code}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Storage & Network Section */}
      <section aria-labelledby="storage-heading" className="space-y-3 rounded-panel border border-carbon-700 bg-carbon-800 p-5">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-carbon-700 text-ti-200">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </span>
          <div>
            <h2 id="storage-heading" className="text-base font-semibold text-ti-50">
              สถานะเครือข่าย และแคชออฟไลน์
            </h2>
            <p className="text-xs text-ti-400">
              ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตและข้อมูลแคชที่บันทึกไว้ในเครื่อง
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-carbon-700 bg-carbon-900/50 p-3">
            <span className="text-ti-400">สถานะเครือข่าย:</span>
            <div className="mt-1 flex items-center gap-1.5 font-medium text-ti-200">
              <span className={`size-2 rounded-full ${sysInfo.isOnline ? "bg-emerald-400" : "bg-rose-400"}`} />
              {sysInfo.isOnline ? "เชื่อมต่ออินเทอร์เน็ตปกติ (Online)" : "ออฟไลน์ (Offline Mode)"}
            </div>
          </div>

          <div className="rounded-lg border border-carbon-700 bg-carbon-900/50 p-3 flex items-center justify-between">
            <div>
              <span className="text-ti-400">รายการค้างซิงค์ออฟไลน์:</span>
              <p className="mt-1 font-semibold text-ti-200">{offlineDraftCount} รายการ</p>
            </div>
            {offlineDraftCount > 0 && (
              <button
                type="button"
                onClick={clearOfflineCache}
                className="rounded bg-rose-500/20 hover:bg-rose-500/30 px-2.5 py-1 text-[11px] font-semibold text-rose-300"
              >
                ล้างแคช
              </button>
            )}
          </div>
        </div>
      </section>

      {/* System Info Section */}
      <section aria-labelledby="sysinfo-heading" className="space-y-2 rounded-panel border border-carbon-700 bg-carbon-800 p-5 text-xs text-ti-400">
        <h2 id="sysinfo-heading" className="text-sm font-semibold text-ti-200">
          ข้อมูลระบบและอุปกรณ์
        </h2>
        <div className="space-y-1 font-mono text-[11px]">
          <p>ความละเอียดหน้าจอ: {sysInfo.screen}</p>
          <p className="truncate">เบราว์เซอร์: {sysInfo.userAgent}</p>
          <p>ฐานข้อมูล: SQL Server (เชื่อมต่อเรียบร้อย)</p>
          <p>เวอร์ชัน QA & QC System: v0.1.0 (Log-book convention)</p>
        </div>
      </section>
    </div>
  );
}
