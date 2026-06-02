"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Activity,
    BookOpen,
    ChevronDown,
    ChevronUp,
    Flame,
    HelpCircle,
    Loader2,
    RefreshCw,
    ArrowUpDown,
    ChevronRight,
} from "lucide-react";

type ActivityStatus = "online" | "active" | "slipping" | "never";

interface StudentActivity {
    studentId: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    status: ActivityStatus;
    hasEverLoggedIn: boolean;
    isCurrentlyOnline: boolean;
    lastLoginAt: string | null;
    lastActivityAt: string | null;
    activeInWindow: boolean;
    sessionCount: number;
    totalMinutesOnline: number;
    recordingsCount: number;
    questionsAnswered: number;
    spellingGames: number;
    actionsCount: number;
    currentStreakDays: number;
}

interface ActivityCounts {
    total: number;
    online: number;
    active: number;
    slipping: number;
    everLoggedIn: number;
    neverLoggedIn: number;
}

interface LoginActivitySectionProps {
    classId: string;
    defaultExpanded?: boolean;
}

type SortOption = "status" | "name" | "lastLogin" | "mostActive";
type DateRange = "7" | "30" | "all";

const BUCKET_RANK: Record<ActivityStatus, number> = { online: 0, active: 1, slipping: 2, never: 3 };

const STATUS_META: Record<ActivityStatus, { label: string; card: string; text: string; dot: string }> = {
    online: { label: "Online", card: "bg-green-50 border-green-200 hover:bg-green-100", text: "text-green-600", dot: "bg-green-500" },
    active: { label: "Active", card: "bg-white border-gray-200 hover:bg-gray-50", text: "text-blue-600", dot: "bg-blue-400" },
    slipping: { label: "Slipping", card: "bg-amber-50/60 border-amber-200 hover:bg-amber-50", text: "text-amber-700", dot: "bg-amber-400" },
    never: { label: "Never", card: "bg-red-50 border-red-200 hover:bg-red-100", text: "text-red-600", dot: "bg-red-400" },
};

