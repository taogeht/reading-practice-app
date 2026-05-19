"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useStars } from "@/components/providers/stars-provider";
import { ShopItemDisplay, type ShopItemAssetData } from "./shop-item-display";

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

type GroupedShop = {
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

export function StudentShopTab() {
    const { balance, refresh } = useStars();
    const [data, setData] = useState<GroupedShop | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeBucket, setActiveBucket] = useState<Bucket>("avatar_cosmetics");
    const [activeCategory, setActiveCategory] = useState<string | "all">("all");
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);
    const [purchasing, setPurchasing] = useState(false);
    const [purchaseError, setPurchaseError] = useState<string | null>(null);

    const loadShop = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch("/api/student/shop", { cache: "no-store" });
            if (!res.ok) throw new Error("Failed to load shop");
            const json = (await res.json()) as GroupedShop;
            setData(json);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load shop");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadShop();
    }, [loadShop]);

    const categories = useMemo(() => {
        if (!data) return [];
        const groups = data[activeBucket] ?? {};
        return Object.entries(groups)
            .filter(([, items]) => items.length > 0)
            .map(([cat]) => cat);
    }, [data, activeBucket]);

    const visibleItems = useMemo(() => {
        if (!data) return [];
        const groups = data[activeBucket] ?? {};
        if (activeCategory === "all") {
            return categories.flatMap((cat) => groups[cat] ?? []);
        }
        return groups[activeCategory] ?? [];
    }, [data, activeBucket, activeCategory, categories]);

    const handleBuy = async () => {
        if (!selectedItem) return;
        setPurchaseError(null);
        try {
            setPurchasing(true);
            const res = await fetch("/api/student/shop/purchase", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ item_id: selectedItem.id }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(json.error || "Purchase failed");
            }
            toast.success(`🎉 ${selectedItem.name} added to your collection!`, { duration: 2200 });
            setSelectedItem(null);
            await Promise.all([loadShop(), refresh()]);
        } catch (err) {
            setPurchaseError(err instanceof Error ? err.message : "Purchase failed");
        } finally {
            setPurchasing(false);
        }
    };

    if (loading && !data) {
        return (
            <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading shop…
            </div>
        );
    }
    if (error && !data) {
        return <p className="text-sm text-red-600 py-4 text-center">{error}</p>;
    }

    const hasAnyCosmetics = data && Object.values(data.avatar_cosmetics).some((arr) => arr.length > 0);
    const hasAnyCollectibles = data && Object.values(data.collectibles).some((arr) => arr.length > 0);

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <Button
                    variant={activeBucket === "avatar_cosmetics" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                        setActiveBucket("avatar_cosmetics");
                        setActiveCategory("all");
                    }}
                    disabled={!hasAnyCosmetics}
                >
                    Cosmetics
                </Button>
                <Button
                    variant={activeBucket === "collectibles" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                        setActiveBucket("collectibles");
                        setActiveCategory("all");
                    }}
                    disabled={!hasAnyCollectibles}
                >
                    Collectibles
                </Button>
            </div>

            {categories.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                    <button
                        type="button"
                        onClick={() => setActiveCategory("all")}
                        className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border ${
                            activeCategory === "all"
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white text-gray-700 border-gray-200"
                        }`}
                    >
                        All
                    </button>
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            type="button"
                            onClick={() => setActiveCategory(cat)}
                            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border ${
                                activeCategory === cat
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "bg-white text-gray-700 border-gray-200"
                            }`}
                        >
                            {CATEGORY_LABELS[cat] ?? cat}
                        </button>
                    ))}
                </div>
            )}

            {visibleItems.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">Nothing here yet.</p>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {visibleItems.map((item) => (
                        <ShopItemDisplay
                            key={item.id}
                            name={item.name}
                            starCost={item.star_cost}
                            assetData={item.asset_data}
                            owned={item.owned}
                            affordable={item.affordable}
                            levelLocked={item.level_locked}
                            minLevel={item.min_level}
                            onClick={() => {
                                if (item.owned) return;
                                if (item.level_locked) {
                                    toast(`Reach Level ${item.min_level} to unlock this item!`, {
                                        icon: "🔒",
                                        duration: 2200,
                                    });
                                    return;
                                }
                                setPurchaseError(null);
                                setSelectedItem(item);
                            }}
                        />
                    ))}
                </div>
            )}

            <Dialog
                open={selectedItem !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedItem(null);
                        setPurchaseError(null);
                    }
                }}
            >
                {selectedItem && (
                    <DialogContent className="sm:max-w-sm">
                        <div className="text-center space-y-4 p-2">
                            <div
                                className="mx-auto flex items-center justify-center w-28 h-28 rounded-full text-6xl"
                                style={{ backgroundColor: (selectedItem.asset_data?.color as string) || "#e5e7eb" }}
                            >
                                <span>{(selectedItem.asset_data?.emoji as string) || "🎁"}</span>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">{selectedItem.name}</h3>
                                {selectedItem.description && (
                                    <p className="text-sm text-gray-600 mt-1">{selectedItem.description}</p>
                                )}
                            </div>
                            <div className="text-sm text-gray-700 space-y-1">
                                <div className="flex items-center justify-center gap-2">
                                    <span>Cost</span>
                                    <span className="font-semibold flex items-center gap-1 tabular-nums">
                                        <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                                        {selectedItem.star_cost}
                                    </span>
                                </div>
                                <div className="flex items-center justify-center gap-2">
                                    <span>Your balance</span>
                                    <span className="font-semibold flex items-center gap-1 tabular-nums">
                                        <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                                        {balance}
                                    </span>
                                </div>
                                <div className="flex items-center justify-center gap-2 text-gray-500">
                                    <span>After purchase</span>
                                    <span className="font-semibold flex items-center gap-1 tabular-nums">
                                        <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                                        {Math.max(0, balance - selectedItem.star_cost)}
                                    </span>
                                </div>
                            </div>
                            {purchaseError && <p className="text-sm text-red-600">{purchaseError}</p>}
                            <div className="flex gap-2 justify-center pt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setSelectedItem(null)}
                                    disabled={purchasing}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleBuy}
                                    disabled={purchasing || !selectedItem.affordable || selectedItem.level_locked}
                                >
                                    {purchasing ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <Star className="w-4 h-4 mr-2" />
                                    )}
                                    Buy
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                )}
            </Dialog>
        </div>
    );
}
