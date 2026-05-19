"use client";

// Shared display primitive for a shop or inventory item — the emoji-in-a-
// colored-circle treatment. Tap target is the card; the parent controls what
// happens on click.

import { Lock, Star } from "lucide-react";

export type ShopItemAssetData = {
    emoji?: string;
    color?: string;
    layer?: string;
};

export interface ShopItemDisplayProps {
    name: string;
    starCost?: number;
    assetData: ShopItemAssetData | unknown;
    owned?: boolean;
    affordable?: boolean;
    levelLocked?: boolean;
    minLevel?: number;
    onClick?: () => void;
}

function isAssetData(v: unknown): v is ShopItemAssetData {
    return typeof v === "object" && v !== null;
}

export function ShopItemDisplay({
    name,
    starCost,
    assetData,
    owned = false,
    affordable = true,
    levelLocked = false,
    minLevel,
    onClick,
}: ShopItemDisplayProps) {
    const data = isAssetData(assetData) ? assetData : {};
    const emoji = data.emoji ?? "🎁";
    const color = data.color ?? "#e5e7eb";

    const dim = owned || (!affordable && !owned) || levelLocked;

    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex flex-col items-center gap-2 rounded-2xl border bg-white p-3 text-center transition-all ${
                onClick ? "hover:shadow-md active:scale-[0.98]" : ""
            } ${dim ? "opacity-70" : ""}`}
        >
            <div
                className="relative flex items-center justify-center w-20 h-20 rounded-full text-4xl shrink-0"
                style={{ backgroundColor: color }}
                aria-hidden
            >
                <span>{emoji}</span>
                {owned && (
                    <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-green-500 text-white text-xs font-bold flex items-center justify-center border-2 border-white">
                        ✓
                    </span>
                )}
                {levelLocked && !owned && (
                    <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gray-700 text-white flex items-center justify-center border-2 border-white">
                        <Lock className="w-3 h-3" />
                    </span>
                )}
            </div>
            <div className="text-sm font-medium text-gray-900 leading-tight">{name}</div>
            {owned ? (
                <span className="text-xs text-green-700 font-semibold">Owned</span>
            ) : levelLocked && minLevel ? (
                <span className="text-xs text-gray-600">Level {minLevel} required</span>
            ) : typeof starCost === "number" ? (
                <span
                    className={`flex items-center gap-1 text-sm font-semibold tabular-nums ${
                        affordable ? "text-amber-700" : "text-gray-400"
                    }`}
                >
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                    {starCost}
                </span>
            ) : null}
        </button>
    );
}
