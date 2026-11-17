"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { InspectionPhoto, InspectionVideo } from "@/lib/inspections/types";
import { InsecureContextError, cameraProblem } from "@/lib/scan/camera";

type Props = {
  photos: readonly InspectionPhoto[];
  video?: InspectionVideo | null;
  missingNotes: readonly string[];
  requiresPhoto?: boolean;
  hidePhotoCapture?: boolean;
  requiresVideo: boolean;
  onPhotosChange: (photos: InspectionPhoto[]) => void;
  onVideoChange: (video: InspectionVideo | null) => void;
};

type CameraMode = "PHOTO" | "VIDEO" | null;
export type FacingMode = "environment" | "user";

export const MAX_VIDEO_SECONDS = 20;

/**
 * Open live camera stream with fallback for desktop/laptop webcams.
 * Never opens a file picker — strictly enforces live camera capture (BR-05).
 */
export async function openLiveCameraStream(facingMode: FacingMode): Promise<MediaStream> {
  if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new InsecureContextError();
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  } catch {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: true,
    });
  }
}

/**
 * Screen S06 Evidence Capture (BR-05):
 * Strictly enforces live camera capture via WebRTC (`getUserMedia`) when an item fails.
 * File attachment (`<input type="file">`) is intentionally prohibited.
 */
