"use client";

import React, { useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  ExternalLink,
  Flame,
  Loader2,
  MoveHorizontal,
  Sparkles,
  Type,
  X,
} from "lucide-react";
import {
  AspectRatio,
  CaptionColor,
  CaptionPosition,
  CaptionStyle,
  GeneratedClip,
} from "@/types/clipforge";
import { VerticalClipPlayer } from "./VerticalClipPlayer";
import { buildWordTokensFromText, formatTimecode } from "@/lib/demo-data";
import { renderAndDownloadClip } from "@/lib/clip-exporter";

interface ClipCardProps {
  clip: GeneratedClip;
  index: number;
  aspectRatio: AspectRatio;
  autoFaceTracking: boolean;
  onUpdateClip: (updated: GeneratedClip) => void;
  onNotify: (message: string) => void;
}

const COLOR_OPTIONS: Array<{ value: CaptionColor; label: string }> = [
  { value: "#10B981", label: "Emerald" },
  { value: "#FACC15", label: "Electric Yellow" },
  { value: "#F8FAFC", label: "Crisp White" },
  { value: "#A78BFA", label: "Violet" },
];

export function ClipCard({
  clip,
  index,
  aspectRatio,
  autoFaceTracking,
  onUpdateClip,
  onNotify,
}: ClipCardProps) {
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportPercent, setExportPercent] = useState(0);
  const [exportStage, setExportStage] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const transcriptId = useId();
  const styleSelectId = useId();
  const cropPanId = useId();

  const handleTranscriptChange = (nextText: string) => {
    const nextWords = buildWordTokensFromText(nextText, clip.duration);
    onUpdateClip({
      ...clip,
      transcriptText: nextText,
      words: nextWords,
    });
  };

  const handleCopyTitleAndHashtags = async () => {
    const payload = `${clip.title}\n\n${clip.hashtags.join(" ")}`;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      onNotify(`Copied title & hashtags for Clip #${index + 1}`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onNotify("Clipboard permission unavailable — select text to copy.");
    }
  };

  const handleCancelExport = () => {
    exportAbortRef.current?.abort();
  };

  const handleDownloadClip = async () => {
    setExportError(null);

    // 1. If connected to FastAPI backend with real rendered MP4
    if (clip.downloadUrl) {
      const link = document.createElement("a");
      link.href = clip.downloadUrl;
      link.download = `${clip.id}-clipforge.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      onNotify(`Downloading HD MP4 for "${clip.title}"`);
      return;
    }

    // 2. Real browser-side video + audio + synced caption export
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setIsExporting(true);
    setExportPercent(2);
    setExportStage("Preparing video...");

    try {
      const result = await renderAndDownloadClip({
        clip,
        aspectRatio,
        signal: controller.signal,
        onProgress: (pct, stage) => {
          setExportPercent(pct);
          setExportStage(stage);
        },
      });
      onNotify(
        `Downloaded ${result.filename} (${result.durationSeconds}s video with audio & captions)`
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        onNotify("Video export canceled.");
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : "Failed to export video clip. Please try again.";
      setExportError(message);
      onNotify(message);
    } finally {
      exportAbortRef.current = null;
      setIsExporting(false);
      setExportPercent(0);
      setExportStage("");
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.08 }}
      className="cf-card cf-card-accent flex flex-col gap-5 p-5 sm:p-6 lg:flex-row"
    >
      {/* Left: 9:16 Vertical Player Preview */}
      <div className="shrink-0 lg:w-[270px]">
        <VerticalClipPlayer
          clip={clip}
          aspectRatio={aspectRatio}
          autoFaceTracking={autoFaceTracking}
        />
      </div>

      {/* Right: Metadata, Score, AI Rationale & Caption Editor */}
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-4">
        <div>
          {/* Top Row: Clip Index + Emerald Virality Score */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#94A3B8]">
              Short #{index + 1} • {formatTimecode(clip.startTime)}–
              {formatTimecode(clip.endTime)} ({clip.duration}s)
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#10B981]/40 bg-[#10B981]/15 px-3 py-1 text-xs font-bold text-[#34D399]">
              <Flame className="h-3.5 w-3.5 text-[#10B981]" aria-hidden="true" />
              {clip.viralityScore}/100 Viral Potential
            </span>
          </div>

          <h3 className="mt-2.5 text-lg font-extrabold tracking-tight text-[#F8FAFC] sm:text-xl">
            {clip.title}
          </h3>

          {/* AI Hook Reason */}
          <div className="mt-3 rounded-xl border border-[#26324D] bg-[#0D1117]/75 p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#10B981]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Why This Hook Works
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[#CBD5E1]">
              {clip.hookReason}
            </p>
          </div>

          {/* Editable Transcript / Caption Box */}
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={transcriptId}
                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#94A3B8]"
              >
                <Type className="h-3.5 w-3.5 text-[#10B981]" aria-hidden="true" />
                Live Transcript &amp; Captions
              </label>
              <span className="text-[11px] text-[#94A3B8]">
                Edits sync instantly to player
              </span>
            </div>
            <textarea
              id={transcriptId}
              rows={3}
              value={clip.transcriptText}
              onChange={(e) => handleTranscriptChange(e.target.value)}
              className="mt-1.5 w-full resize-y rounded-xl border border-[#26324D] bg-[#0D1117]/90 px-3.5 py-2.5 text-xs leading-relaxed text-[#F8FAFC] transition focus:border-[#10B981]"
            />
          </div>

          {/* Caption Style, Color & Position Controls */}
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[#26324D] bg-[#0D1117]/55 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <label
                htmlFor={styleSelectId}
                className="text-[11px] font-semibold text-[#94A3B8]"
              >
                Style
              </label>
              <select
                id={styleSelectId}
                value={clip.captionStyle}
                onChange={(e) =>
                  onUpdateClip({
                    ...clip,
                    captionStyle: e.target.value as CaptionStyle,
                  })
                }
                className="rounded-lg border border-[#26324D] bg-[#161F33] px-2 py-1 text-xs font-semibold text-[#F8FAFC]"
              >
                <option value="hormozi">Hormozi Bold</option>
                <option value="minimal">Minimal Clean</option>
                <option value="karaoke">Karaoke Highlight</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5" role="group" aria-label="Caption accent color">
              <span className="text-[11px] font-semibold text-[#94A3B8]">
                Color
              </span>
              {COLOR_OPTIONS.map((c) => {
                const active = clip.captionColor === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() =>
                      onUpdateClip({ ...clip, captionColor: c.value })
                    }
                    aria-label={`Set caption color to ${c.label}`}
                    aria-pressed={active}
                    style={{ backgroundColor: c.value }}
                    className={`h-5 w-5 rounded-full border transition ${
                      active
                        ? "scale-110 border-white ring-2 ring-[#10B981] ring-offset-2 ring-offset-[#0D1117]"
                        : "border-[#26324D] opacity-80 hover:opacity-100"
                    }`}
                  />
                );
              })}
            </div>

            <div className="flex items-center gap-1" role="group" aria-label="Caption vertical position">
              <span className="mr-1 text-[11px] font-semibold text-[#94A3B8]">
                Pos
              </span>
              {(["bottom", "center", "upper"] as CaptionPosition[]).map(
                (pos) => {
                  const active = clip.captionPosition === pos;
                  return (
                    <button
                      key={pos}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        onUpdateClip({ ...clip, captionPosition: pos })
                      }
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize transition ${
                        active
                          ? "bg-[#10B981]/20 text-[#34D399]"
                          : "text-[#94A3B8] hover:bg-[#161F33] hover:text-[#F8FAFC]"
                      }`}
                    >
                      {pos}
                    </button>
                  );
                }
              )}
            </div>

            {(clip.youtubeVideoId || clip.videoUrl) && (
              <div className="flex items-center gap-2">
                <label
                  htmlFor={cropPanId}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[#94A3B8]"
                >
                  <MoveHorizontal className="h-3 w-3 text-[#10B981]" aria-hidden="true" />
                  Crop X
                </label>
                <input
                  id={cropPanId}
                  type="range"
                  min={-50}
                  max={50}
                  step={5}
                  value={clip.cropPanX ?? 0}
                  onChange={(e) =>
                    onUpdateClip({
                      ...clip,
                      cropPanX: Number(e.target.value),
                    })
                  }
                  className="h-1.5 w-20 cursor-pointer accent-[#10B981]"
                />
              </div>
            )}
          </div>
        </div>

        {/* Bottom Hashtags & Export Actions */}
        <div className="border-t border-[#26324D]/80 pt-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {clip.hashtags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-[#26324D] bg-[#0D1117]/80 px-2 py-0.5 text-[11px] font-medium text-[#94A3B8]"
                >
                  {tag}
                </span>
              ))}
            </div>

            {clip.youtubeVideoId && (
              <a
                href={`https://youtu.be/${clip.youtubeVideoId}?t=${Math.floor(clip.startTime)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#34D399] hover:underline"
              >
                Jump to {formatTimecode(clip.startTime)}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            )}
          </div>

          {exportError && (
            <div
              role="alert"
              className="mb-3 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" aria-hidden="true" />
              <span>{exportError}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleDownloadClip}
              disabled={isExporting}
              className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-2 text-xs font-extrabold text-[#042117] transition hover:bg-[#34D399] disabled:opacity-75"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              {isExporting
                ? exportStage || `Rendering ${exportPercent}%...`
                : "Download Short"}
            </button>

            {isExporting && (
              <button
                type="button"
                onClick={handleCancelExport}
                aria-label="Cancel video rendering"
                className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-[#26324D] bg-[#0D1117]/90 px-3 py-2 text-xs font-semibold text-[#F8FAFC] transition hover:border-red-400/60 hover:text-red-300"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Cancel
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyTitleAndHashtags}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-[#26324D] bg-[#0D1117]/90 px-4 py-2 text-xs font-semibold text-[#F8FAFC] transition hover:border-[#3B82F6]/60 hover:bg-[#1C2740]"
            >
              {copied ? (
                <Check className="h-4 w-4 text-[#10B981]" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4 text-[#94A3B8]" aria-hidden="true" />
              )}
              {copied ? "Copied!" : "Copy Title & Hashtags"}
            </button>
          </div>
        </div>
      </div>
    </motion.article>
  );
                    }
