"use client";

// Phase 6 free-canvas editor. Lets the student drag/pinch/rotate items and
// the character on a single stage; calls onSave with the new bare state after
// a 1.5s debounce. Phase 7+ groundwork (drag boundaries, per-item locking,
// snap-to-grid) can hook into the same gesture pipeline without rewiring the
// component contract.
//
// Gestures (mobile):
//   1 finger on item → drag
//   1 finger held >500ms without moving → reveal × remove button
//   2 fingers on canvas → pinch (scale) + twist (rotate) the selected item
// Desktop: pointer drag only; no scale/rotate (per Phase 6 scope).
//
// The component owns the live state for responsiveness; the parent only sees
// state updates via the debounced onSave callback.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type {
    BareCanvasState,
    CanvasItemDto,
    CharacterType,
} from "@/lib/gamification/avatar";

const STAGE_W = 320;
const STAGE_H = 420;
const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD_PX = 8;
const SAVE_DEBOUNCE_MS = 3000;

const DEFAULT_HEIGHT_FRACTION: Record<string, number> = {
    character: 0.7,
    hat: 0.22,
    outfit: 0.32,
    accessory: 0.18,
    sticker: 0.18,
    trophy: 0.22,
    pet: 0.22,
};

type BgAssetData = { url?: string; emoji?: string; color?: string };

export interface CanvasOwnedItem {
    id: string;
    name: string;
    category: string;
    asset_type: string;
    asset_data: { emoji?: string; color?: string; url?: string };
}

export interface CharacterItemInput {
    characterType: CharacterType;
    baseAssetUrl: string | null;
    characterName: string | null;
}

interface Props {
    initialState: BareCanvasState;
    character: CharacterItemInput;
    backgroundAssetType: string | null;
    backgroundAssetData: BgAssetData | null;
    ownedItems: CanvasOwnedItem[];
    onSave: (state: BareCanvasState) => void | Promise<void>;
    onPendingChange?: (pending: boolean) => void;
}

const CHARACTER_KEY = "__character__";

type ItemKey = string; // either CHARACTER_KEY or an inventory item id

interface DragGesture {
    key: ItemKey;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    hasMoved: boolean;
    pointerId: number;
}

interface PinchGesture {
    key: ItemKey;
    startDistance: number;
    startAngle: number;
    startScale: number;
    startRotation: number;
}

function bumpZ(state: BareCanvasState, key: ItemKey): BareCanvasState {
    const all = [state.character.zIndex, ...state.items.map((i) => i.zIndex)];
    const next = Math.max(0, ...all) + 1;
    if (key === CHARACTER_KEY) {
        return { ...state, character: { ...state.character, zIndex: next } };
    }
    return {
        ...state,
        items: state.items.map((it) => (it.itemId === key ? { ...it, zIndex: next } : it)),
    };
}

function distanceBetween(t1: Touch, t2: Touch): number {
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    return Math.hypot(dx, dy);
}

function angleBetween(t1: Touch, t2: Touch): number {
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    return (Math.atan2(dy, dx) * 180) / Math.PI;
}

