"use client";

import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { cameraProblem, openRearCamera, scanMessages } from "@/lib/scan/camera";
import { createQrDetector, type QrDetector } from "@/lib/scan/detector";
import { playScanSuccessSound, playScanWarningSound, triggerScanHaptic } from "@/lib/scan/feedback";

type Props = {
  title: string;
  /** One line under the picture: what to aim at. */
  hint: string;
  /**
   * Return true to take a code, or a sentence to show while scanning on (the sticker's other QR, a code from
   * something else). Without it the first code is taken.
   */
  check?: (text: string) => true | string;
  /** The text of the code taken; the camera is already off by then. */
  onRead: (text: string) => void;
  onClose: () => void;
};

type Status =
  | { kind: "starting" }
  | { kind: "scanning"; note: string | null }
  | { kind: "detected"; code: string }
  | { kind: "error"; message: string };

/** About 8 frames a second: quick enough to feel instant, light enough for a budget phone running WebAssembly. */
const SCAN_EVERY_MS = 125;

/**
 * Full-screen camera that reads one QR code and hands its text back (docs/04 "สแกน", docs/09 §3.2: no tab bar while
 * the camera is up). Mounted means open: the parent renders it only while scanning, and unmounting turns the camera off.
 * Enhanced with Industrial Laser Reticle, Multi-sensory Audio/Haptic Feedback, Torch Toggle, and Simulator fallback.
 */
