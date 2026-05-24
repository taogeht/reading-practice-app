"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "student-tts-playback-rate";
const MIN_RATE = 0.5;
const MAX_RATE = 1.0;
const DEFAULT_RATE = 1.0;

function clamp(rate: number): number {
    if (Number.isNaN(rate)) return DEFAULT_RATE;
    if (rate < MIN_RATE) return MIN_RATE;
    if (rate > MAX_RATE) return MAX_RATE;
    return rate;
}

function readInitial(): number {
    if (typeof window === "undefined") return DEFAULT_RATE;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_RATE;
    return clamp(parseFloat(raw));
}

/**
 * Shared TTS playback-rate preference for student audio surfaces.
 * Persisted to localStorage so the choice carries across pages and sessions.
 */
export function usePlaybackRate(): [number, (rate: number) => void] {
    const [rate, setRateState] = useState<number>(DEFAULT_RATE);

    // Hydrate from localStorage after mount to avoid SSR mismatch.
    useEffect(() => {
        setRateState(readInitial());
    }, []);

    const setRate = useCallback((next: number) => {
        const clamped = clamp(next);
        setRateState(clamped);
        if (typeof window !== "undefined") {
            window.localStorage.setItem(STORAGE_KEY, String(clamped));
        }
    }, []);

    return [rate, setRate];
}
