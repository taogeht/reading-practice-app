"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";
import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import { AvatarDisplay } from "./avatar-display";
import { ShopItemDisplay, type ShopItemAssetData } from "./shop-item-display";
import type { CharacterType } from "@/lib/gamification/avatar";

interface ClassmateAvatar {
    characterType: CharacterType;
    baseAssetUrl: string | null;
    snapshotUrl: string | null;
}

interface Collectible {
    id: string;
    name: string;
    asset_data: ShopItemAssetData;
    category: string;
}

interface Classmate {
    id: string;
    display_name: string;
    avatar: ClassmateAvatar | null;
    lifetime_stars: number;
    collectibles: Collectible[];
}

export function StudentClassmatesTab() {
    const [classmates, setClassmates] = useState<Classmate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Classmate | null>(null);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/student/classmates", { cache: "no-store" });
            if (!res.ok) throw new Error("Failed to load classmates");
            const json = (await res.json()) as { classmates: Classmate[] };
            setClassmates(json.classmates);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load classmates");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading classmates…
            </div>
        );
    }
    if (error) {
        return <p className="text-sm text-red-600 py-4 text-center">{error}</p>;
    }
    if (classmates.length === 0) {
        return (
            <p className="text-sm text-gray-500 py-8 text-center">
                No classmates yet. Once your teacher adds more students to your class, they'll show up here.
            </p>
        );
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-gray-600">
                Tap a classmate to see their avatar and collectibles.
            </p>

            {/* Horizontal scrollable gallery. Each card is a chunky tap target. */}
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                {classmates.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelected(c)}
                        className="shrink-0 flex flex-col items-center gap-1.5 w-20 group"
                    >
                        <AvatarDisplay
                            characterType={c.avatar?.characterType ?? null}
                            snapshotUrl={c.avatar?.snapshotUrl}
                            baseAssetUrl={c.avatar?.baseAssetUrl}
                            size="md"
                            showEmpty
                        />
                        <span className="text-xs font-medium text-gray-900 group-hover:text-blue-600 truncate w-full text-center">
                            {c.display_name}
                        </span>
                    </button>
                ))}
            </div>

            <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
                {selected && (
                    <SheetContent side="bottom" className="pb-6">
                        <div className="relative px-5 pt-5 space-y-4">
                            <SheetClose onClick={() => setSelected(null)} />

                            <div className="flex flex-col items-center gap-2 pt-2">
                                <AvatarDisplay
                                    characterType={selected.avatar?.characterType ?? null}
                                    snapshotUrl={selected.avatar?.snapshotUrl}
                                    baseAssetUrl={selected.avatar?.baseAssetUrl}
                                    size="lg"
                                    showEmpty
                                />
                                <h2 className="text-xl font-bold text-gray-900">{selected.display_name}</h2>
                                <p className="flex items-center gap-1 text-sm text-amber-700">
                                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                                    <span className="font-semibold tabular-nums">{selected.lifetime_stars}</span>
                                    <span className="text-gray-600">earned total</span>
                                </p>
                            </div>

                            <section>
                                <h3 className="text-sm font-semibold text-gray-700 mb-2">Collectibles</h3>
                                {selected.collectibles.length === 0 ? (
                                    <p className="text-sm text-gray-500 text-center py-4">No collectibles yet</p>
                                ) : (
                                    <div className="grid grid-cols-3 gap-3">
                                        {selected.collectibles.map((item) => (
                                            <ShopItemDisplay
                                                key={item.id}
                                                name={item.name}
                                                assetData={item.asset_data}
                                                owned
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    </SheetContent>
                )}
            </Sheet>
        </div>
    );
}
