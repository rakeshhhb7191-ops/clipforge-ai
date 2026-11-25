"use client";

import React, { useId } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, Sparkles, XCircle } from "lucide-react";
import { PROCESSING_STEPS } from "@/lib/demo-data";

interface ProcessingTrackerProps {
  currentStepIndex: number; // 0..3
  progressPercent: number;  // 0..100
  sourceLabel: string;
  liveLog: string;
  onCancel: () => void;
}

export function ProcessingTracker({
  currentStepIndex,
  progressPercent,
  sourceLabel,
  liveLog,
  onCancel,
}: ProcessingTrackerProps) {
  const progressId = useId();
  const clampedProgress = Math.max(0, Math.min(100, Math.round(progressPercent)));

  return (
    <main
      id="main-content"
      className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-12 sm:px-6 sm:py-16"
    >
      <motion.section
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        aria-labelledby="processing-heading"
        className="cf-card cf-card-accent w-full p-6 sm:p-8"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#10B981]">
              AI PIPELINE RUNNING
            </p>
            <h1
              id="processing-heading"
              className="mt-1.5 text-2xl font-extrabold tracking-tight text-[#F8FAFC]"
            >
              Forging your viral shorts…
            </h1>
            <p className="mt-1 truncate text-xs text-[#94A3B8] max-w-md">
              Source: {sourceLabel}
            </p>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#10B981]/35 bg-[#10B981]/10 px-3 py-1 text-xs font-bold text-[#34D399]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {clampedProgress}%
          </span>
        </div>

        {/* Native accessible progress bar */}
        <div className="mt-6">
          <label htmlFor={progressId} className="sr-only">
            Video processing completion
          </label>
          <progress
            id={progressId}
            className="cf-progress"
            max={100}
            value={clampedProgress}
          />
        </div>

        {/* Step-by-step tracker */}
        <ol className="mt-7 space-y-3">
          {PROCESSING_STEPS.map((step, index) => {
            const isCompleted = index < currentStepIndex || clampedProgress >= 100;
            const isActive = index === currentStepIndex && clampedProgress < 100;

            return (
              <motion.li
                key={step.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.06 }}
                className={`flex items-start gap-3.5 rounded-xl border p-3.5 transition ${
                  isCompleted
                    ? "border-[#10B981]/35 bg-[#10B981]/10"
                    : isActive
                    ? "border-[#3B82F6]/50 bg-[#0D1117]/90 shadow-sm"
                    : "border-[#26324D]/70 bg-[#0D1117]/40 opacity-60"
                }`}
              >
                <div
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                    isCompleted
                      ? "border-[#10B981] bg-[#10B981] text-[#042117]"
                      : isActive
                      ? "border-[#3B82F6] bg-[#3B82F6]/20 text-[#93C5FD]"
                      : "border-[#26324D] bg-[#161F33] text-[#94A3B8]"
                  }`}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : isActive ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <span>{step.id}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`text-sm font-semibold ${
                        isCompleted || isActive
                          ? "text-[#F8FAFC]"
                          : "text-[#94A3B8]"
                      }`}
                    >
                      {step.title}
                    </p>
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                      {isCompleted
                        ? "Done"
                        : isActive
                        ? "Active"
                        : "Queued"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#94A3B8]">{step.detail}</p>
                </div>
              </motion.li>
            );
          })}
        </ol>

        {/* Live pipeline log strip */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#26324D] bg-[#0D1117]/85 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
            <span
              className="h-2 w-2 animate-pulse rounded-full bg-[#10B981]"
              aria-hidden="true"
            />
            <span className="font-mono text-[#CBD5E1]">{liveLog}</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#26324D] bg-[#161F33] px-3 py-1.5 text-xs font-semibold text-[#94A3B8] transition hover:text-[#F8FAFC]"
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Cancel
          </button>
        </div>
      </motion.section>
    </main>
  );
}
