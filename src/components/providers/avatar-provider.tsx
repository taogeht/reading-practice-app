"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AvatarDto, BareCanvasState } from "@/lib/gamification/avatar";

interface AvatarState {
    avatar: AvatarDto | null;
    rerollCost: number;
    loading: boolean;
    // Returns the freshly-fetched avatar (or null) so callers can confirm
    // the load succeeded before claiming the UI has caught up to the server.
    refresh: () => Promise<AvatarDto | null>;
    setAvatar: (avatar: AvatarDto | null) => void;
    // Phase 6: editors can update local canvas state without a refetch so the
    // UI stays at 60fps during drags. The provider holds the latest hydrated
    // avatar; the editor handles its own optimistic local state and patches
    // the server on debounce.
    updateLocalCanvas: (updater: (state: BareCanvasState) => BareCanvasState) => void;
}

const AvatarContext = createContext<AvatarState | null>(null);

interface AvatarProviderProps {
    children: ReactNode;
    enabled?: boolean;
}

const EMPTY_REROLL_COST = 20;

export function AvatarProvider({ children, enabled = true }: AvatarProviderProps) {
    const [avatar, setAvatar] = useState<AvatarDto | null>(null);
    const [rerollCost, setRerollCost] = useState<number>(EMPTY_REROLL_COST);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async (): Promise<AvatarDto | null> => {
        if (!enabled) return null;
        try {
            const res = await fetch("/api/student/character", { cache: "no-store" });
            if (!res.ok) {
                console.warn(`[AvatarProvider] refresh got status ${res.status}`);
                setLoading(false);
                return null;
            }
            const data = (await res.json()) as { avatar: AvatarDto | null; reroll_cost?: number };
            setAvatar(data.avatar);
            if (typeof data.reroll_cost === "number") setRerollCost(data.reroll_cost);
            return data.avatar;
        } catch (error) {
            console.error("[AvatarProvider] refresh failed:", error);
            return null;
        } finally {
            setLoading(false);
        }
    }, [enabled]);

    useEffect(() => {
        if (!enabled) {
            setLoading(false);
            return;
        }
        refresh();
    }, [enabled, refresh]);

    const updateLocalCanvas = useCallback(
        (updater: (state: BareCanvasState) => BareCanvasState) => {
            setAvatar((prev) => {
                if (!prev) return prev;
                const bare: BareCanvasState = {
                    items: prev.canvas.items.map((i) => ({
                        itemId: i.itemId,
                        category: i.category,
                        x: i.x,
                        y: i.y,
                        scale: i.scale,
                        rotation: i.rotation,
                        zIndex: i.zIndex,
                    })),
                    character: prev.canvas.character,
                };
                const next = updater(bare);
                return {
                    ...prev,
                    canvas: {
                        items: next.items.map((bareItem) => {
                            const existing = prev.canvas.items.find((i) => i.itemId === bareItem.itemId);
                            // Carry hydrated metadata for items that were already on the canvas;
                            // newly-added items must be hydrated by the caller before passing
                            // the updater (we have nothing to look up here).
                            return existing
                                ? { ...existing, ...bareItem }
                                : ({ ...bareItem, name: "", asset_type: "css", asset_data: {} });
                        }),
                        character: next.character,
                    },
                };
            });
        },
        [],
    );

    return (
        <AvatarContext.Provider
            value={{ avatar, rerollCost, loading, refresh, setAvatar, updateLocalCanvas }}
        >
            {children}
        </AvatarContext.Provider>
    );
}

export function useAvatar(): AvatarState {
    const ctx = useContext(AvatarContext);
    if (!ctx) {
        return {
            avatar: null,
            rerollCost: EMPTY_REROLL_COST,
            loading: false,
            refresh: async () => null,
            setAvatar: () => {},
            updateLocalCanvas: () => {},
        };
    }
    return ctx;
}
