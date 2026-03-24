"use client";

import { useEffect, useRef } from "react";

const HEARTBEAT_INTERVAL = 60_000; // 60 seconds

/**
 * Sends periodic heartbeat pings to keep session activity tracking accurate.
 * Also sends a heartbeat on visibility change (when user returns to tab).
 */
export function useHeartbeat() {
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const sendHeartbeat = () => {
            fetch("/api/student/heartbeat", { method: "POST" }).catch(() => {});
        };

        // Send initial heartbeat
        sendHeartbeat();

        // Set up interval
        intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        // Also send heartbeat when page becomes visible again
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                sendHeartbeat();
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, []);
}