export function EvidenceCapture({
  photos,
  video,
  missingNotes,
  requiresPhoto = false,
  hidePhotoCapture = false,
  requiresVideo,
  onPhotosChange,
  onVideoChange,
}: Props) {
  const [cameraMode, setCameraMode] = useState<CameraMode>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopCameraStream = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        // Ignore stop errors on cleanup
      }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
    setCameraReady(false);
    setIsRecording(false);
    setRecordingSeconds(0);
  }, []);

  const startCamera = useCallback(
    async (mode: Exclude<CameraMode, null>, facing: FacingMode) => {
      stopCameraStream();
      setCameraError(null);
      setCameraMode(mode);

      try {
        const stream = await openLiveCameraStream(facing);
        streamRef.current = stream;
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream;
          await videoPreviewRef.current.play().catch(() => {});
        }
        setCameraReady(true);
      } catch (err) {
        setCameraError(cameraProblem(err));
      }
    },
    [stopCameraStream],
  );

  useEffect(() => {
    if (cameraMode && streamRef.current && videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = streamRef.current;
      void videoPreviewRef.current.play().catch(() => {});
    }
  }, [cameraMode, cameraReady]);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  function handleCloseCamera() {
    stopCameraStream();
    setCameraMode(null);
    setCameraError(null);
  }

  function handleSwitchFacing() {
    if (!cameraMode || isRecording) return;
    const nextFacing: FacingMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextFacing);
    void startCamera(cameraMode, nextFacing);
  }

  function handleSnapPhoto() {
    const videoEl = videoPreviewRef.current;
    if (!videoEl || !cameraReady) return;

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
      sw = rawH * containerRatio;
      sx = (rawW - sw) / 2;
    } else {
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

    const newPhoto: InspectionPhoto = {
      id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      uri,
      timestamp: new Date().toISOString(),
    };
    onPhotosChange([...photos, newPhoto]);
    handleCloseCamera();
  }

  function handleStartVideoRecording() {
    const stream = streamRef.current;
    if (!stream || !cameraReady || isRecording) return;

    recordedChunksRef.current = [];
    recordStartRef.current = Date.now();
    setRecordingSeconds(0);

    try {
      const preferredMime =
        typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
          ? "video/webm;codecs=vp8"
          : typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported("video/mp4")
          ? "video/mp4"
          : undefined;

      const recorder = new MediaRecorder(
        stream,
        preferredMime
          ? { mimeType: preferredMime, videoBitsPerSecond: 450_000 }
          : { videoBitsPerSecond: 450_000 },
      );
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const elapsed = Math.min(
          MAX_VIDEO_SECONDS,
          Math.max(1, Math.round((Date.now() - recordStartRef.current) / 1000)),
        );
        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || "video/webm",
        });
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = typeof reader.result === "string" ? reader.result : "";
          if (dataUrl) {
            onVideoChange({
              id: `video-${Date.now()}`,
              uri: dataUrl,
              durationSeconds: elapsed,
            });
          }
          stopCameraStream();
          setCameraMode(null);
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(250);
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        const sec = Math.floor((Date.now() - recordStartRef.current) / 1000);
        setRecordingSeconds(sec);
        if (sec >= MAX_VIDEO_SECONDS && recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
        }
      }, 250);
    } catch {
      setCameraError("อุปกรณ์นี้ไม่รองรับการอัดวิดีโอจากเบราว์เซอร์โดยตรง");
    }
  }

  function handleStopVideoRecording() {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
  }

  function handleRemovePhoto(index: number) {
    onPhotosChange(photos.filter((_, i) => i !== index));
  }

  function handleRemoveVideo() {
    onVideoChange(null);
  }

  return (
    <div className="rounded-panel border border-carbon-700 bg-carbon-900/60 p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-xs font-semibold text-ti-200">
            {hidePhotoCapture
              ? "หลักฐานวิดีโอจากกล้องสด (≤ 20 วินาที)"
              : "หลักฐานจากกล้องสด (รูปถ่าย / วิดีโอ)"}
          </h4>
          {requiresPhoto && !hidePhotoCapture && (
            <span className="rounded bg-fail/15 border border-fail/40 px-1.5 py-0.5 text-[10px] font-medium text-fail">
              บังคับเปิดกล้องถ่าย
            </span>
          )}
        </div>
        <span className="text-[11px] font-mono text-ti-400 shrink-0">
          {hidePhotoCapture ? `วิดีโอ ${video ? 1 : 0}` : `รูป ${photos.length} · วิดีโอ ${video ? 1 : 0}`}
        </span>
      </div>

      {/* Camera-only rule notice */}
      {!hidePhotoCapture && (
        <p className="text-[11px] text-ti-400">
          ระบบบังคับเปิดกล้องถ่ายสดหน้างานเท่านั้น (ไม่อนุญาตให้แนบไฟล์ภาพหรือวิดีโอจากเครื่อง)
        </p>
      )}

      {/* Missing evidence alert banner */}
      {missingNotes.length > 0 && (
        <div
          role="alert"
          className="rounded-control border border-fail/50 bg-fail/10 p-2.5 text-xs text-fail space-y-1"
        >
          <span className="block font-medium">ยังขาดหลักฐาน:</span>
          <ul className="list-disc list-inside space-y-0.5 text-[11px]">
            {missingNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Buttons: Open Live Camera Only (No <input type="file">) */}
      {!cameraMode && (
        <div className="flex flex-wrap gap-2">
          {!hidePhotoCapture && (
            <button
              type="button"
              onClick={() => void startCamera("PHOTO", facingMode)}
              className={`flex-1 sm:flex-none inline-flex h-11 items-center justify-center gap-2 rounded-control border px-4 text-xs font-semibold transition-colors cursor-pointer ${
                requiresPhoto && photos.length === 0
                  ? "border-ember-500 bg-ember-500/20 text-ember-300 hover:bg-ember-500/30"
                  : "border-ti-600 bg-carbon-800 text-ti-100 hover:border-ti-400 hover:bg-carbon-700"
              }`}
            >
              <span aria-hidden="true">📷</span>
              <span>เปิดกล้องถ่ายรูป ({photos.length})</span>
            </button>
          )}

          {(requiresVideo || !video) && (
            <button
              type="button"
              onClick={() => void startCamera("VIDEO", facingMode)}
              className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-control border px-3.5 text-xs font-medium transition-colors cursor-pointer ${
                requiresVideo && !video
                  ? "border-ember-500/70 bg-ember-950/30 text-ember-300 hover:bg-ember-950/50"
                  : "border-carbon-600 bg-carbon-800 text-ti-300 hover:border-carbon-500"
              }`}
            >
              <span aria-hidden="true">🎥</span>
              <span>เปิดกล้องถ่ายวิดีโอ {requiresVideo ? "*" : ""}</span>
            </button>
          )}
        </div>
      )}

      {/* Live WebRTC Camera Viewfinder */}
      {cameraMode && (
        <div className="rounded-2xl border border-ember-500/50 bg-carbon-950 p-3 space-y-3 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-ember-300">
              {cameraMode === "PHOTO"
                ? "📷 กล้องถ่ายรูปหลักฐานสด"
                : `🎥 กล้องถ่ายวิดีโอสด (${recordingSeconds} / ${MAX_VIDEO_SECONDS} วินาที)`}
            </span>
            <div className="flex items-center gap-1.5">
              {!isRecording && (
                <button
                  type="button"
                  onClick={handleSwitchFacing}
                  className="rounded-control border border-carbon-600 bg-carbon-800 px-2.5 py-1 text-[11px] text-ti-200 hover:border-carbon-500"
                >
                  สลับกล้อง
                </button>
              )}
              <button
                type="button"
                onClick={handleCloseCamera}
                className="rounded-control border border-carbon-600 bg-carbon-800 px-2.5 py-1 text-[11px] text-ti-300 hover:border-fail hover:text-fail"
              >
                ปิดกล้อง
              </button>
            </div>
          </div>

          {cameraError ? (
            <div className="rounded-control border border-fail/50 bg-fail/10 p-3 text-xs text-fail space-y-2 text-center">
              <p>{cameraError}</p>
              <button
                type="button"
                onClick={() => void startCamera(cameraMode, facingMode)}
                className="rounded-control border border-fail/60 bg-carbon-900 px-3 py-1.5 text-xs font-semibold text-ti-100 hover:bg-carbon-800"
              >
                ลองเปิดกล้องอีกครั้ง
              </button>
            </div>
          ) : (
            <>
              <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-carbon-700 bg-black flex items-center justify-center">
                <video
                  ref={videoPreviewRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />
                {!cameraReady && (
                  <span className="absolute text-xs text-ti-400">
                    กำลังเปิดกล้อง…
                  </span>
                )}
                {isRecording && (
                  <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-fail/90 px-2.5 py-1 text-[11px] font-mono font-bold text-white shadow">
                    <span className="size-2 rounded-full bg-white animate-ping" />
                    <span>REC {recordingSeconds}s</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center">
                {cameraMode === "PHOTO" ? (
                  <button
                    type="button"
                    disabled={!cameraReady}
                    onClick={handleSnapPhoto}
                    className="h-11 w-full rounded-control bg-ember-500 hover:bg-ember-400 disabled:opacity-50 text-carbon-950 font-bold text-xs sm:text-sm transition-colors shadow-sm cursor-pointer"
                  >
                    📸 กดชัตเตอร์ถ่ายรูป
                  </button>
                ) : !isRecording ? (
                  <button
                    type="button"
                    disabled={!cameraReady}
                    onClick={handleStartVideoRecording}
                    className="h-11 w-full rounded-control bg-fail hover:bg-fail/90 disabled:opacity-50 text-white font-bold text-xs sm:text-sm transition-colors shadow-sm cursor-pointer"
                  >
                    ⏺ เริ่มถ่ายวิดีโอ (สูงสุด {MAX_VIDEO_SECONDS} วินาที)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopVideoRecording}
                    className="h-11 w-full rounded-control bg-ember-500 hover:bg-ember-400 text-carbon-950 font-bold text-xs sm:text-sm transition-colors shadow-sm cursor-pointer"
                  >
                    ⏹ หยุดและบันทึกวิดีโอ ({recordingSeconds} วินาที)
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Captured Photos Preview Grid */}
      {!hidePhotoCapture && photos.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {photos.map((photo, idx) => (
              <div
                key={photo.id ?? idx}
                className="relative aspect-square rounded-control border border-carbon-600 overflow-hidden bg-carbon-900 group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.uri}
                  alt={`หลักฐาน ${idx + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemovePhoto(idx)}
                  className="absolute top-1 right-1 size-6 rounded-full bg-black/75 text-ti-100 text-xs flex items-center justify-center hover:bg-fail hover:text-white transition-colors"
                  title="ลบรูปนี้"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Captured Video Preview */}
      {video && (
        <div className="flex items-center justify-between rounded-control border border-carbon-600 bg-carbon-900 p-2.5 text-xs">
          <div className="space-y-0.5">
            <span className="font-medium text-ti-100">วิดีโอจากกล้องบันทึกแล้ว</span>
            <span className="block text-[11px] font-mono text-ti-400">
              {video.durationSeconds} วินาที
            </span>
          </div>
          <button
            type="button"
            onClick={handleRemoveVideo}
            className="rounded border border-carbon-600 px-2.5 py-1 text-[11px] text-ti-300 hover:border-fail hover:text-fail transition-colors"
          >
            ลบ
          </button>
        </div>
      )}
    </div>
  );
}
