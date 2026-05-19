"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

interface StarsState {
    balance: number;
    lifetime: number;
    refresh: () => Promise<void>;
}

const StarsContext = createContext<StarsState | null>(null);

interface StarsProviderProps {
    children: ReactNode;
    // Stars only have meaning for students. The provider can be mounted at the
    // student layout level so it never fires for teachers/admins; passing
    // enabled={false} short-circuits the effect entirely.
    enabled?: boolean;
}

export function StarsProvider({ children, enabled = true }: StarsProviderProps) {
    const [balance, setBalance] = useState(0);
    const [lifetime, setLifetime] = useState(0);
    // First fetch shouldn't trigger a toast — we don't want a "+42 ⭐" pop on
    // initial load just because we went from 0 to whatever they already have.
    const initializedRef = useRef(false);

    const refresh = useCallback(async () => {
        if (!enabled) return;
        try {
            const res = await fetch("/api/student/stars", { cache: "no-store" });
            if (!res.ok) return;
            const data = (await res.json()) as { balance: number; lifetime: number };
            setBalance((prev) => {
                if (initializedRef.current && data.balance > prev) {
                    const delta = data.balance - prev;
                    toast.success(`+${delta} ⭐`, { duration: 1800 });
                }
                return data.balance;
            });
            setLifetime(data.lifetime);
            initializedRef.current = true;
        } catch (error) {
            console.error("[StarsProvider] refresh failed:", error);
        }
    }, [enabled]);

    useEffect(() => {
        if (!enabled) return;
        refresh();
        const handleVisible = () => {
            if (document.visibilityState === "visible") refresh();
        };
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", handleVisible);
        return () => {
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", handleVisible);
        };
    }, [enabled, refresh]);

    return (
        <StarsContext.Provider value={{ balance, lifetime, refresh }}>
            {children}
        </StarsContext.Provider>
    );
}

export function useStars(): StarsState {
    const ctx = useContext(StarsContext);
    if (!ctx) {
        // Allow components above the provider to call this safely with zeros
        // (e.g. teacher pages where stars don't apply). Cheaper than threading
        // optionality through every consumer.
        return { balance: 0, lifetime: 0, refresh: async () => {} };
    }
    return ctx;
}
