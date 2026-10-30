"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface NexformLogoProps {
  size?: "sm" | "md" | "lg";
  showSubtitle?: boolean;
  iconOnly?: boolean;
  className?: string;
}

export function NexformLogo({
  size = "md",
  showSubtitle = false,
  iconOnly = false,
  className,
}: NexformLogoProps) {
  const boxSize =
    size === "sm"
      ? "h-8 w-8 rounded-lg"
      : size === "lg"
      ? "h-12 w-12 rounded-xl"
      : "h-10 w-10 rounded-xl";

  const titleSize =
    size === "sm"
      ? "text-[15px]"
      : size === "lg"
      ? "text-2xl"
      : "text-[18px]";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 select-none group",
        className
      )}
    >
      {/* Emblem: Precision Isometric Nexus Prism (Metallic Dark Palette) */}
      <div
        className={cn(
          boxSize,
          "relative flex items-center justify-center shrink-0 bg-[#0d0d10] border border-zinc-700/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] overflow-hidden"
        )}
      >
        {/* Subtle inner radial sheen */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 25% 20%, rgba(255,255,255,0.16), transparent 65%)",
          }}
        />

        <svg
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-[78%] h-[78%] relative z-10"
        >
          <defs>
            <linearGradient
              id="nexform-top"
              x1="8"
              y1="4"
              x2="32"
              y2="20"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#D4D4D8" />
            </linearGradient>
            <linearGradient
              id="nexform-left"
              x1="6"
              y1="12"
              x2="20"
              y2="36"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#E4E4E7" />
              <stop offset="100%" stopColor="#71717A" />
            </linearGradient>
            <linearGradient
              id="nexform-right"
              x1="20"
              y1="14"
              x2="34"
              y2="35"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#A1A1AA" />
              <stop offset="100%" stopColor="#3F3F46" />
            </linearGradient>
          </defs>

          {/* Outer Isometric Hexagon Frame */}
          <path
            d="M20 3.5L34.5 11.8V28.2L20 36.5L5.5 28.2V11.8L20 3.5Z"
            stroke="#52525B"
            strokeWidth="1.2"
          />

          {/* Top Facet Ribbon (Form Structure) */}
          <path
            d="M20 6L32 12.9L26.2 16.3L20 12.7L13.8 16.3L8 12.9L20 6Z"
            fill="url(#nexform-top)"
          />

          {/* Left Pillar & Diagonal Nexus Bridge (The 'N' Core) */}
          <path
            d="M8 15.2L13.8 18.5V24.2L24.5 14.5L30.2 17.8L13.8 32.5L8 29.1V15.2Z"
            fill="url(#nexform-left)"
          />

          {/* Right Structural Wing (The 'F' / Precision Modular Wing) */}
          <path
            d="M26.2 21.8L32 18.5V29.1L20 36V29.3L26.2 25.7V21.8Z"
            fill="url(#nexform-right)"
          />

          {/* Central Luminous Nexus Node */}
          <circle cx="20" cy="20" r="2.4" fill="#FFFFFF" />
        </svg>
      </div>

      {/* Wordmark Lockup */}
      {!iconOnly && (
        <div className="flex flex-col justify-center leading-none">
          <div className="flex items-center gap-1">
            <span
              className={cn(
                titleSize,
                "font-extrabold tracking-[0.06em] text-zinc-950 dark:text-white"
              )}
            >
              NEX
            </span>
            <span
              className={cn(
                titleSize,
                "font-light tracking-[0.08em] text-zinc-500 dark:text-zinc-400"
              )}
            >
              FORM
            </span>
          </div>
          {showSubtitle && (
            <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-zinc-500 mt-1">
              People • Process • Tech
            </span>
          )}
        </div>
      )}
    </div>
  );
}
