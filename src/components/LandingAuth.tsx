"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, ShieldCheck, Zap } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { UserProfile } from "@/types/clipforge";

interface LandingAuthProps {
  onAuthenticate: (profile: UserProfile) => void;
}

export function LandingAuth({ onAuthenticate }: LandingAuthProps) {
  return (
    <main
      id="main-content"
      className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6"
    >
      {/* Subtle ambient backdrop glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-72 max-w-2xl rounded-full bg-gradient-to-r from-[#8B5CF6]/15 via-[#3B82F6]/10 to-[#10B981]/15 blur-3xl"
        aria-hidden="true"
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative z-10 flex w-full max-w-xl flex-col items-center text-center"
      >
        <div className="mb-5 flex items-center gap-3">
          <BrandMark size="lg" />
          <span className="text-xl font-bold tracking-tight text-[#F8FAFC]">
            ClipForge <span className="text-[#10B981]">AI</span>
          </span>
        </div>

        <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-[#10B981]">
          AI-POWERED SHORT-FORM CLIP GENERATOR
        </p>

        <h1 className="text-3xl font-extrabold tracking-tight text-[#F8FAFC] sm:text-5xl">
          Turn long videos into{" "}
          <span className="bg-gradient-to-r from-[#F8FAFC] via-[#A7F3D0] to-[#10B981] bg-clip-text text-transparent">
            viral shorts
          </span>{" "}
          in one click.
        </h1>

        <p className="mt-4 max-w-lg text-sm leading-relaxed text-[#94A3B8] sm:text-base">
          Paste any YouTube link or drop an MP4/MOV file and let AI isolate your
          highest-retention hooks automatically. We reframe speakers into crisp
          9:16 vertical clips with burned-in, word-by-word dynamic captions.
        </p>

        {/* Centered Dark Auth Card */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: "easeOut" }}
          aria-labelledby="auth-card-title"
          className="cf-card cf-card-accent mt-9 w-full max-w-md p-6 text-left sm:p-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="auth-card-title"
              className="text-xl font-bold tracking-tight text-[#F8FAFC]"
            >
              Welcome back!
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#10B981]/30 bg-[#10B981]/10 px-3 py-1 text-xs font-semibold text-[#34D399]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Creator Studio • 100% Free
            </span>
          </div>

          <p className="mt-2 text-sm text-[#94A3B8]">
            Sign in to save your generated shorts, caption presets, and export
            history.
          </p>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() =>
                onAuthenticate({
                  name: "Alex Rivera",
                  handle: "@alexcreates",
                  provider: "google",
                  plan: "Free Tier • Unlimited",
                })
              }
              className="flex min-h-[46px] w-full items-center justify-center gap-3 rounded-xl border border-[#26324D] bg-[#0D1117]/80 px-4 py-2.5 text-sm font-semibold text-[#F8FAFC] transition hover:border-[#3B82F6]/60 hover:bg-[#1C2740]"
            >
              <svg
                className="h-4 w-4 shrink-0"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="#EA4335"
                  d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.8-5.4 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c6.9 0 9.1-4.8 9.1-7.3 0-.5-.1-.9-.1-1.3H12z"
                />
              </svg>
              Continue with Google
            </button>

            <button
              type="button"
              onClick={() =>
                onAuthenticate({
                  name: "Jordan Kai",
                  handle: "jordankai#4021",
                  provider: "discord",
                  plan: "Free Tier • Unlimited",
                })
              }
              className="flex min-h-[46px] w-full items-center justify-center gap-3 rounded-xl bg-[#5865F2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4752C4]"
            >
              <svg
                className="h-4 w-4 shrink-0 fill-current"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              Continue with Discord
            </button>
          </div>

          <div className="mt-5 flex items-center gap-3 text-xs text-[#94A3B8]">
            <div className="h-px flex-1 bg-[#26324D]" />
            <span>instant sandbox</span>
            <div className="h-px flex-1 bg-[#26324D]" />
          </div>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() =>
                onAuthenticate({
                  name: "Demo Creator",
                  handle: "Local Session",
                  provider: "demo",
                  plan: "Free Tier • Interactive Demo",
                })
              }
              className="group inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-[#34D399] transition hover:bg-[#10B981]/10 hover:text-[#6EE7B7]"
            >
              Try Demo Without Login
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
          </div>
        </motion.section>

        {/* Feature trust strip */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[#94A3B8]">
          <span className="inline-flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-[#10B981]" aria-hidden="true" />
            Whisper Word-Level Timestamps
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[#10B981]" aria-hidden="true" />
            Open-Source FastAPI + FFmpeg Worker
          </span>
        </div>

        {/* Builder attribution */}
        <footer className="mt-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#26324D] bg-[#161F33]/85 px-4 py-1.5 text-xs text-[#94A3B8] shadow-sm">
            <span
              className="h-2 w-2 rounded-full bg-[#10B981]"
              aria-hidden="true"
            />
            <span>
              Built by{" "}
              <strong className="font-bold text-[#F8FAFC]">rakeshhh.b</strong>
            </span>
          </div>
        </footer>
      </motion.div>
    </main>
  );
}