export function AvatarCanvas({
    initialState,
    character,
    backgroundAssetType,
    backgroundAssetData,
    ownedItems,
    onSave,
    onPendingChange,
}: Props) {
    const [state, setState] = useState<BareCanvasState>(initialState);
    const [removalKey, setRemovalKey] = useState<ItemKey | null>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragGesture | null>(null);
    const pinchRef = useRef<PinchGesture | null>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Re-sync if the parent hands us a fresh server state (e.g. after reroll
    // or first load). The parent is expected to memoize initialState so the
    // reference only changes when the server-side avatar actually changes —
    // unrelated parent re-renders shouldn't wipe in-progress local edits.
    useEffect(() => {
        setState(initialState);
    }, [initialState]);

    const scheduleSave = useCallback(
        (next: BareCanvasState) => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            onPendingChange?.(true);
            saveTimerRef.current = setTimeout(() => {
                saveTimerRef.current = null;
                onPendingChange?.(false);
                void Promise.resolve(onSave(next));
            }, SAVE_DEBOUNCE_MS);
        },
        [onSave, onPendingChange],
    );

    const updateAndSave = useCallback(
        (updater: (s: BareCanvasState) => BareCanvasState) => {
            setState((prev) => {
                const next = updater(prev);
                scheduleSave(next);
                return next;
            });
        },
        [scheduleSave],
    );

    const ownedItemMap = useMemo(() => {
        const m = new Map<string, CanvasOwnedItem>();
        for (const o of ownedItems) m.set(o.id, o);
        return m;
    }, [ownedItems]);

    const onCanvasItems = state.items;
    const itemsOnCanvasSet = useMemo(() => new Set(onCanvasItems.map((i) => i.itemId)), [onCanvasItems]);

    // ------- gesture handlers ------------------------------------------------

    const clearLongPress = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const handlePointerDown = (event: React.PointerEvent, key: ItemKey) => {
        // Skip if a pinch is in progress (touch handlers own the gesture)
        if (pinchRef.current) return;
        if (event.pointerType === "touch" && event.isPrimary === false) return;

        event.stopPropagation();
        const stage = stageRef.current;
        if (!stage) return;
        (event.target as HTMLElement).setPointerCapture?.(event.pointerId);

        // Bring to front + dismiss any pending × button on another item
        if (removalKey && removalKey !== key) setRemovalKey(null);

        // Read current item position
        const current =
            key === CHARACTER_KEY
                ? state.character
                : state.items.find((i) => i.itemId === key);
        if (!current) return;

        dragRef.current = {
            key,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startX: current.x,
            startY: current.y,
            hasMoved: false,
            pointerId: event.pointerId,
        };

        // Start long-press timer.
        clearLongPress();
        if (key !== CHARACTER_KEY) {
            longPressTimerRef.current = setTimeout(() => {
                longPressTimerRef.current = null;
                if (!dragRef.current?.hasMoved) {
                    setRemovalKey(key);
                }
            }, LONG_PRESS_MS);
        }

        // Always bring touched item to top — feels right when stacking gets dense.
        setState((prev) => bumpZ(prev, key));
    };

    const handlePointerMove = (event: React.PointerEvent) => {
        if (pinchRef.current) return; // pinch in progress, ignore drag
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const stage = stageRef.current;
        if (!stage) return;

        const rect = stage.getBoundingClientRect();
        const dx = event.clientX - drag.startClientX;
        const dy = event.clientY - drag.startClientY;

        if (!drag.hasMoved && Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) {
            drag.hasMoved = true;
            clearLongPress();
            // First movement cancels any active × overlay so the kid doesn't
            // accidentally tap the trash icon while dragging.
            if (removalKey === drag.key) setRemovalKey(null);
        }

        if (!drag.hasMoved) return;

        const newX = drag.startX + dx / rect.width;
        const newY = drag.startY + dy / rect.height;
        // Apply locally; debounced save fires on pointerup.
        setState((prev) => {
            if (drag.key === CHARACTER_KEY) {
                return { ...prev, character: { ...prev.character, x: newX, y: newY } };
            }
            return {
                ...prev,
                items: prev.items.map((it) =>
                    it.itemId === drag.key ? { ...it, x: newX, y: newY } : it,
                ),
            };
        });
    };

    const handlePointerUp = (event: React.PointerEvent) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        clearLongPress();
        dragRef.current = null;
        if (drag.hasMoved) {
            // Persist the final position.
            setState((prev) => {
                scheduleSave(prev);
                return prev;
            });
        }
    };

    // -- multi-touch pinch + rotate (mobile only) -----------------------------
    const handleTouchStart = (event: React.TouchEvent) => {
        if (event.touches.length !== 2) return;
        // Find which item the first finger landed on by reading our drag state
        // (or fall back to character).
        const drag = dragRef.current;
        const key: ItemKey = drag?.key ?? CHARACTER_KEY;
        const current =
            key === CHARACTER_KEY ? state.character : state.items.find((i) => i.itemId === key);
        if (!current) return;

        // Cancel any in-flight drag — the pinch supersedes single-finger move.
        dragRef.current = null;
        clearLongPress();

        const [t1, t2] = [event.touches[0], event.touches[1]];
        pinchRef.current = {
            key,
            startDistance: distanceBetween(t1, t2),
            startAngle: angleBetween(t1, t2),
            startScale: current.scale,
            startRotation: current.rotation,
        };
    };

    const handleTouchMove = (event: React.TouchEvent) => {
        const pinch = pinchRef.current;
        if (!pinch || event.touches.length !== 2) return;
        event.preventDefault(); // suppress page-scroll while pinching

        const [t1, t2] = [event.touches[0], event.touches[1]];
        const dist = distanceBetween(t1, t2);
        const ang = angleBetween(t1, t2);

        const rawScale = pinch.startScale * (dist / pinch.startDistance);
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, rawScale));
        const newRotation = pinch.startRotation + (ang - pinch.startAngle);

        setState((prev) => {
            if (pinch.key === CHARACTER_KEY) {
                return {
                    ...prev,
                    character: { ...prev.character, scale: newScale, rotation: newRotation },
                };
            }
            return {
                ...prev,
                items: prev.items.map((it) =>
                    it.itemId === pinch.key ? { ...it, scale: newScale, rotation: newRotation } : it,
                ),
            };
        });
    };

    const handleTouchEnd = (event: React.TouchEvent) => {
        if (event.touches.length < 2 && pinchRef.current) {
            // Lifted to ≤1 finger — end the pinch and persist.
            pinchRef.current = null;
            setState((prev) => {
                scheduleSave(prev);
                return prev;
            });
        }
    };

    // ------- tray actions ----------------------------------------------------

    const addItemToCanvas = (item: CanvasOwnedItem) => {
        if (itemsOnCanvasSet.has(item.id)) return;
        updateAndSave((prev) => {
            const next = {
                ...prev,
                items: [
                    ...prev.items,
                    {
                        itemId: item.id,
                        category: item.category,
                        x: 0.5,
                        y: 0.5,
                        scale: 1,
                        rotation: 0,
                        zIndex: Math.max(0, prev.character.zIndex, ...prev.items.map((i) => i.zIndex)) + 1,
                    },
                ],
            };
            return next;
        });
    };

    const removeItemFromCanvas = (itemId: string) => {
        setRemovalKey(null);
        updateAndSave((prev) => ({
            ...prev,
            items: prev.items.filter((it) => it.itemId !== itemId),
        }));
    };

    // ------- render ----------------------------------------------------------

    const renderCharacter = () => {
        const c = state.character;
        const heightPx = STAGE_H * DEFAULT_HEIGHT_FRACTION.character * c.scale;
        const leftPx = c.x * STAGE_W;
        const topPx = c.y * STAGE_H;
        return (
            <div
                key={CHARACTER_KEY}
                onPointerDown={(e) => handlePointerDown(e, CHARACTER_KEY)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="absolute touch-none select-none cursor-grab active:cursor-grabbing"
                style={{
                    left: leftPx,
                    top: topPx,
                    transform: `translate(-50%, -50%) rotate(${c.rotation}deg)`,
                    zIndex: c.zIndex,
                    height: heightPx,
                }}
            >
                {character.baseAssetUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={character.baseAssetUrl}
                        alt=""
                        draggable={false}
                        className="h-full w-auto pointer-events-none"
                    />
                ) : (
                    <span style={{ fontSize: heightPx * 0.6 }}>
                        {character.characterType === "human"
                            ? "🧑"
                            : character.characterType === "animal"
                                ? "🐻"
                                : "🤖"}
                    </span>
                )}
            </div>
        );
    };

    const renderItem = (it: BareCanvasState["items"][number]) => {
        const owned = ownedItemMap.get(it.itemId);
        if (!owned) return null;
        const heightPx = STAGE_H * (DEFAULT_HEIGHT_FRACTION[it.category] ?? 0.22) * it.scale;
        const leftPx = it.x * STAGE_W;
        const topPx = it.y * STAGE_H;
        const showRemove = removalKey === it.itemId;
        const url = owned.asset_data?.url;

        return (
            <div
                key={it.itemId}
                onPointerDown={(e) => handlePointerDown(e, it.itemId)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="absolute touch-none select-none cursor-grab active:cursor-grabbing"
                style={{
                    left: leftPx,
                    top: topPx,
                    transform: `translate(-50%, -50%) rotate(${it.rotation}deg)`,
                    zIndex: it.zIndex,
                    height: heightPx,
                }}
            >
                {url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={url} alt={owned.name} draggable={false} className="h-full w-auto pointer-events-none" />
                ) : (
                    <span
                        className="flex items-center justify-center rounded-full pointer-events-none"
                        style={{
                            width: heightPx,
                            height: heightPx,
                            backgroundColor: owned.asset_data?.color ?? "#e5e7eb",
                            fontSize: heightPx * 0.6,
                        }}
                    >
                        {owned.asset_data?.emoji ?? "🎁"}
                    </span>
                )}
                {showRemove && (
                    <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            removeItemFromCanvas(it.itemId);
                        }}
                        aria-label={`Remove ${owned.name}`}
                        className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md border-2 border-white"
                        style={{ transform: `rotate(${-it.rotation}deg)` }}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        );
    };

    // ------- background --------------------------------------------------------

    const bgUrl = backgroundAssetType === "image" ? backgroundAssetData?.url : null;
    const bgColor = backgroundAssetData?.color ?? "#e5e7eb";
    const bgEmoji = backgroundAssetData?.emoji;

    return (
        <div className="flex flex-col items-center gap-4">
            <div
                ref={stageRef}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onPointerDown={() => setRemovalKey(null)}
                className="relative rounded-2xl overflow-hidden border-2 border-white shadow-md select-none touch-none"
                style={{ width: STAGE_W, height: STAGE_H, backgroundColor: bgColor }}
            >
                {bgUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={bgUrl}
                        alt=""
                        aria-hidden
                        draggable={false}
                        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    />
                ) : (
                    bgEmoji && (
                        <span
                            aria-hidden
                            className="absolute inset-0 flex items-center justify-center opacity-60 pointer-events-none"
                            style={{ fontSize: STAGE_H * 0.4 }}
                        >
                            {bgEmoji}
                        </span>
                    )
                )}

                {/* Render character + items in zIndex order so paint order
                    matches the layering on screen — React's reconciler doesn't
                    look at our zIndex CSS, browsers do. Both are sent so the
                    initial mount paints right even before React re-sorts. */}
                {[
                    { key: CHARACTER_KEY, z: state.character.zIndex, node: renderCharacter() },
                    ...state.items.map((it) => ({ key: it.itemId, z: it.zIndex, node: renderItem(it) })),
                ]
                    .sort((a, b) => a.z - b.z)
                    .map((entry) => entry.node)}
            </div>

            {/* Item tray */}
            {ownedItems.length === 0 ? (
                <p className="text-xs text-gray-500">Buy some items in the shop to dress up your character!</p>
            ) : (
                <div className="w-full">
                    <p className="text-xs text-gray-600 mb-1.5">Tap to add or remove. Drag, pinch, and twist items on the stage.</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {ownedItems.map((item) => {
                            const onCanvas = itemsOnCanvasSet.has(item.id);
                            const url = item.asset_data?.url;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => (onCanvas ? removeItemFromCanvas(item.id) : addItemToCanvas(item))}
                                    className={`shrink-0 relative w-16 h-16 rounded-xl border bg-white flex items-center justify-center overflow-hidden ${
                                        onCanvas ? "ring-2 ring-amber-400" : ""
                                    }`}
                                    aria-label={onCanvas ? `Remove ${item.name}` : `Add ${item.name}`}
                                >
                                    {url ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img src={url} alt={item.name} className="max-w-full max-h-full object-contain" />
                                    ) : (
                                        <span
                                            className="flex items-center justify-center w-10 h-10 rounded-full text-xl"
                                            style={{ backgroundColor: item.asset_data?.color ?? "#e5e7eb" }}
                                        >
                                            {item.asset_data?.emoji ?? "🎁"}
                                        </span>
                                    )}
                                    {onCanvas && (
                                        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center border border-white">
                                            ✓
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
