"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, RotateCw, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAvatar } from "@/components/providers/avatar-provider";
import { useStars } from "@/components/providers/stars-provider";
import { AvatarCanvas, type CanvasOwnedItem } from "./avatar-canvas";
import type { BareCanvasState, CharacterType } from "@/lib/gamification/avatar";

const TYPE_LABEL: Record<CharacterType, string> = {
    human: "Humans",
    animal: "Animals",
    robot: "Robots",
};

const CHARACTER_OPTIONS: Array<{ type: CharacterType; emoji: string }> = [
    { type: "human", emoji: "🧑" },
    { type: "animal", emoji: "🐻" },
    { type: "robot", emoji: "🤖" },
];

interface CatalogCharacter {
    id: string;
    character_type: CharacterType;
    variant_index: number;
    name: string;
    personality: string;
    asset_url: string;
}

interface InventoryItem {
    id: string;
    type: string;
    category: string;
    name: string;
    asset_data: { emoji?: string; color?: string; url?: string; layer?: string; scene_prompt?: string };
    min_level: number;
    star_cost: number;
}

interface InventoryGrouped {
    avatar_cosmetics: Record<string, InventoryItem[]>;
    collectibles: Record<string, InventoryItem[]>;
}

interface Props {
    onGoToShop?: () => void;
}

