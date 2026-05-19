"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ShopItemDisplay, type ShopItemAssetData } from "./shop-item-display";

// Phase 4: this is the "Collection" tab — shows the full catalogue available
// to the student's class with owned/unowned/locked treatments per item, and
// "Owned N/M" counts per category. Tapping an unowned item jumps to the Shop
// tab; level-locked items show a toast and stay put.

type Item = {
    id: string;
    type: string;
    category: string;
    name: string;
    description: string | null;
    star_cost: number;
    asset_data: ShopItemAssetData;
    min_level: number;
    owned: boolean;
    affordable: boolean;
    level_locked: boolean;
};

type Grouped = {
    avatar_cosmetics: Record<string, Item[]>;
    collectibles: Record<string, Item[]>;
};

type Bucket = "avatar_cosmetics" | "collectibles";

const CATEGORY_LABELS: Record<string, string> = {
    hat: "Hats",
    outfit: "Outfits",
    accessory: "Accessories",
    background: "Backgrounds",
    scene: "Backgrounds",
    sticker: "Stickers",
    trophy: "Trophies",
    pet: "Pets",
};

interface Props {
    onGoToShop?: () => void;
}

function countOwned(items: Item[]): { owned: number; total: number } {
    return { owned: items.filter((i) => i.owned).length, total: items.length };
}

export function StudentInventoryTab({ onGoToShop }: Props) {
    const [data, setData] = useState<Grouped | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeBucket, setActiveBucket] = useState<Bucket>("avatar_cosmetics");

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/student/shop", { cache: "no-store" });
            if (!res.ok) throw new Error("Failed to load collection");
            const json = (await res.json()) as Grouped;
            setData(json);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load collection");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const groups = useMemo(() => {
        if (!data) return [] as Array<{ category: string; items: Item[]; owned: number; total: number }>;
        const bucket = data[activeBucket] ?? {};
        return Object.entries(bucket)
            .filter(([, items]) => items.length > 0)
            .map(([category, items]) => ({
                category,
                items,
                ...countOwned(items),
            }));
    }, [data, activeBucket]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
        );
    }
    if (error) {
        return <p className="text-sm text-red-600 py-4 text-center">{error}</p>;
    }
    if (!data) return null;

    const hasAnyCosmetics = Object.values(data.avatar_cosmetics).some((arr) => arr.length > 0);
    const hasAnyCollectibles = Object.values(data.collectibles).some((arr) => arr.length > 0);

    return (
        <div className="space-y-5">
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => setActiveBucket("avatar_cosmetics")}
                    disabled={!hasAnyCosmetics}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border min-h-[36px] ${
                        activeBucket === "avatar_cosmetics"
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-200"
                    } disabled:opacity-50`}
                >
                    Cosmetics
                </button>
                <button
                    type="button"
                    onClick={() => setActiveBucket("collectibles")}
                    disabled={!hasAnyCollectibles}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border min-h-[36px] ${
                        activeBucket === "collectibles"
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-200"
                    } disabled:opacity-50`}
                >
                    Collectibles
                </button>
            </div>

            {groups.length === 0 && (
                <p className="text-sm text-gray-500 py-6 text-center">
                    Nothing in this category yet.{" "}
                    {onGoToShop && (
                        <button onClick={onGoToShop} className="text-blue-600 underline">
                            Visit the shop →
                        </button>
                    )}
                </p>
            )}

            {groups.map(({ category, items, owned, total }) => (
                <section key={category}>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between">
                        <span>{CATEGORY_LABELS[category] ?? category}</span>
                        <span className="text-xs text-gray-500 tabular-nums">
                            {owned}/{total}
                        </span>
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                        {items.map((item) => (
                            <ShopItemDisplay
                                key={item.id}
                                name={item.name}
                                starCost={item.owned ? undefined : item.star_cost}
                                assetData={item.asset_data}
                                owned={item.owned}
                                affordable={item.affordable}
                                levelLocked={item.level_locked}
                                minLevel={item.min_level}
                                onClick={() => {
                                    if (item.owned) return;
                                    if (item.level_locked) {
                                        toast(`Reach Level ${item.min_level} to unlock!`, {
                                            icon: "🔒",
                                            duration: 2200,
                                        });
                                        return;
                                    }
                                    onGoToShop?.();
                                }}
                            />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