export function CameraScanDialog({ title, hint, check, onRead, onClose }: Props) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "starting" });
  const [attempt, setAttempt] = useState(0);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  const read = useEffectEvent((text: string) => onRead(text));
  const verdict = useEffectEvent((text: string): true | string => (check ? check(text) : true));

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      trackRef.current = null;
    };

    async function start() {
      try {
        stream = await openRearCamera();
      } catch (error) {
        if (!stopped) setStatus({ kind: "error", message: cameraProblem(error) });
        return;
      }
      // Closed while the permission prompt was up: let go of the camera at once.
      if (stopped) return stop();
      const video = videoRef.current;
      if (!video) return stop();
      video.srcObject = stream;
      void video.play().catch(() => undefined);

      // Check flashlight/torch capability
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        trackRef.current = videoTrack;
        try {
          const capabilities = (videoTrack.getCapabilities?.() || {}) as { torch?: boolean };
          if (capabilities.torch) {
            setTorchSupported(true);
          }
        } catch {
          setTorchSupported(false);
        }
      }

      let detector: QrDetector;
      try {
        detector = await createQrDetector();
      } catch {
        if (!stopped) setStatus({ kind: "error", message: scanMessages.readerFailed });
        return stop();
      }
      if (stopped) return;
      setStatus({ kind: "scanning", note: null });

      let busy = false;
      let shown: string | null = null;
      timer = setInterval(async () => {
        if (busy || stopped || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
        busy = true;
        try {
          let note: string | null = null;
          for (const text of await detector.read(video)) {
            const answer = verdict(text);
            if (answer === true) {
              if (!stopped) {
                // Multi-sensory feedback on instant detection
                playScanSuccessSound();
                triggerScanHaptic("success");
                setStatus({ kind: "detected", code: text });
                // Brief 200ms visual latch before turning off camera
                setTimeout(() => {
                  stop();
                  read(text);
                }, 200);
              }
              return;
            }
            note ??= answer;
            playScanWarningSound();
            triggerScanHaptic("warn");
          }
          // Keep the last note up while the person re-aims, rather than flickering it on every empty frame.
          if (note && note !== shown && !stopped) {
            shown = note;
            setStatus({ kind: "scanning", note });
          }
        } catch {
          // A frame the reader could not take (the video resizing on rotation, for one): try the next one.
        } finally {
          busy = false;
        }
      }, SCAN_EVERY_MS);
    }

    void start();
    return stop;
  }, [attempt]);

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    try {
      const nextTorch = !torchOn;
      await (track as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch {
      setTorchSupported(false);
    }
  }

  function retry() {
    setStatus({ kind: "starting" });
    setAttempt((count) => count + 1);
  }

  function handleSimulateRead(code: string) {
    playScanSuccessSound();
    triggerScanHaptic("success");
    onRead(code);
  }

  const isDetected = status.kind === "detected";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-black p-0 text-white backdrop:bg-black"
    >
      <video ref={videoRef} muted playsInline autoPlay aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />

      {/* Industrial High-Tech Aiming Frame with Corner Brackets & Laser Glow */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(76vw,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl transition-all duration-300 ${
          isDetected
            ? "border-[3px] border-pass shadow-[0_0_30px_rgba(34,197,94,0.8)] scale-105"
            : "border-2 border-white/60 shadow-[0_0_20px_rgba(0,0,0,0.5)]"
        }`}
      >
        {/* Corner HUD Brackets */}
        <div className="absolute -top-1 -left-1 h-5 w-5 border-t-4 border-l-4 border-ember-400 rounded-tl-md" />
        <div className="absolute -top-1 -right-1 h-5 w-5 border-t-4 border-r-4 border-ember-400 rounded-tr-md" />
        <div className="absolute -bottom-1 -left-1 h-5 w-5 border-b-4 border-l-4 border-ember-400 rounded-bl-md" />
        <div className="absolute -bottom-1 -right-1 h-5 w-5 border-b-4 border-r-4 border-ember-400 rounded-br-md" />

        {/* Dynamic Laser Scanning Line */}
        {!isDetected && status.kind === "scanning" && (
          <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-ember-400 to-transparent shadow-[0_0_10px_rgba(249,115,22,0.9)] animate-bounce" />
        )}

        {/* Center Target Dot */}
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ember-400/80 animate-ping" />
      </div>

      {/* Top App Bar */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-ember-400 animate-pulse" />
          <h2 id={`${id}-title`} className="text-base font-semibold tracking-tight">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-label={torchOn ? "ปิดไฟฉาย" : "เปิดไฟฉาย"}
              className={`h-10 w-10 flex items-center justify-center rounded-full border transition-colors ${
                torchOn ? "bg-amber-400 border-amber-300 text-carbon-950 font-bold" : "border-white/40 bg-black/40 text-white"
              }`}
            >
              ⚡
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-10 shrink-0 rounded-control border border-white/50 bg-black/40 px-4 text-sm font-medium transition-colors hover:bg-white/10"
          >
            ปิด
          </button>
        </div>
      </div>

      {/* Bottom Hint & Status Bar */}
      <div className="absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-12 text-center">
        {status.kind === "error" ? (
          <div className="space-y-3 max-w-sm mx-auto">
            <p role="alert" className="text-sm font-medium text-red-200">{status.message}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={retry}
                className="h-10 rounded-control bg-white px-4 text-xs font-semibold text-black hover:bg-ti-100 active:scale-95 transition"
              >
                ลองอีกครั้ง
              </button>
              {/* Simulator fallback helpers for testing without physical camera */}
              <button
                type="button"
                onClick={() =>
                  handleSimulateRead("5x3 HP 260L. (PP-23P)|FG1004-000675|WC:WMT-409|MODEL:CHEETAH-25|FIC:FG-MT-00156|Date:2569/11/16|WOQP-2611-0004-1|SN69/00088-50")
                }
                className="h-10 rounded-control border border-ember-400/80 bg-ember-500/20 px-3 text-xs font-semibold text-ember-200 hover:bg-ember-500/30 active:scale-95 transition"
              >
                🧪 จำลองสแกน QR ปั๊มผลิตเอง
              </button>
              <button
                type="button"
                onClick={() => handleSimulateRead("TIGER-2611-8899")}
                className="h-10 rounded-control border border-sky-400/80 bg-sky-500/20 px-3 text-xs font-semibold text-sky-200 hover:bg-sky-500/30 active:scale-95 transition"
              >
                🧪 จำลองสแกน Serial นำเข้า
              </button>
            </div>
          </div>
        ) : status.kind === "detected" ? (
          <p role="status" className="text-sm font-bold text-pass animate-pulse">
            ✓ สแกนสำเร็จ: {status.code.slice(0, 32)}
          </p>
        ) : (
          <div className="space-y-1">
            <p role="status" className={`text-sm font-medium ${status.kind === "scanning" && status.note ? "text-amber-300" : "text-white/95"}`}>
              {status.kind === "starting" ? "กำลังเปิดกล้อง…" : (status.note ?? hint)}
            </p>
            <p className="text-[11px] text-ti-400">รองรับทั้ง QR Code, Code 128 และบาร์โค้ดเนมเพลตมาตรฐาน</p>
          </div>
        )}
      </div>
    </dialog>
  );
}
