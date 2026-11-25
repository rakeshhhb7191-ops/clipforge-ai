"use client";

import React from "react";

interface BrandMarkProps {
  size?: "sm" | "lg";
}

export function BrandMark({ size = "sm" }: BrandMarkProps) {
  const boxSize = size === "lg" ? "h-12 w-12 rounded-2xl" : "h-9 w-9 rounded-xl";
  const iconSize = size === "lg" ? "h-6 w-6" : "h-5 w-5";

  return (
    <div
      className={`${boxSize} relative flex items-center justify-center bg-gradient-to-br from-[#8B5CF6] via-[#3B82F6] to-[#10B981] p-[1px] shadow-glow`}
      aria-hidden="true"
    >
      <div className="flex h-full w-full items-center justify-center rounded-[inherit] bg-[#0D1117]/90 backdrop-blur-sm">
        <svg
          className={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M5 6.5C5 5.11929 6.11929 4 7.5 4H13.5C14.8807 4 16 5.11929 16 6.5V17.5C16 18.8807 14.8807 20 13.5 20H7.5C6.11929 20 5 18.8807 5 17.5V6.5Z"
            stroke="url(#cf-grad)"
            strokeWidth="2"
          />
          <path
            d="M9.5 9.5L12.75 12L9.5 14.5V9.5Z"
            fill="#10B981"
          />
          <path
            d="M18.5 7.5L20 6M19 12H21M18.5 16.5L20 18"
            stroke="#34D399"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient
              id="cf-grad"
              x1="5"
              y1="4"
              x2="16"
              y2="20"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#8B5CF6" />
              <stop offset="0.5" stopColor="#3B82F6" />
              <stop offset="1" stopColor="#10B981" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}
