"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Sparkles } from "lucide-react";

interface ProgressionData {
    totalXp: number;
    currentLevel: number;
    xpInLevel: number;
    xpForNextLevel: number;
    fractionToNextLevel: number;
    currentStreakDays: number;
    longestStreakDays: number;
    todayXp: number;
    currentAnimal: { key: string; displayName: string; image: string };
    totalAnimalsAvailable: number;
    recentUnlocks: Array<{ type: string; key: string; unlockedAt: string }>;
}

export function StudentProgressionCard() {
    const [data, setData] = useState<ProgressionData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/student/progression");
                if (!res.ok) return;
                const json = (await res.json()) as ProgressionData;
                if (!cancelled) setData(json);
            } catch {
                /* swallow */
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    if (loading) {
        return (
            <Card className="border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50">
                <CardContent className="py-6 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                </CardContent>
            </Card>
        );
    }

    if (!data) return null;

    const pct = Math.min(100, Math.round(data.fractionToNextLevel * 100));

    return (
        <Card className="border-2 border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 shadow-md overflow-hidden">
            <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-4 sm:gap-6">
                    {/* Animal avatar — the star of the card */}
                    <div className="shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white border-2 border-amber-300 flex items-center justify-center shadow-inner overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={data.currentAnimal.image}
                            alt={data.currentAnimal.displayName}
                            className="w-full h-full object-contain p-1"
                        />
                    </div>

                    <div className="flex-1 min-w-0">
                        {/* Level + XP row */}
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-2xl sm:text-3xl font-extrabold text-amber-700">
                                Level {data.currentLevel}
                            </span>
                            <span className="text-sm font-semibold text-amber-600">
                                {data.currentAnimal.displayName}
                            </span>
                        </div>

                        {/* XP progress bar */}
                        <div className="mt-2">
                            <div className="h-3 w-full bg-amber-100 rounded-full overflow-hidden border border-amber-200">
                                <div
                                    className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <div className="flex items-center justify-between mt-1 text-[11px] sm:text-xs text-amber-700 font-medium">
                                <span>{data.xpInLevel} / {data.xpForNextLevel} XP</span>
                                <span>{data.totalXp} total</span>
                            </div>
                        </div>

                        {/* Streak + today's XP */}
                        <div className="flex items-center gap-3 mt-3 flex-wrap">
                            {data.currentStreakDays > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100 border border-orange-300 text-orange-800 text-xs font-bold">
                                    🔥 {data.currentStreakDays} day{data.currentStreakDays === 1 ? "" : "s"}
                                </span>
                            )}
                            {data.todayXp > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold">
                                    <Sparkles className="w-3 h-3" />
                                    +{data.todayXp} today
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
