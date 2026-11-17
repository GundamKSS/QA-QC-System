"use client";

import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { cameraProblem, openRearCamera, scanMessages } from "@/lib/scan/camera";
import { createQrDetector, type QrDetector } from "@/lib/scan/detector";

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

type Status = { kind: "starting" } | { kind: "scanning"; note: string | null } | { kind: "error"; message: string };

/** About 8 frames a second: quick enough to feel instant, light enough for a budget phone running WebAssembly. */
const SCAN_EVERY_MS = 125;

/**
 * Full-screen camera that reads one QR code and hands its text back (docs/04 "สแกน", docs/09 §3.2: no tab bar while
 * the camera is up). Mounted means open: the parent renders it only while scanning, and unmounting turns the camera off.
 */
export function CameraScanDialog({ title, hint, check, onRead, onClose }: Props) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "starting" });
  const [attempt, setAttempt] = useState(0);
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
                stop();
                read(text);
              }
              return;
            }
            note ??= answer;
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

  function retry() {
    setStatus({ kind: "starting" });
    setAttempt((count) => count + 1);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        // Escape closes through the parent, so the camera stops with the dialog.
        event.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-black p-0 text-white backdrop:bg-black"
    >
      <video ref={videoRef} muted playsInline autoPlay aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
      {/* Aiming frame: white line with a dark ring so it shows on a white sticker too. No box-shadow — a 100vmax one
          to dim the surroundings painted the frame's inside white over the video in Chrome. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(72vw,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-panel border-[3px] border-white outline-2 outline-black/60"
      />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
        <h2 id={`${id}-title`} className="text-base font-medium">{title}</h2>
        <button type="button" onClick={onClose} className="h-11 shrink-0 rounded-control border border-white/50 px-4 text-sm transition-colors hover:bg-white/10">
          ปิด
        </button>
      </div>
      <div className="absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-black/80 to-transparent px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-12 text-center">
        {status.kind === "error" ? (
          <>
            <p role="alert" className="text-sm text-red-200">{status.message}</p>
            <button type="button" onClick={retry} className="h-11 rounded-control bg-white px-5 text-sm font-semibold text-black">
              ลองอีกครั้ง
            </button>
          </>
        ) : (
          <p role="status" className={`text-sm ${status.kind === "scanning" && status.note ? "text-amber-200" : "text-white/90"}`}>
            {status.kind === "starting" ? "กำลังเปิดกล้อง…" : (status.note ?? hint)}
          </p>
        )}
      </div>
    </dialog>
  );
}