export function LoginActivitySection({ classId, defaultExpanded = true }: LoginActivitySectionProps) {
    const router = useRouter();
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [loading, setLoading] = useState(true);
    const [activity, setActivity] = useState<StudentActivity[]>([]);
    const [counts, setCounts] = useState<ActivityCounts | null>(null);
    const [sortBy, setSortBy] = useState<SortOption>("status");
    const [dateRange, setDateRange] = useState<DateRange>("7");

    useEffect(() => {
        fetchActivity();
    }, [classId, dateRange]);

    const fetchActivity = async () => {
        try {
            setLoading(true);
            const daysParam = dateRange === "all" ? "" : `?days=${dateRange}`;
            const response = await fetch(`/api/classes/${classId}/login-activity${daysParam}`);
            if (response.ok) {
                const data = await response.json();
                setActivity(data.activity || []);
                setCounts(data.counts ?? null);
            }
        } catch (error) {
            console.error("Error fetching login activity:", error);
        } finally {
            setLoading(false);
        }
    };

    const sortedActivity = useMemo(() => {
        const sorted = [...activity];
        const byName = (a: StudentActivity, b: StudentActivity) =>
            `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
        switch (sortBy) {
            case "status":
                sorted.sort((a, b) => {
                    if (BUCKET_RANK[a.status] !== BUCKET_RANK[b.status])
                        return BUCKET_RANK[a.status] - BUCKET_RANK[b.status];
                    const at = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
                    const bt = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
                    return bt - at;
                });
                break;
            case "name":
                sorted.sort(byName);
                break;
            case "lastLogin":
                sorted.sort((a, b) => {
                    if (!a.lastLoginAt && !b.lastLoginAt) return 0;
                    if (!a.lastLoginAt) return 1;
                    if (!b.lastLoginAt) return -1;
                    return new Date(b.lastLoginAt).getTime() - new Date(a.lastLoginAt).getTime();
                });
                break;
            case "mostActive":
                sorted.sort((a, b) => b.actionsCount - a.actionsCount || b.totalMinutesOnline - a.totalMinutesOnline);
                break;
        }
        return sorted;
    }, [activity, sortBy]);

    const formatTimeAgo = (dateStr: string | null) => {
        if (!dateStr) return "Never";
        const date = new Date(dateStr);
        const now = new Date();
        const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        if (diffMins < 5) return "Just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return "Yesterday";
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    };

    const formatDuration = (minutes: number) => {
        if (minutes < 1) return "<1m";
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
    };

    const handleStudentClick = (studentId: string) => {
        router.push(`/teacher/students/${studentId}`);
    };

    return (
        <Card className={`transition-all overflow-hidden ${isExpanded ? '' : 'hover:bg-gray-50'}`}>
            {/* Header */}
            <div
                className="flex items-center justify-between p-4 cursor-pointer gap-2"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <Activity className="w-5 h-5 text-blue-500 shrink-0" />
                    <div className="min-w-0">
                        <h3 className="font-medium text-sm">Engagement</h3>
                        <p className="text-xs text-gray-500 truncate">
                            {loading && !counts ? "Loading..." : counts ? (
                                <>
                                    {counts.everLoggedIn}/{counts.total} logged in
                                    {counts.online > 0 && (
                                        <span className="text-green-600 ml-1">• {counts.online} online</span>
                                    )}
                                </>
                            ) : "—"}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {counts && counts.slipping > 0 && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[10px] px-1.5 py-0">
                            {counts.slipping} slipping
                        </Badge>
                    )}
                    {counts && counts.neverLoggedIn > 0 && (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 text-[10px] px-1.5 py-0">
                            {counts.neverLoggedIn} never
                        </Badge>
                    )}

                    {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                </div>
            </div>

            {/* Content */}
            {isExpanded && (
                <CardContent className="pt-0 px-3 pb-3 border-t">
                    {loading && !activity.length ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    ) : activity.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm">
                            No students enrolled.
                        </div>
                    ) : (
                        <div className="pt-3">
                            {/* Controls Row - stacked for narrow sidebar */}
                            <div className="flex items-center gap-1.5 mb-2">
                                <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                                    <SelectTrigger className="h-7 text-[11px] flex-1 min-w-0 px-2">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="7">7 days</SelectItem>
                                        <SelectItem value="30">30 days</SelectItem>
                                        <SelectItem value="all">All time</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                                    <SelectTrigger className="h-7 text-[11px] flex-1 min-w-0 px-2">
                                        <ArrowUpDown className="w-3 h-3 mr-0.5 shrink-0" />
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="status">Status</SelectItem>
                                        <SelectItem value="lastLogin">Login</SelectItem>
                                        <SelectItem value="mostActive">Active</SelectItem>
                                        <SelectItem value="name">Name</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        fetchActivity();
                                    }}
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </Button>
                            </div>

                            <p className="text-[10px] text-gray-400 mb-2">
                                Practice counts cover the window. “Never” is all-time.
                            </p>

                            {/* Student List - scrollable */}
                            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                                {sortedActivity.map((student) => {
                                    const meta = STATUS_META[student.status];
                                    return (
                                    <div
                                        key={student.studentId}
                                        onClick={() => handleStudentClick(student.studentId)}
                                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors group ${meta.card}`}
                                    >
                                        {/* Avatar/Status Indicator */}
                                        <div className="relative shrink-0">
                                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm">
                                                {student.avatarUrl || "👤"}
                                            </div>
                                            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${meta.dot} ${student.status === "online" ? "" : "opacity-80"}`} />
                                        </div>

                                        {/* Name and Status */}
                                        <div className="min-w-0 flex-1">
                                            <div className="font-medium text-xs text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                                                {student.firstName} {student.lastName}
                                            </div>
                                            <div className="text-[10px] text-gray-500 flex items-center gap-1 flex-wrap">
                                                <span className={`font-medium ${meta.text}`}>
                                                    {student.status === "online"
                                                        ? "Online"
                                                        : student.status === "never"
                                                            ? "Never"
                                                            : formatTimeAgo(student.lastActivityAt ?? student.lastLoginAt)}
                                                </span>
                                                {student.recordingsCount > 0 && (
                                                    <span className="inline-flex items-center gap-0.5 text-gray-400">
                                                        <BookOpen className="w-2.5 h-2.5" />{student.recordingsCount}
                                                    </span>
                                                )}
                                                {student.questionsAnswered > 0 && (
                                                    <span className="inline-flex items-center gap-0.5 text-gray-400">
                                                        <HelpCircle className="w-2.5 h-2.5" />{student.questionsAnswered}
                                                    </span>
                                                )}
                                                {student.currentStreakDays > 0 && (
                                                    <span className="inline-flex items-center gap-0.5 text-orange-500">
                                                        <Flame className="w-2.5 h-2.5" />{student.currentStreakDays}d
                                                    </span>
                                                )}
                                                {student.totalMinutesOnline > 0 && (
                                                    <span className="text-gray-400 shrink-0">~{formatDuration(student.totalMinutesOnline)}</span>
                                                )}
                                            </div>
                                        </div>

                                        <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 transition-colors shrink-0" />
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
