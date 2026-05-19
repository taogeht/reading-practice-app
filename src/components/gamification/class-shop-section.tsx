"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronUp, Loader2, ShoppingBag, Star } from "lucide-react";

interface ShopItemRow {
    id: string;
    type: string;
    category: string;
    name: string;
    description: string | null;
    star_cost: number;
    asset_data: { emoji?: string; color?: string } | null;
    min_level: number;
    enabled_for_classes: Record<string, boolean>;
}

interface TeacherShopResponse {
    classes: Array<{ id: string; name: string }>;
    items: ShopItemRow[];
}

interface Props {
    classId: string;
    defaultExpanded?: boolean;
}

const TYPE_LABEL: Record<string, string> = {
    avatar_cosmetic: "Cosmetics",
    collectible: "Collectibles",
};

export function ClassShopSection({ classId, defaultExpanded = false }: Props) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [items, setItems] = useState<ShopItemRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pendingItemId, setPendingItemId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/teacher/shop", { cache: "no-store" });
            if (!res.ok) throw new Error("Failed to load shop items");
            const json = (await res.json()) as TeacherShopResponse;
            setItems(json.items);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load shop items");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const enabledCount = useMemo(
        () => items.filter((i) => i.enabled_for_classes?.[classId] !== false).length,
        [items, classId],
    );

    const grouped = useMemo(() => {
        const out: Record<string, ShopItemRow[]> = {};
        for (const item of items) {
            if (!out[item.type]) out[item.type] = [];
            out[item.type].push(item);
        }
        return out;
    }, [items]);

    const handleToggle = async (item: ShopItemRow, enabled: boolean) => {
        // Optimistic update
        setItems((prev) =>
            prev.map((i) =>
                i.id === item.id
                    ? { ...i, enabled_for_classes: { ...i.enabled_for_classes, [classId]: enabled } }
                    : i,
            ),
        );
        setPendingItemId(item.id);
        try {
            const res = await fetch(`/api/teacher/shop/class/${classId}/items`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ item_id: item.id, enabled }),
            });
            if (!res.ok) {
                throw new Error("Toggle failed");
            }
        } catch (err) {
            // Roll back
            setItems((prev) =>
                prev.map((i) =>
                    i.id === item.id
                        ? { ...i, enabled_for_classes: { ...i.enabled_for_classes, [classId]: !enabled } }
                        : i,
                ),
            );
            setError(err instanceof Error ? err.message : "Toggle failed");
        } finally {
            setPendingItemId(null);
        }
    };

    return (
        <Card className={`transition-all ${isExpanded ? "" : "hover:bg-gray-50"}`}>
            <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <ShoppingBag className="w-5 h-5 text-amber-500" />
                    <div>
                        <h3 className="font-medium">Class Shop</h3>
                        <p className="text-sm text-gray-500">
                            {loading
                                ? "Loading…"
                                : `${enabledCount} of ${items.length} item${items.length === 1 ? "" : "s"} available to this class`}
                        </p>
                    </div>
                </div>
                {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
            </div>

            {isExpanded && (
                <CardContent className="pt-0 border-t space-y-4">
                    {loading && (
                        <div className="flex items-center justify-center py-6">
                            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                        </div>
                    )}
                    {error && <div className="text-sm text-red-600 py-2">{error}</div>}
                    {!loading && items.length === 0 && (
                        <p className="text-sm text-gray-500 py-4">No shop items available yet.</p>
                    )}
                    {!loading && items.length > 0 && (
                        <div className="space-y-5 pt-2">
                            {Object.entries(grouped).map(([type, group]) => (
                                <section key={type}>
                                    <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                                        {TYPE_LABEL[type] ?? type}
                                    </h4>
                                    <ul className="space-y-1.5">
                                        {group.map((item) => {
                                            const enabled = item.enabled_for_classes?.[classId] !== false;
                                            const color = item.asset_data?.color ?? "#e5e7eb";
                                            const emoji = item.asset_data?.emoji ?? "🎁";
                                            return (
                                                <li
                                                    key={item.id}
                                                    className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-gray-50 hover:bg-gray-100"
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <span
                                                            className="flex items-center justify-center w-9 h-9 rounded-full text-xl shrink-0"
                                                            style={{ backgroundColor: color }}
                                                        >
                                                            {emoji}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-medium text-gray-900 truncate">
                                                                {item.name}
                                                            </div>
                                                            <div className="text-xs text-gray-500 flex items-center gap-2">
                                                                <span className="capitalize">{item.category}</span>
                                                                <span className="flex items-center gap-0.5">
                                                                    <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                                                                    {item.star_cost}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <Switch
                                                        checked={enabled}
                                                        disabled={pendingItemId === item.id}
                                                        onCheckedChange={(checked) => handleToggle(item, checked)}
                                                    />
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </section>
                            ))}
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
