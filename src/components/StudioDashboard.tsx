"use client";

import React, { useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  FileVideo,
  Link2,
  ScanFace,
  Sparkles,
  UploadCloud,
  X,
  Youtube,
} from "lucide-react";
import {
  AspectRatio,
  CaptionStyle,
  ClipLengthPref,
  GenerationSettings,
} from "@/types/clipforge";
import { SAMPLE_VIDEO_PRESETS } from "@/lib/demo-data";

interface StudioDashboardProps {
  youtubeUrl: string;
  onYoutubeUrlChange: (url: string) => void;
  selectedFile: File | null;
  onFileSelect: (file: File | null) => void;
  settings: GenerationSettings;
  onSettingsChange: (next: GenerationSettings) => void;
  backendOnline: boolean;
  errorMessage: string | null;
  onGenerate: () => void;
}

export function StudioDashboard({
  youtubeUrl,
  onYoutubeUrlChange,
  selectedFile,
  onFileSelect,
  settings,
  onSettingsChange,
  backendOnline,
  errorMessage,
  onGenerate,
}: StudioDashboardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const urlInputId = useId();
  const fileInputId = useId();
  const faceToggleId = useId();

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && /\.(mp4|mov|webm|mkv)$/i.test(file.name)) {
      onFileSelect(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    onFileSelect(file);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const canSubmit = youtubeUrl.trim().length > 0 || selectedFile !== null;

  return (
    <main
      id="main-content"
      className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 py-10 sm:px-6 sm:py-14"
    >
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full"
      >
        <div className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#10B981]">
            AI-POWERED SHORT-FORM CLIP GENERATOR
          </p>
          <h1 className="mt-2.5 text-2xl font-extrabold tracking-tight text-[#F8FAFC] sm:text-4xl">
            Drop a video. Extract viral moments.
          </h1>
          <p className="mx-auto mt-2.5 max-w-xl text-sm text-[#94A3B8]">
            {backendOnline
              ? "FastAPI FFmpeg worker connected — videos are downloaded, transcribed, face-cropped, and rendered to 1080p MP4."
              : "Paste any YouTube link to extract its real transcript, detect the highest-retention viral moments, and preview synced 9:16 shorts."}
          </p>
        </div>

        {/* Central Hero Input Card */}
        <section
          aria-labelledby="studio-input-heading"
          className="cf-card cf-card-accent p-5 sm:p-8"
        >
          <h2 id="studio-input-heading" className="sr-only">
            Video Source and Clip Settings
          </h2>

          {/* YouTube URL Input */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor={urlInputId}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#94A3B8]"
              >
                <Youtube className="h-4 w-4 text-[#10B981]" aria-hidden="true" />
                Paste YouTube Video URL
              </label>
              <span className="text-xs text-[#94A3B8]">
                Supports podcasts, interviews, keynotes
              </span>
            </div>

            <div className="relative mt-2.5 flex items-center">
              <Link2
                className="pointer-events-none absolute left-3.5 h-4 w-4 text-[#94A3B8]"
                aria-hidden="true"
              />
              <input
                id={urlInputId}
                type="url"
                value={youtubeUrl}
                onChange={(e) => {
                  onYoutubeUrlChange(e.target.value);
                  if (e.target.value.trim()) onFileSelect(null);
                }}
                placeholder="https://www.youtube.com/watch?v=..."
                className="min-h-[48px] w-full rounded-xl border border-[#26324D] bg-[#0D1117]/90 py-3 pl-10 pr-24 text-sm text-[#F8FAFC] placeholder:text-[#64748B] transition focus:border-[#10B981]"
              />
              {youtubeUrl && (
                <button
                  type="button"
                  onClick={() => onYoutubeUrlChange("")}
                  aria-label="Clear YouTube URL"
                  className="absolute right-3 inline-flex items-center gap-1 rounded-lg border border-[#26324D] bg-[#161F33] px-2.5 py-1 text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear
                </button>
              )}
            </div>

            {/* 1-Click Sample Presets */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-[#94A3B8]">
                Quick samples:
              </span>
              {SAMPLE_VIDEO_PRESETS.map((preset) => {
                const isActive = youtubeUrl === preset.url;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onFileSelect(null);
                      onYoutubeUrlChange(preset.url);
                    }}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      isActive
                        ? "border-[#10B981]/60 bg-[#10B981]/15 text-[#34D399]"
                        : "border-[#26324D] bg-[#0D1117]/60 text-[#94A3B8] hover:border-[#3B82F6]/50 hover:text-[#F8FAFC]"
                    }`}
                  >
                    {preset.label} ({preset.durationLabel})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-[#64748B]">
            <div className="h-px flex-1 bg-[#26324D]" />
            <span>or upload local video</span>
            <div className="h-px flex-1 bg-[#26324D]" />
          </div>

          {/* Drag-and-Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`relative rounded-xl border-2 border-dashed p-5 text-center transition ${
              isDragging
                ? "border-[#10B981] bg-[#10B981]/10"
                : selectedFile
                ? "border-[#10B981]/50 bg-[#0D1117]/80"
                : "border-[#26324D] bg-[#0D1117]/60 hover:border-[#3B82F6]/60"
            }`}
          >
            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              accept=".mp4,.mov,.webm,.mkv,video/mp4,video/quicktime"
              onChange={handleFileChange}
              className="visually-hidden"
            />

            {selectedFile ? (
              <div className="flex flex-wrap items-center justify-between gap-3 text-left">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#10B981]/15 text-[#10B981]">
                    <FileVideo className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#F8FAFC]">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-[#94A3B8]">
                      {formatBytes(selectedFile.size)} • Ready for AI hook
                      detection
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onFileSelect(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[#26324D] bg-[#161F33] px-3 py-1.5 text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Remove
                </button>
              </div>
            ) : (
              <label
                htmlFor={fileInputId}
                className="flex cursor-pointer flex-col items-center gap-2 py-2"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#26324D] bg-[#161F33] text-[#10B981]">
                  <UploadCloud className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="text-sm font-semibold text-[#F8FAFC]">
                  Drag &amp; drop an MP4 or MOV file, or{" "}
                  <span className="text-[#34D399] underline underline-offset-4">
                    browse files
                  </span>
                </div>
                <p className="text-xs text-[#94A3B8]">
                  Up to 2 GB • Automatic 9:16 speaker framing &amp; audio
                  normalization
                </p>
              </label>
            )}
          </div>

          {/* Quick Settings Row */}
          <div className="mt-6 grid grid-cols-1 gap-4 rounded-xl border border-[#26324D] bg-[#0D1117]/65 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Aspect Ratio */}
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-[#94A3B8]">
                Aspect Ratio
              </span>
              <div
                className="mt-2 grid grid-cols-2 gap-1.5"
                role="group"
                aria-label="Aspect Ratio"
              >
                {(
                  [
                    { value: "9:16", label: "9:16 Vertical" },
                    { value: "1:1", label: "1:1 Square" },
                  ] as Array<{ value: AspectRatio; label: string }>
                ).map((opt) => {
                  const active = settings.aspectRatio === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        onSettingsChange({ ...settings, aspectRatio: opt.value })
                      }
                      className={`min-h-[36px] rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "border-[#10B981]/70 bg-[#10B981]/15 text-[#34D399]"
                          : "border-[#26324D] bg-[#161F33] text-[#94A3B8] hover:text-[#F8FAFC]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Clip Length */}
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-[#94A3B8]">
                Clip Length
              </span>
              <div
                className="mt-2 grid grid-cols-2 gap-1.5"
                role="group"
                aria-label="Clip Length"
              >
                {(
                  [
                    { value: "auto", label: "Auto (30-60s)" },
                    { value: "under30", label: "Under 30s" },
                  ] as Array<{ value: ClipLengthPref; label: string }>
                ).map((opt) => {
                  const active = settings.clipLength === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        onSettingsChange({ ...settings, clipLength: opt.value })
                      }
                      className={`min-h-[36px] rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "border-[#10B981]/70 bg-[#10B981]/15 text-[#34D399]"
                          : "border-[#26324D] bg-[#161F33] text-[#94A3B8] hover:text-[#F8FAFC]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Caption Style */}
            <div>
              <label
                htmlFor="caption-style-select"
                className="block text-[11px] font-bold uppercase tracking-[0.14em] text-[#94A3B8]"
              >
                Caption Style
              </label>
              <select
                id="caption-style-select"
                value={settings.captionStyle}
                onChange={(e) =>
                  onSettingsChange({
                    ...settings,
                    captionStyle: e.target.value as CaptionStyle,
                  })
                }
                className="mt-2 min-h-[36px] w-full rounded-lg border border-[#26324D] bg-[#161F33] px-2.5 py-1.5 text-xs font-semibold text-[#F8FAFC] transition focus:border-[#10B981]"
              >
                <option value="hormozi">Hormozi Bold</option>
                <option value="minimal">Minimal Clean</option>
                <option value="karaoke">Karaoke Highlight</option>
              </select>
            </div>

            {/* AI Auto-Face Tracking Switch */}
            <div className="flex flex-col justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#94A3B8]">
                <ScanFace
                  className="h-3.5 w-3.5 text-[#10B981]"
                  aria-hidden="true"
                />
                AI Face Tracking
              </span>
              <label
                htmlFor={faceToggleId}
                className="mt-2 flex min-h-[36px] cursor-pointer items-center justify-between rounded-lg border border-[#26324D] bg-[#161F33] px-3 py-1.5"
              >
                <span className="text-xs font-semibold text-[#F8FAFC]">
                  {settings.autoFaceTracking ? "Auto-Track On" : "Center Crop"}
                </span>
                <span className="relative inline-flex items-center">
                  <input
                    id={faceToggleId}
                    type="checkbox"
                    role="switch"
                    checked={settings.autoFaceTracking}
                    onChange={(e) =>
                      onSettingsChange({
                        ...settings,
                        autoFaceTracking: e.target.checked,
                      })
                    }
                    className="cf-switch peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className="h-5 w-9 rounded-full border border-[#3B4C70] bg-[#0D1117] transition peer-checked:border-[#10B981] peer-checked:bg-[#10B981] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#34D399]"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-0.5 h-4 w-4 rounded-full bg-[#F8FAFC] shadow transition-transform peer-checked:translate-x-4"
                  />
                </span>
              </label>
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs font-medium text-rose-200"
            >
              {errorMessage}
            </div>
          )}

          {/* Primary CTA */}
          <div className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs text-[#94A3B8]">
              Generates <strong className="text-[#F8FAFC]">3–5 clips</strong>{" "}
              with virality scores, hook explanations &amp; editable captions.
            </p>
            <button
              type="button"
              onClick={onGenerate}
              disabled={!canSubmit}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-6 py-3 text-sm font-extrabold tracking-tight text-[#042117] shadow-glow transition hover:bg-[#34D399] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Generate Viral Shorts ✨
            </button>
          </div>
        </section>
      </motion.div>
    </main>
  );
}
