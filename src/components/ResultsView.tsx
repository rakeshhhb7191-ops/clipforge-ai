"use client";

import React, { useMemo, useState } from "react";
import { ArrowLeft, ArrowUpDown, CheckCircle2, Film } from "lucide-react";
import { AspectRatio, GeneratedClip } from "@/types/clipforge";
import { ClipCard } from "./ClipCard";

interface ResultsViewProps {
  sourceLabel: string;
  clips: GeneratedClip[];
  aspectRatio: AspectRatio;
  autoFaceTracking: boolean;
  onUpdateClip: (updated: GeneratedClip) => void;
  onNewVideo: () => void;
}

export function ResultsView({
  sourceLabel,
  clips,
  aspectRatio,
  autoFaceTracking,
  onUpdateClip,
  onNewVideo,
}: ResultsViewProps) {
  const [sortBy, setSortBy] = useState<"score" | "timeline">("score");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3500);
  };

  const orderedClips = useMemo(() => {
    const copy = [...clips];
    if (sortBy === "score") {
      copy.sort((a, b) => b.viralityScore - a.viralityScore);
    } else {
      copy.sort((a, b) => a.startTime - b.startTime);
    }
    return copy;
  }, [clips, sortBy]);

  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10"
    >
      {/* Polite live region for export & copy confirmations */}
      <div aria-live="polite" className="sr-only">
        {toastMessage ?? ""}
      </div>

      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-xl border border-[#10B981]/50 bg-[#161F33]/95 px-4 py-3 text-xs font-semibold text-[#F8FAFC] shadow-2xl backdrop-blur-md">
          <CheckCircle2
            className="h-4 w-4 shrink-0 text-[#10B981]"
            aria-hidden="true"
          />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Results Header */}
      <div className="mb-8 flex flex-col justify-between gap-4 border-b border-[#26324D]/80 pb-6 sm:flex-row sm:items-end">
        <div>
          <button
            type="button"
            onClick={onNewVideo}
            className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-[#26324D] bg-[#161F33] px-3 py-1.5 text-xs font-semibold text-[#CBD5E1] transition hover:border-[#3B82F6]/60 hover:text-[#F8FAFC]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            New Video
          </button>

          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#10B981]">
            AI EXTRACTION COMPLETE • {clips.length} VIRAL SHORTS READY
          </p>
          <h1 className="mt-1.5 flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-[#F8FAFC] sm:text-3xl">
            <Film className="h-6 w-6 text-[#10B981]" aria-hidden="true" />
            Generated Shorts Studio
          </h1>
          <p className="mt-1 truncate text-xs text-[#94A3B8] max-w-xl">
            Source: {sourceLabel}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setSortBy((prev) => (prev === "score" ? "timeline" : "score"))
            }
            className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-[#26324D] bg-[#161F33] px-3.5 py-2 text-xs font-semibold text-[#F8FAFC] transition hover:border-[#10B981]/50"
          >
            <ArrowUpDown
              className="h-3.5 w-3.5 text-[#10B981]"
              aria-hidden="true"
            />
            Sort: {sortBy === "score" ? "Virality Score" : "Timeline Order"}
          </button>
        </div>
      </div>

      {/* Clips Grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {orderedClips.map((clip, idx) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            index={idx}
            aspectRatio={aspectRatio}
            autoFaceTracking={autoFaceTracking}
            onUpdateClip={onUpdateClip}
            onNotify={triggerToast}
          />
        ))}
      </div>
    </main>
  );
}