export function StudentAvatarTab({ onGoToShop }: Props) {
    const { avatar, rerollCost, loading, refresh, setAvatar } = useAvatar();
    const { balance, refresh: refreshStars } = useStars();

    const [inventory, setInventory] = useState<InventoryGrouped | null>(null);
    const [catalog, setCatalog] = useState<CatalogCharacter[] | null>(null);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [rerollOpen, setRerollOpen] = useState(false);
    const [pendingPick, setPendingPick] = useState<CatalogCharacter | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [pendingSave, setPendingSave] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);
    const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const loadInventory = useCallback(async () => {
        try {
            const res = await fetch("/api/student/inventory", { cache: "no-store" });
            if (!res.ok) return;
            const data = (await res.json()) as InventoryGrouped;
            setInventory(data);
        } catch (err) {
            console.error("[StudentAvatarTab] load inventory failed", err);
        }
    }, []);

    const loadCatalog = useCallback(async () => {
        try {
            setCatalogLoading(true);
            const res = await fetch("/api/student/character/catalog", { cache: "no-store" });
            if (!res.ok) return;
            const data = (await res.json()) as { characters: CatalogCharacter[] };
            setCatalog(data.characters);
        } catch (err) {
            console.error("[StudentAvatarTab] load catalog failed", err);
        } finally {
            setCatalogLoading(false);
        }
    }, []);

    useEffect(() => {
        loadInventory();
        loadCatalog();
    }, [loadInventory, loadCatalog]);

    // ---- save flow -----------------------------------------------------------

    const persistCanvas = useCallback(
        async (state: BareCanvasState, backgroundItemId: string | null) => {
            try {
                const res = await fetch("/api/student/character/canvas", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ canvas_state: state, background_item_id: backgroundItemId }),
                });
                if (!res.ok) throw new Error("Failed to save canvas");
                // Snapshot generation is async server-side. Wait briefly then
                // refresh to pick up snapshot_url; clear the saved-flash indicator
                // once it lands.
                setTimeout(async () => {
                    await refresh();
                    setSavedFlash(true);
                    if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
                    savedFlashTimer.current = setTimeout(() => setSavedFlash(false), 2000);
                }, 1500);
            } catch (err) {
                console.error(err);
                toast.error("Couldn't save your avatar. Try again?");
            }
        },
        [refresh],
    );

    const handleCanvasSave = useCallback(
        async (next: BareCanvasState) => {
            if (!avatar) return;
            await persistCanvas(next, avatar.background?.id ?? null);
        },
        [avatar, persistCanvas],
    );

    const handleBackgroundChange = async (newBgId: string | null) => {
        if (!avatar) return;
        const bareState: BareCanvasState = {
            items: avatar.canvas.items.map((i) => ({
                itemId: i.itemId,
                category: i.category,
                x: i.x,
                y: i.y,
                scale: i.scale,
                rotation: i.rotation,
                zIndex: i.zIndex,
            })),
            character: avatar.canvas.character,
        };
        setPendingSave(true);
        await persistCanvas(bareState, newBgId);
        setPendingSave(false);
    };

    // ---- character pickers ---------------------------------------------------

    const catalogByType = useMemo(() => {
        const out: Record<CharacterType, CatalogCharacter[]> = { human: [], animal: [], robot: [] };
        for (const c of catalog ?? []) {
            if (out[c.character_type]) out[c.character_type].push(c);
        }
        return out;
    }, [catalog]);

    const costForSwap = useCallback(
        (pick: CatalogCharacter | null): number => {
            if (!avatar || !pick) return 0;
            if (avatar.characterId === pick.id) return 0;
            if (avatar.characterId === null) return 0;
            if (avatar.characterType === pick.character_type) return 0;
            return rerollCost;
        },
        [avatar, rerollCost],
    );

    const handleCreate = async (pick: CatalogCharacter): Promise<boolean> => {
        setSubmitting(true);
        setErrorMessage(null);
        try {
            const res = await fetch("/api/student/character/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ character_id: pick.id }),
            });
            const json = await res.json().catch(() => ({}));
            if (res.status === 409 && json.code === "already_exists") {
                const fresh = await refresh();
                if (fresh) {
                    toast.message("You already have an avatar — loaded it for you.");
                    return true;
                }
                setErrorMessage("We couldn't reload your avatar. Please refresh the page.");
                return false;
            }
            if (!res.ok) throw new Error(json.error || "Failed to pick character");
            setAvatar(json.avatar);
            toast.success(`Meet ${pick.name}!`);
            return true;
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : "Failed to pick character");
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const handleReroll = async () => {
        if (!pendingPick || !avatar) return;
        setSubmitting(true);
        setErrorMessage(null);
        try {
            const res = await fetch("/api/student/character/reroll", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ character_id: pendingPick.id }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || "Reroll failed");
            setAvatar(json.avatar);
            await refreshStars();
            const charged = typeof json.charged === "number" ? json.charged : 0;
            toast.success(
                charged > 0
                    ? `Now playing as ${pendingPick.name} (−⭐${charged})`
                    : `Now playing as ${pendingPick.name}!`,
            );
            setRerollOpen(false);
            setPendingPick(null);
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : "Reroll failed");
        } finally {
            setSubmitting(false);
        }
    };

    // ---- derived data --------------------------------------------------------

    const trayItems: CanvasOwnedItem[] = useMemo(() => {
        if (!inventory) return [];
        const out: CanvasOwnedItem[] = [];
        for (const [, items] of Object.entries(inventory.avatar_cosmetics)) {
            for (const i of items) {
                if (i.category === "scene") continue; // scenes go in the bg selector
                out.push({
                    id: i.id,
                    name: i.name,
                    category: i.category,
                    asset_type: (i as { asset_type?: string }).asset_type ?? "css",
                    asset_data: i.asset_data,
                });
            }
        }
        for (const [, items] of Object.entries(inventory.collectibles)) {
            for (const i of items) {
                out.push({
                    id: i.id,
                    name: i.name,
                    category: i.category,
                    asset_type: (i as { asset_type?: string }).asset_type ?? "css",
                    asset_data: i.asset_data,
                });
            }
        }
        return out;
    }, [inventory]);

    const ownedScenes: InventoryItem[] = useMemo(() => {
        if (!inventory) return [];
        const scenes = inventory.avatar_cosmetics.scene ?? [];
        return scenes;
    }, [inventory]);

    // Memoize the canvas snapshot the parent hands to AvatarCanvas so that
    // unrelated re-renders (e.g. setPendingSave / setSavedFlash toggles) don't
    // produce a new object reference. Without this, AvatarCanvas's useEffect
    // re-syncs to the stale server state mid-drag and the item appears to
    // snap back to its prior position until the save round-trip completes.
    const canvasInitialState: BareCanvasState | null = useMemo(() => {
        if (!avatar) return null;
        return {
            items: avatar.canvas.items.map((i) => ({
                itemId: i.itemId,
                category: i.category,
                x: i.x,
                y: i.y,
                scale: i.scale,
                rotation: i.rotation,
                zIndex: i.zIndex,
            })),
            character: avatar.canvas.character,
        };
    }, [avatar?.canvas]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
        );
    }

    // No avatar yet — character picker.
    if (!avatar) {
        if (catalogLoading) {
            return (
                <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading characters…
                </div>
            );
        }
        if (!catalog || catalog.length === 0) {
            return (
                <div className="text-center py-10 space-y-2">
                    <p className="text-3xl">✨</p>
                    <h2 className="text-lg font-semibold text-gray-900">New avatars coming soon!</h2>
                    <p className="text-sm text-gray-600">Ask your teacher when characters will be ready.</p>
                </div>
            );
        }

        return (
            <div className="space-y-6">
                <div className="text-center space-y-1">
                    <h2 className="text-lg font-semibold text-gray-900">Pick your character</h2>
                    <p className="text-sm text-gray-600">You can change later for ⭐{rerollCost}.</p>
                </div>

                {(["human", "animal", "robot"] as CharacterType[]).map((type) => {
                    const list = catalogByType[type];
                    if (!list || list.length === 0) return null;
                    return (
                        <section key={type}>
                            <h3 className="text-sm font-semibold text-gray-700 mb-2">{TYPE_LABEL[type]}</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {list.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        disabled={submitting}
                                        onClick={() => {
                                            setPendingPick(c);
                                            setPickerOpen(true);
                                        }}
                                        className="flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 hover:shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                                    >
                                        <div className="w-24 h-24 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={c.asset_url}
                                                alt={c.name}
                                                className="max-w-full max-h-full object-contain"
                                            />
                                        </div>
                                        <div className="font-semibold text-gray-900">{c.name}</div>
                                        <div className="text-xs text-gray-600 text-center line-clamp-2">
                                            {c.personality.split(",")[0]}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </section>
                    );
                })}

                <Dialog
                    open={pickerOpen}
                    onOpenChange={(open) => {
                        if (!open && !submitting) {
                            setPickerOpen(false);
                            setPendingPick(null);
                        }
                    }}
                >
                    {pendingPick && (
                        <DialogContent className="sm:max-w-sm">
                            <div className="text-center space-y-4 p-2">
                                <div className="mx-auto w-32 h-32 rounded-2xl bg-gray-100 overflow-hidden flex items-center justify-center">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={pendingPick.asset_url}
                                        alt={pendingPick.name}
                                        className="max-w-full max-h-full object-contain"
                                    />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900">Play as {pendingPick.name}?</h3>
                                <p className="text-sm text-gray-600">{pendingPick.personality}</p>
                                {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
                                <div className="flex gap-2 justify-center pt-2">
                                    <Button
                                        variant="outline"
                                        disabled={submitting}
                                        onClick={() => {
                                            setPickerOpen(false);
                                            setPendingPick(null);
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        disabled={submitting}
                                        onClick={async () => {
                                            const ok = await handleCreate(pendingPick);
                                            if (ok) {
                                                setPickerOpen(false);
                                                setPendingPick(null);
                                            }
                                        }}
                                    >
                                        {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                        Confirm
                                    </Button>
                                </div>
                            </div>
                        </DialogContent>
                    )}
                </Dialog>
            </div>
        );
    }

    // Has avatar — canvas editor.
    const isLegacy = avatar.characterId === null;

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-lg font-semibold text-gray-900">
                        {avatar.characterName ?? "Your character"}
                    </div>
                    <div className="text-xs text-gray-500 min-h-[16px]">
                        {pendingSave ? "Saving…" : savedFlash ? (
                            <span className="text-green-700 inline-flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>
                        ) : null}
                    </div>
                </div>
                {!isLegacy && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-600"
                        onClick={() => {
                            setErrorMessage(null);
                            setPendingPick(null);
                            setRerollOpen(true);
                        }}
                    >
                        <RotateCw className="w-3.5 h-3.5 mr-1" /> Change character
                    </Button>
                )}
            </div>

            {isLegacy && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                    <div className="flex items-start gap-2">
                        <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-semibold text-amber-900">Pick your new character — free!</p>
                            <p className="text-xs text-amber-800">
                                Your avatar got an upgrade. Choose one of the new characters at no cost.
                            </p>
                        </div>
                    </div>
                    <Button
                        size="sm"
                        onClick={() => {
                            setErrorMessage(null);
                            setPendingPick(null);
                            setRerollOpen(true);
                        }}
                    >
                        <Sparkles className="w-4 h-4 mr-1.5" /> Choose your character
                    </Button>
                </div>
            )}

            <AvatarCanvas
                initialState={canvasInitialState ?? { items: [], character: { x: 0.5, y: 0.6, scale: 1, rotation: 0, zIndex: 0 } }}
                character={{
                    characterType: avatar.characterType,
                    baseAssetUrl: avatar.baseAssetUrl,
                    characterName: avatar.characterName,
                }}
                backgroundAssetType={avatar.background?.asset_type ?? null}
                backgroundAssetData={avatar.background?.asset_data ?? null}
                ownedItems={trayItems}
                onSave={handleCanvasSave}
                onPendingChange={setPendingSave}
            />

            {/* Background selector */}
            <section>
                <p className="text-xs font-semibold text-gray-700 mb-1.5">Background</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                    <button
                        type="button"
                        onClick={() => handleBackgroundChange(null)}
                        className={`shrink-0 w-20 h-14 rounded-xl border bg-white flex items-center justify-center text-xs font-medium ${
                            !avatar.background ? "ring-2 ring-blue-500" : ""
                        }`}
                    >
                        None
                    </button>
                    {ownedScenes.length === 0 && (
                        <p className="text-xs text-gray-500 self-center px-2">
                            Buy a scene in the shop to use it as a background.
                        </p>
                    )}
                    {ownedScenes.map((s) => {
                        const isCurrent = avatar.background?.id === s.id;
                        const url = s.asset_data?.url;
                        return (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => handleBackgroundChange(s.id)}
                                className={`shrink-0 w-20 h-14 rounded-xl border overflow-hidden flex items-center justify-center ${
                                    isCurrent ? "ring-2 ring-blue-500" : ""
                                }`}
                                style={{ backgroundColor: s.asset_data?.color ?? "#e5e7eb" }}
                                aria-label={`Use ${s.name} as background`}
                            >
                                {url ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={url} alt={s.name} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-2xl" aria-hidden>{s.asset_data?.emoji ?? "🎨"}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </section>

            {onGoToShop && trayItems.length === 0 && (
                <div className="text-center">
                    <Button size="sm" variant="outline" onClick={onGoToShop}>
                        Visit the shop →
                    </Button>
                </div>
            )}

            {/* Reroll dialog */}
            <Dialog
                open={rerollOpen}
                onOpenChange={(open) => {
                    if (!open && !submitting) {
                        setRerollOpen(false);
                        setPendingPick(null);
                        setErrorMessage(null);
                    }
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <div className="space-y-4 p-2">
                        <div className="text-center">
                            <h3 className="text-lg font-bold text-gray-900">
                                {isLegacy ? "Pick your character" : "Change your character"}
                            </h3>
                            <p className="text-sm text-gray-600 mt-1">
                                The canvas resets to a blank scene with your new character.
                                {!isLegacy && (
                                    <>
                                        {" "}Same type free, swapping type costs <Star className="inline w-3.5 h-3.5 fill-amber-400 text-amber-500" /> {rerollCost}.
                                    </>
                                )}
                            </p>
                            {!isLegacy && (
                                <p className="text-xs text-gray-500 mt-1">
                                    Balance: <Star className="inline w-3 h-3 fill-amber-400 text-amber-500" /> {balance}
                                </p>
                            )}
                        </div>

                        {(["human", "animal", "robot"] as CharacterType[]).map((type) => {
                            const list = catalogByType[type];
                            if (!list || list.length === 0) return null;
                            return (
                                <section key={type}>
                                    <h4 className="text-xs font-semibold uppercase text-gray-600 mb-1.5">
                                        {TYPE_LABEL[type]} {CHARACTER_OPTIONS.find((o) => o.type === type)?.emoji}
                                    </h4>
                                    <div className="grid grid-cols-3 gap-2">
                                        {list.map((c) => {
                                            const isCurrent = avatar.characterId === c.id;
                                            const isSelected = pendingPick?.id === c.id;
                                            const swapCost = costForSwap(c);
                                            return (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    disabled={isCurrent || submitting}
                                                    onClick={() => setPendingPick(c)}
                                                    className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center ${
                                                        isCurrent
                                                            ? "opacity-50 cursor-not-allowed bg-gray-50"
                                                            : isSelected
                                                                ? "border-blue-600 bg-blue-50"
                                                                : "bg-white hover:bg-gray-50"
                                                    }`}
                                                >
                                                    <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={c.asset_url}
                                                            alt={c.name}
                                                            className="max-w-full max-h-full object-contain"
                                                        />
                                                    </div>
                                                    <span className="text-xs font-semibold">{c.name}</span>
                                                    {isCurrent ? (
                                                        <span className="text-[10px] text-gray-500">Current</span>
                                                    ) : swapCost > 0 ? (
                                                        <span className="text-[10px] text-amber-700 flex items-center gap-0.5">
                                                            <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-500" />
                                                            {swapCost}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] text-green-700">Free</span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}

                        {errorMessage && <p className="text-sm text-red-600 text-center">{errorMessage}</p>}
                        <div className="flex gap-2 justify-end">
                            <Button
                                variant="outline"
                                disabled={submitting}
                                onClick={() => {
                                    setRerollOpen(false);
                                    setPendingPick(null);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                disabled={
                                    !pendingPick ||
                                    submitting ||
                                    (costForSwap(pendingPick) > 0 && balance < costForSwap(pendingPick))
                                }
                                onClick={handleReroll}
                            >
                                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                {pendingPick && costForSwap(pendingPick) > 0
                                    ? `Confirm ⭐${costForSwap(pendingPick)}`
                                    : "Confirm"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
