"use client";

import { useRef } from "react";
import type { InspectionPhoto, InspectionVideo } from "@/lib/inspections/types";

type Props = {
  photos: readonly InspectionPhoto[];
  video?: InspectionVideo | null;
  missingNotes: readonly string[];
  requiresVideo: boolean;
  onPhotosChange: (photos: InspectionPhoto[]) => void;
  onVideoChange: (video: InspectionVideo | null) => void;
};

/**
 * Screen S06 Evidence Capture: Camera photo and video attachment conforming to BR-05.
 */
export function EvidenceCapture({
  photos,
  video,
  missingNotes,
  requiresVideo,
  onPhotosChange,
  onVideoChange,
}: Props) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  function handlePhotoSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const uri = typeof reader.result === "string" ? reader.result : "";
      if (uri) {
        const newPhoto: InspectionPhoto = {
          id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          uri,
          timestamp: new Date().toISOString(),
        };
        onPhotosChange([...photos, newPhoto]);
      }
    };
    reader.readAsDataURL(file);
    // Reset input so taking the same file again still fires onChange
    event.target.value = "";
  }

  function handleRemovePhoto(index: number) {
    onPhotosChange(photos.filter((_, i) => i !== index));
  }

  function handleVideoSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    // In browser, create a local object URL for preview
    const uri = URL.createObjectURL(file);
    const newVideo: InspectionVideo = {
      id: `video-${Date.now()}`,
      uri,
      durationSeconds: 10, // default placeholder duration if not measured
    };
    onVideoChange(newVideo);
    event.target.value = "";
  }

  function handleRemoveVideo() {
    onVideoChange(null);
  }

  return (
    <div className="rounded-panel border border-carbon-700 bg-carbon-800/80 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-ti-200">
          หลักฐานภาพถ่ายและวิดีโอ
        </h4>
        <span className="text-[11px] font-mono text-ti-400">
          รูป {photos.length} · วิดีโอ {video ? 1 : 0}
        </span>
      </div>

      {/* Missing evidence alert banner */}
      {missingNotes.length > 0 && (
        <div
          role="alert"
          className="rounded-control border border-fail/50 bg-fail/10 p-2.5 text-xs text-fail space-y-1"
        >
          <span className="block font-medium">ยังขาดหลักฐานบังคับตามกฎ BR-05:</span>
          <ul className="list-disc list-inside space-y-0.5 text-[11px]">
            {missingNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {/* Hidden File Inputs */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoSelected}
          className="hidden"
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          capture="environment"
          onChange={handleVideoSelected}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          className="h-10 rounded-control border border-ti-600 bg-carbon-700 px-4 text-xs font-medium text-ti-100 hover:border-ti-400 hover:bg-carbon-600 transition-colors"
        >
          ถ่ายรูป
        </button>

        {requiresVideo && !video && (
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="h-10 rounded-control border border-ember-500/60 bg-ember-950/20 px-4 text-xs font-medium text-ember-300 hover:bg-ember-950/40 transition-colors"
          >
            ถ่ายวิดีโอ (≤ 20 วิ)
          </button>
        )}
      </div>

      {/* Captured Photos Preview Grid */}
      {photos.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <span className="text-[11px] text-ti-400">รูปภาพ ({photos.length}):</span>
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
                  className="absolute top-1 right-1 size-6 rounded-full bg-black/70 text-ti-200 text-xs flex items-center justify-center hover:bg-fail hover:text-white transition-colors"
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
            <span className="font-medium text-ti-100">วิดีโอหลักฐาน</span>
            <span className="block text-[11px] font-mono text-ti-400">
              ความยาว {video.durationSeconds} วินาที
            </span>
          </div>
          <button
            type="button"
            onClick={handleRemoveVideo}
            className="h-8 rounded-control border border-carbon-700 bg-carbon-800 px-2.5 text-xs text-fail hover:bg-carbon-700 transition-colors"
          >
            ลบวิดีโอ
          </button>
        </div>
      )}
    </div>
  );
}
