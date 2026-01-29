"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export default function ScreenTracker() {
    const pathname = usePathname();
    const currentSessionId = useRef<string | null>(null);

    useEffect(() => {
        // Function to start a new session
        const startSession = async (screen: string) => {
            try {
                const res = await fetch("/api/screen-sessions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "start", screen }),
                });

                if (res.ok) {
                    const data = await res.json();
                    currentSessionId.current = data.sessionId;
                } else if (res.status === 401) {
                    // User not logged in, ignore
                    currentSessionId.current = null;
                }
            } catch (error) {
                console.error("Failed to start screen session", error);
            }
        };

        // Function to end the current session
        const endSession = async () => {
            if (!currentSessionId.current) return;

            const sessionId = currentSessionId.current;
            currentSessionId.current = null;

            try {
                // Use keepalive if supported (good for page unloads)
                await fetch("/api/screen-sessions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "end", sessionId }),
                    keepalive: true,
                });
            } catch (error) {
                console.error("Failed to end screen session", error);
            }
        };

        // When pathname changes:
        // 1. End previous session
        endSession();
        // 2. Start new session
        startSession(pathname);

        // Cleanup on unmount (e.g. tab close or full refresh)
        return () => {
            endSession();
        };
    }, [pathname]);

    return null;
}
