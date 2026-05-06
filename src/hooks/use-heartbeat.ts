"use client";

import { useEffect, useRef } from "react";

const HEARTBEAT_INTERVAL_MS = 60_000;
// Only count the user as "active" if they've produced input in this window.
// Slightly larger than the heartbeat interval so a kid who pauses between
// taps for ~1 minute doesn't immediately drop off.
const ACTIVITY_WINDOW_MS = 90_000;

const ACTIVITY_EVENTS = [
    "mousemove",
    "click",
    "keydown",
    "touchstart",
    "wheel",
    "scroll",
    "pointerdown",
] as const;

/**
 * Sends heartbeat pings while the student is *actually doing something* on
 * the page — not just leaving a tab open. The server uses the heartbeat to
 * compute "online now" and total time online for the teacher activity
 * dashboard.
 *
 * Rules:
 *   - Fire one ping on mount (the page load itself is an intentional action).
 *   - Then every 60s, ping only if (a) input within last 90s, AND (b) tab is
 *     foregrounded. An idle browser tab stops pinging within ~1.5 minutes.
 *   - Re-fire when the tab returns to the foreground after being hidden.
 */
export function useHeartbeat() {
    const lastInputAtRef = useRef<number>(Date.now());
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const sendHeartbeat = () => {
            fetch("/api/student/heartbeat", { method: "POST" }).catch(() => {});
        };

        const onInput = () => {
            lastInputAtRef.current = Date.now();
        };

        ACTIVITY_EVENTS.forEach((evt) =>
            window.addEventListener(evt, onInput, { passive: true }),
        );

        // Initial heartbeat — they just opened the page, that counts.
        sendHeartbeat();

        intervalRef.current = setInterval(() => {
            const recentInput = Date.now() - lastInputAtRef.current < ACTIVITY_WINDOW_MS;
            const visible = document.visibilityState === "visible";
            if (recentInput && visible) {
                sendHeartbeat();
            }
        }, HEARTBEAT_INTERVAL_MS);

        // Returning to the tab is itself a deliberate action — refresh the
        // activity timestamp and ping immediately so the dashboard reflects
        // the kid coming back from another tab/app.
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                lastInputAtRef.current = Date.now();
                sendHeartbeat();
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onInput));
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, []);
}
