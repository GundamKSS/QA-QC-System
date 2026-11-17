"use client";

import { useEffect, useId, useRef, useState } from "react";
import { triggerHaptic } from "@/lib/inspections/haptics";
import { cameraProblem } from "@/lib/scan/camera";
import { openLiveCameraStream, type FacingMode } from "./EvidenceCapture";

type Props = {
  defectName: string;
  defectCode?: string;
  part: string;
  onSnap: (uri: string) => void;
  onClose: () => void;
};

type Status = { kind: "starting" } | { kind: "ready" } | { kind: "error"; message: string };

/**
 * Screen S06: Full-Screen Spot Camera Dialog for Defect Evidence.
 * Follows the exact look, feel, and architecture of CameraScanDialog (SCAN QR Code):
 * - Native <dialog> with showModal() for true full-screen top-layer coverage
 * - Edge-to-edge camera feed (object-cover) that fits any mobile screen without awkward letterbox bars
 * - Centered aiming reticle frame highlighting the exact part/area (e.g. ถัง, ฐาน, แขนจับ)
 * - Large tactile shutter button at the bottom
 */
export function DefectSpotCameraDialog({
  defectName,
  defectCode,
  part,
  onSnap,
  onClose,
}: Props) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "starting" });
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    const stop = () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
    };

    async function start() {
      try {
        stream = await openLiveCameraStream(facingMode);
      } catch (error) {
        if (!stopped) setStatus({ kind: "error", message: cameraProblem(error) });
        return;
      }
      if (stopped) return stop();
      const video = videoRef.current;
      if (!video) return stop();
      video.srcObject = stream;
      void video.play().catch(() => undefined);
      if (!stopped) setStatus({ kind: "ready" });
    }

    void start();
    return stop;
  }, [facingMode, attempt]);

  function handleSwitchFacing() {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }

  function retry() {
    setStatus({ kind: "starting" });
    setAttempt((count) => count + 1);
  }

  function handleCapture() {
    const videoEl = videoRef.current;
    if (!videoEl || status.kind !== "ready") return;

    const rawW = videoEl.videoWidth || 1280;
    const rawH = videoEl.videoHeight || 720;

    const rect = videoEl.getBoundingClientRect();
    const containerW = rect.width > 0 ? rect.width : rawW;
    const containerH = rect.height > 0 ? rect.height : rawH;

    const containerRatio = containerW / containerH;
    const videoRatio = rawW / rawH;

    let sx = 0;
    let sy = 0;
    let sw = rawW;
    let sh = rawH;

    if (videoRatio > containerRatio) {
      // Video is wider than viewfinder -> crop horizontal overflow
      sw = rawH * containerRatio;
      sx = (rawW - sw) / 2;
    } else {
      // Video is taller than viewfinder -> crop vertical overflow
      sh = rawW / containerRatio;
      sy = (rawH - sh) / 2;
    }

    const maxDim = 1280;
    const scale = Math.min(1, maxDim / Math.max(sw, sh));
    const width = Math.max(1, Math.round(sw * scale));
    const height = Math.max(1, Math.round(sh * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, width, height);
    const uri = canvas.toDataURL("image/jpeg", 0.85);

    triggerHaptic("shutter");
    onSnap(uri);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      data-theme-surface="dark"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="camera-viewfinder m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-black p-0 text-white backdrop:bg-black"
    >
      {/* Fullscreen Video Stream: Exactly like CameraScanDialog */}
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Aiming frame: Matches QR Code scanner frame with luminous amber accent */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(72vw,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-panel border-[3px] border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.35)] outline-2 outline-black/60 flex flex-col justify-between p-3"
      >
        <div className="self-start rounded-md bg-black/85 border border-amber-400/60 px-2.5 py-1 text-xs font-mono font-bold text-amber-300 shadow-md">
          จุด: {part}
        </div>
        <div className="self-center rounded-full bg-black/80 px-3 py-1 text-xs font-medium text-white shadow-md">
          เล็งตำแหน่ง {part} ให้อยู่ในกรอบ
        </div>
      </div>

      {/* Top Floating Header with Gradient: Matches CameraScanDialog */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/90 via-black/60 to-transparent px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="min-w-0 space-y-0.5">
          <span className="inline-block rounded-md bg-fail px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
            📸 บังคับถ่ายรูปเฉพาะจุด
          </span>
          <h2 id={`${id}-title`} className="text-sm sm:text-base font-bold text-white truncate">
            {defectName} {defectCode ? `(${defectCode})` : ""}
          </h2>
          <p className="text-xs text-amber-300 font-bold">
            จุดที่พบ: <span className="underline underline-offset-2">{part}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSwitchFacing}
            className="h-10 rounded-control border border-white/40 bg-black/50 px-3 text-xs text-white hover:bg-white/20 active:scale-95 transition-all cursor-pointer"
            title="สลับกล้องหน้า/หลัง"
          >
            🔄 สลับกล้อง
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-control border border-white/50 bg-black/50 px-4 text-sm font-medium text-white transition-colors hover:bg-white/10 active:scale-95 cursor-pointer"
          >
            ปิด
          </button>
        </div>
      </div>

      {/* Bottom Floating Bar with Shutter: Matches CameraScanDialog */}
      <div className="absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-12 text-center flex flex-col items-center">
        {status.kind === "error" ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-red-200">
              {status.message}
            </p>
            <button
              type="button"
              onClick={retry}
              className="h-11 rounded-control bg-white px-5 text-sm font-semibold text-black hover:bg-ti-100 cursor-pointer"
            >
              ลองอีกครั้ง
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              disabled={status.kind !== "ready"}
              onClick={handleCapture}
              aria-label={`กดถ่ายรูปจุด ${part}`}
              className="group relative flex items-center justify-center size-20 rounded-full border-4 border-amber-400 bg-black shadow-xl shadow-amber-500/30 active:scale-95 transition-all disabled:opacity-40 cursor-pointer touch-manipulation"
            >
              <span className="size-15 rounded-full bg-amber-400 group-hover:bg-amber-300 group-active:scale-90 transition-all flex items-center justify-center text-black font-bold shadow-inner">
                <span className="text-2xl">📷</span>
              </span>
            </button>
            <p className="text-xs text-white/90 font-medium">
              {status.kind === "starting"
                ? "กำลังเปิดกล้อง…"
                : `กดปุ่มชัตเตอร์เพื่อบันทึกรูปจุด ${part}`}
            </p>
          </>
        )}
      </div>
    </dialog>
  );
}
