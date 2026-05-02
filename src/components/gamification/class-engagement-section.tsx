"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Loader2, Sparkles, Trophy } from "lucide-react";

interface RosterEntry {
    studentId: string;
    firstName: string;
    lastName: string;
    avatarEmoji: string | null;
    animal: { key: string; displayName: string; image: string };
    currentLevel: number;
    totalXp: number;
    weekXp: number;
    currentStreakDays: number;
    lastActivityDate: string | null;
}

interface EngagementResponse {
    students: RosterEntry[];
    leaderboardEnabled: boolean;
    weekTotalXp: number;
}

interface ClassEngagementSectionProps {
    classId: string;
    defaultExpanded?: boolean;
}

export function ClassEngagementSection({ classId, defaultExpanded = false }: ClassEngagementSectionProps) {
    const router = useRouter();
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [data, setData] = useState<EngagementResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingToggle, setSavingToggle] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/teacher/classes/${classId}/engagement`);
                if (!res.ok) throw new Error("Failed to load");
                const json = (await res.json()) as EngagementResponse;
                if (!cancelled) setData(json);
            } catch (err: any) {
                if (!cancelled) setError(err.message || "Failed to load engagement data");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [classId]);

    const toggleLeaderboard = async () => {
        if (!data || savingToggle) return;
        const next = !data.leaderboardEnabled;
        setSavingToggle(true);
        try {
            const res = await fetch(`/api/teacher/classes/${classId}/engagement`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ leaderboardEnabled: next }),
            });
            if (!res.ok) throw new Error("Failed to update");
            setData({ ...data, leaderboardEnabled: next });
        } catch {
            // swallow — the UI revert isn't worth a toast for this MVP
        } finally {
            setSavingToggle(false);
        }
    };

    const totalActive = data?.students.filter((s) => s.weekXp > 0).length ?? 0;

    return (
        <Card className={`transition-all ${isExpanded ? "" : "hover:bg-gray-50"}`}>
            <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    <div>
                        <h3 className="font-medium">Engagement</h3>
                        <p className="text-sm text-gray-500">
                            {loading
                                ? "Loading…"
                                : data
                                    ? `${totalActive} active this week · ${data.weekTotalXp} class XP earned`
                                    : "Engagement unavailable"}
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

                    {!loading && !error && data && (
                        <>
                            {/* Leaderboard toggle */}
                            <div className="flex items-start justify-between gap-3 mt-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900">Show leaderboard to students</p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        When on, students in this class see /student/leaderboard with the class top 10. Off by default.
                                    </p>
                                </div>
                                <Button
                                    variant={data.leaderboardEnabled ? "default" : "outline"}
                                    size="sm"
                                    onClick={toggleLeaderboard}
                                    disabled={savingToggle}
                                >
                                    {savingToggle ? <Loader2 className="w-4 h-4 animate-spin" /> : data.leaderboardEnabled ? "On" : "Off"}
                                </Button>
                            </div>

                            {/* Roster */}
                            {data.students.length === 0 ? (
                                <p className="text-sm text-gray-500 py-4 text-center">No students enrolled yet.</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {data.students.map((s, i) => (
                                        <button
                                            key={s.studentId}
                                            onClick={() => router.push(`/teacher/students/${s.studentId}`)}
                                            className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 hover:border-amber-300 hover:bg-amber-50/40 transition-colors text-left"
                                        >
                                            <span className="shrink-0 w-6 text-center text-sm font-bold text-gray-400">{i + 1}</span>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={s.animal.image}
                                                alt={s.animal.displayName}
                                                className="w-8 h-8 rounded-lg bg-white border border-gray-200 object-contain"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm text-gray-900 truncate">
                                                    {s.firstName} {s.lastName}
                                                </div>
                                                <div className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200">
                                                        Lvl {s.currentLevel}
                                                    </Badge>
                                                    {s.currentStreakDays > 0 && (
                                                        <span className="text-orange-600 font-medium">🔥 {s.currentStreakDays}d</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="text-sm font-semibold text-amber-700 flex items-center gap-1">
                                                    <Sparkles className="w-3 h-3" />
                                                    {s.weekXp}
                                                </div>
                                                <div className="text-[10px] text-gray-400">{s.totalXp} total</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
