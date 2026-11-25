"use client";

import React from "react";
import { LogOut, Sparkles, Wifi } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { UserProfile } from "@/types/clipforge";

interface StudioNavbarProps {
  user: UserProfile;
  backendOnline: boolean;
  onGoHome: () => void;
  onSignOut: () => void;
}

export function StudioNavbar({
  user,
  backendOnline,
  onGoHome,
  onSignOut,
}: StudioNavbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#26324D]/80 bg-[#0D1117]/85 backdrop-blur-md">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6"
      >
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-2.5 rounded-xl py-1 pr-2 text-left transition hover:opacity-90"
        >
          <BrandMark size="sm" />
          <div>
            <span className="block text-base font-bold tracking-tight text-[#F8FAFC]">
              ClipForge <span className="text-[#10B981]">AI</span>
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#94A3B8]">
              Creator Studio
            </span>
          </div>
        </button>

        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Backend Status Indicator */}
          <span
            className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium sm:inline-flex ${
              backendOnline
                ? "border-[#10B981]/30 bg-[#10B981]/10 text-[#34D399]"
                : "border-[#26324D] bg-[#161F33] text-[#94A3B8]"
            }`}
            title={
              backendOnline
                ? "FastAPI FFmpeg worker connected for 1080p MP4 rendering"
                : "YouTube AI Hook Engine active (analyzes real YouTube captions & timestamps)"
            }
          >
            {backendOnline ? (
              <Wifi className="h-3.5 w-3.5 text-[#10B981]" aria-hidden="true" />
            ) : (
              <Wifi className="h-3.5 w-3.5 text-[#34D399]" aria-hidden="true" />
            )}
            {backendOnline ? "FFmpeg Worker Online" : "YouTube AI Ready"}
          </span>

          {/* Credits / Free Tier Badge */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#10B981]/30 bg-[#10B981]/10 px-3 py-1 text-xs font-semibold text-[#34D399]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Free Tier • ∞ Clips</span>
          </span>

          {/* User Profile */}
          <div className="flex items-center gap-2 rounded-full border border-[#26324D] bg-[#161F33] py-1 pl-2.5 pr-1.5">
            <div
              className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#10B981] text-xs font-bold text-white"
              aria-hidden="true"
            >
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="hidden text-xs font-medium text-[#F8FAFC] md:inline">
              {user.name}
            </span>
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out and return to welcome screen"
              className="flex h-7 w-7 items-center justify-center rounded-full text-[#94A3B8] transition hover:bg-[#26324D]/70 hover:text-[#F8FAFC]"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </nav>
    </header>
  );
}
