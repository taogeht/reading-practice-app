"use client";

// Read-only avatar renderer for nav badges, classmates gallery, picker cards.
// Phase 6 collapsed three rendering paths into a strict fallback chain:
//   1. snapshotUrl → render the Sharp-composited flat PNG (one <img>, done)
//   2. baseAssetUrl → render character PNG centered on a flat tinted card
//      (used for fresh avatars before the first canvas save snapshots them)
//   3. empty/no character → grey ? placeholder
//
// The full layered CSS render (background emoji + character + cosmetic emojis)
// is gone — that path only existed for Phases 3–5 when there was no snapshot.
// Now any avatar that's been saved via the canvas has a snapshot, and a fresh
// one trips the simple character-on-card fallback until they save once.

import { HelpCircle } from "lucide-react";
import type { CharacterType } from "@/lib/gamification/avatar";

// Stage aspect is 320:420 (a portrait rectangle). Sizes preserve that ratio
// so a snapshot displayed at any size composites the same way.
const SIZE_DIMS: Record<"sm" | "md" | "lg", { w: number; h: number }> = {
    sm: { w: 48, h: 63 },
    md: { w: 80, h: 105 },
    lg: { w: 160, h: 210 },
};

const BASE_EMOJI: Record<CharacterType, string> = {
    human: "🧑",
    animal: "🐻",
    robot: "🤖",
};

interface Props {
    characterType: CharacterType | null;
    snapshotUrl?: string | null;
    baseAssetUrl?: string | null;
    size?: "sm" | "md" | "lg";
    showEmpty?: boolean;
    onClick?: () => void;
    className?: string;
}

export function AvatarDisplay({
    characterType,
    snapshotUrl,
    baseAssetUrl,
    size = "md",
    showEmpty = true,
    onClick,
    className = "",
}: Props) {
    const { w, h } = SIZE_DIMS[size];
    const wrapperClasses = `relative rounded-2xl overflow-hidden border-2 border-white shadow-sm bg-gray-100 ${
        onClick ? "cursor-pointer hover:scale-105 active:scale-95 transition-transform" : ""
    } ${className}`;

    if (!characterType) {
        if (!showEmpty) return null;
        return (
            <div
                role={onClick ? "button" : undefined}
                onClick={onClick}
                className={`flex items-center justify-center bg-gray-200 text-gray-400 ${wrapperClasses}`}
                style={{ width: w, height: h }}
                aria-label="No avatar yet"
            >
                <HelpCircle style={{ width: w * 0.5, height: w * 0.5 }} />
            </div>
        );
    }

    return (
        <div
            role={onClick ? "button" : undefined}
            onClick={onClick}
            className={wrapperClasses}
            style={{ width: w, height: h }}
            aria-label={`${characterType} avatar`}
        >
            {snapshotUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={snapshotUrl}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
                />
            ) : baseAssetUrl ? (
                // Snapshot not yet generated — render the character centered on
                // a flat card. Same layout the snapshot uses internally for a
                // brand-new avatar, so visual jump on first save is minimal.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={baseAssetUrl}
                    alt=""
                    aria-hidden
                    className="absolute left-1/2 -translate-x-1/2 select-none pointer-events-none"
                    style={{ bottom: 0, height: h * 0.85, width: "auto", objectFit: "contain" }}
                />
            ) : (
                <span
                    aria-hidden
                    className="absolute inset-0 flex items-center justify-center select-none"
                    style={{ fontSize: Math.round(w * 0.5), lineHeight: 1 }}
                >
                    {BASE_EMOJI[characterType]}
                </span>
            )}
        </div>
    );
}
