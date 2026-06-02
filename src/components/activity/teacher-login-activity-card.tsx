"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    ChevronRight,
    Clock,
    Flame,
    HelpCircle,
    Loader2,
    RefreshCw,
    ArrowUpDown,
} from "lucide-react";

type ActivityStatus = "online" | "active" | "slipping" | "never";

interface StudentEnrollmentActivity {
    studentId: string;
    classId: string;
    className: string;
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

interface ApiResponse {
    activity: StudentEnrollmentActivity[];
    daysIncluded: number | "all";
    totalEnrollments: number;
    uniqueStudents: number;
    studentsLoggedIn: number;
    counts: ActivityCounts;
}

type SortOption = "status" | "lastLogin" | "mostActive" | "name" | "class";
type DateRange = "7" | "30" | "all";

const BUCKET_RANK: Record<ActivityStatus, number> = {
    online: 0,
    active: 1,
    slipping: 2,
    never: 3,
};

const STATUS_META: Record<
    ActivityStatus,
    { label: string; card: string; chip: string; dot: string }
> = {
    online: {
        label: "Online now",
        card: "bg-green-50 border-green-200 hover:bg-green-100",
        chip: "bg-green-100 text-green-700 border-green-200",
        dot: "bg-green-500",
    },
    active: {
        label: "Active",
        card: "bg-white border-gray-200 hover:bg-gray-50",
        chip: "bg-blue-50 text-blue-700 border-blue-200",
        dot: "bg-blue-400",
    },
    slipping: {
        label: "Slipping",
        card: "bg-amber-50/60 border-amber-200 hover:bg-amber-50",
        chip: "bg-amber-100 text-amber-800 border-amber-200",
        dot: "bg-amber-400",
    },
    never: {
        label: "Never logged in",
        card: "bg-red-50 border-red-200 hover:bg-red-100",
        chip: "bg-red-100 text-red-700 border-red-200",
        dot: "bg-red-400",
    },
};

const RANGE_LABEL: Record<DateRange, string> = {
    "7": "last 7 days",
    "30": "last 30 days",
    all: "all time",
};

export function TeacherLoginActivityCard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ApiResponse | null>(null);
    const [sortBy, setSortBy] = useState<SortOption>("status");
    const [dateRange, setDateRange] = useState<DateRange>("7");
    // Collapsed by default — the summary line is enough at a glance; teachers
    // expand for the full per-student breakdown.
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        fetchActivity();
    }, [dateRange]);

    const fetchActivity = async () => {
        try {
            setLoading(true);
            const daysParam = dateRange === "all" ? "" : `?days=${dateRange}`;
            const response = await fetch(`/api/teacher/login-activity${daysParam}`);
            if (response.ok) {
                const json = (await response.json()) as ApiResponse;
                setData(json);
            }
        } catch (error) {
            console.error("Error fetching login activity:", error);
        } finally {
            setLoading(false);
        }
    };

    const sortedActivity = useMemo(() => {
        const sorted = [...(data?.activity ?? [])];
        const byName = (a: StudentEnrollmentActivity, b: StudentEnrollmentActivity) =>
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
            case "class":
                sorted.sort((a, b) => {
                    const classCmp = a.className.localeCompare(b.className);
                    return classCmp !== 0 ? classCmp : byName(a, b);
                });
                break;
        }
        return sorted;
    }, [data, sortBy]);

    const formatTimeAgo = (dateStr: string | null) => {
        if (!dateStr) return "never";
        const date = new Date(dateStr);
        const now = new Date();
        const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        if (diffMins < 5) return "just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return "yesterday";
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

    const counts = data?.counts;

    // Compact summary chips, lifetime-honest. "Never" never moves with the window.
    const summaryChips = counts ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
            {counts.online > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    {counts.online} online
                </span>
            )}
            <span className="text-xs text-gray-600">{counts.active} active</span>
            {counts.slipping > 0 && (
                <span className="text-xs text-amber-700">· {counts.slipping} slipping</span>
            )}
            {counts.neverLoggedIn > 0 && (
                <span className="text-xs text-red-600">
                    · {counts.neverLoggedIn} never logged in
                </span>
            )}
        </span>
    ) : null;

    return (
        <Card className="mb-8">
            <CardHeader
                className={`pb-3 ${expanded ? '' : 'cursor-pointer hover:bg-gray-50 rounded-t-xl transition-colors'}`}
                onClick={(e) => {
                    if (expanded) return;
                    if ((e.target as HTMLElement).closest('button, [role="combobox"], select')) return;
                    setExpanded(true);
                }}
            >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setExpanded((v) => !v);
                            }}
                            className="p-2 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors shrink-0"
                            aria-label={expanded ? 'Collapse' : 'Expand'}
                        >
                            {expanded ? (
                                <ChevronDown className="w-5 h-5 text-blue-600" />
                            ) : (
                                <Activity className="w-5 h-5 text-blue-600" />
                            )}
                        </button>
                        <div className="min-w-0">
                            <CardTitle className="text-lg flex items-center gap-2">
                                Student Engagement
                                {!expanded && counts && counts.online > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                        {counts.online} online
                                    </span>
                                )}
                            </CardTitle>
                            <p className="text-sm text-gray-500 mt-0.5">
                                {loading && !data ? (
                                    "Loading…"
                                ) : counts ? (
                                    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
                                        <span className="text-gray-700 font-medium">
                                            {counts.everLoggedIn} of {counts.total} have logged in
                                        </span>
                                        {!expanded && <span className="text-gray-300">·</span>}
                                        {!expanded && summaryChips}
                                    </span>
                                ) : (
                                    "Activity unavailable"
                                )}
                            </p>
                        </div>
                    </div>

                    {expanded ? (
                        <div className="flex items-center gap-2 flex-wrap">
                            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                                <SelectTrigger className="h-9 w-[150px] text-sm">
                                    <Clock className="w-3.5 h-3.5 mr-1 shrink-0 text-gray-400" />
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="7">Activity: 7 days</SelectItem>
                                    <SelectItem value="30">Activity: 30 days</SelectItem>
                                    <SelectItem value="all">Activity: all time</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                                <SelectTrigger className="h-9 w-[150px] text-sm">
                                    <ArrowUpDown className="w-3.5 h-3.5 mr-1 shrink-0" />
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="status">Status</SelectItem>
                                    <SelectItem value="lastLogin">Last login</SelectItem>
                                    <SelectItem value="mostActive">Most active</SelectItem>
                                    <SelectItem value="name">Name</SelectItem>
                                    <SelectItem value="class">Class</SelectItem>
                                </SelectContent>
                            </Select>

                            <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9"
                                onClick={(e) => { e.stopPropagation(); fetchActivity(); }}
                                disabled={loading}
                                title="Refresh"
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                            </Button>

                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
                                className="text-xs text-gray-500"
                            >
                                Hide
                            </Button>
                        </div>
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                            className="text-xs text-gray-600"
                        >
                            Show
                            <ChevronRight className="w-3.5 h-3.5 ml-1" />
                        </Button>
                    )}
                </div>
            </CardHeader>

            {expanded && (
            <CardContent className="pt-0">
                {/* Summary + the one line that defuses the old confusion. */}
                {counts && (
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-3 pb-3 border-b">
                        {summaryChips}
                        <p className="text-[11px] text-gray-400">
                            Practice counts cover {RANGE_LABEL[dateRange]}. “Never logged in” is all-time.
                        </p>
                    </div>
                )}

                {loading && !data ? (
                    <div className="flex items-center justify-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                ) : sortedActivity.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 text-sm">
                        No students enrolled in your classes yet.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[480px] overflow-y-auto pr-1">
                        {sortedActivity.map((s) => {
                            const meta = STATUS_META[s.status];
                            // What to show as the timestamp/hint under the name.
                            const statusLine =
                                s.status === "online"
                                    ? "Online now"
                                    : s.status === "never"
                                        ? "Check their login"
                                        : s.status === "slipping"
                                            ? `Last seen ${formatTimeAgo(s.lastActivityAt ?? s.lastLoginAt)}`
                                            : formatTimeAgo(s.lastActivityAt ?? s.lastLoginAt);
                            return (
                            <button
                                key={`${s.studentId}-${s.classId}`}
                                onClick={() => router.push(`/teacher/students/${s.studentId}`)}
                                className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors group ${meta.card}`}
                            >
                                <div className="relative shrink-0">
                                    <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-lg">
                                        {s.avatarUrl || "👤"}
                                    </div>
                                    <span
                                        className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${meta.dot} ${s.status === "online" ? "" : "opacity-80"}`}
                                    />
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-medium text-sm text-gray-900 group-hover:text-blue-600 truncate">
                                            {s.firstName} {s.lastName}
                                        </span>
                                        <Badge
                                            variant="outline"
                                            className="text-[10px] font-normal px-1.5 py-0 bg-gray-50 text-gray-600 border-gray-200 shrink-0"
                                        >
                                            {s.className}
                                        </Badge>
                                    </div>

                                    {/* Status pill + when */}
                                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                        <span className={`inline-flex items-center gap-1 px-1.5 py-0 rounded-full text-[10px] font-medium border ${meta.chip}`}>
                                            {meta.label}
                                            {s.status === "slipping" && s.lastActivityAt && (
                                                <>
                                                    {" "}·{" "}
                                                    {Math.max(
                                                        1,
                                                        Math.floor(
                                                            (Date.now() - new Date(s.lastActivityAt).getTime()) /
                                                                86400000,
                                                        ),
                                                    )}
                                                    d
                                                </>
                                            )}
                                        </span>
                                        <span className="text-[11px] text-gray-500">{statusLine}</span>
                                    </div>

                                    {/* Meaningful-activity metrics for the window */}
                                    {s.status !== "never" && s.actionsCount + s.totalMinutesOnline > 0 ? (
                                        <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] text-gray-500">
                                            {s.recordingsCount > 0 && (
                                                <span className="inline-flex items-center gap-0.5" title="Readings recorded">
                                                    <BookOpen className="w-3 h-3 text-gray-400" />
                                                    {s.recordingsCount}
                                                </span>
                                            )}
                                            {s.questionsAnswered > 0 && (
                                                <span className="inline-flex items-center gap-0.5" title="Questions answered">
                                                    <HelpCircle className="w-3 h-3 text-gray-400" />
                                                    {s.questionsAnswered}
                                                </span>
                                            )}
                                            {s.currentStreakDays > 0 && (
                                                <span className="inline-flex items-center gap-0.5 text-orange-500" title="Day streak">
                                                    <Flame className="w-3 h-3" />
                                                    {s.currentStreakDays}d
                                                </span>
                                            )}
                                            {s.totalMinutesOnline > 0 && (
                                                <span className="inline-flex items-center gap-0.5 text-gray-400" title="Approx. time with app open">
                                                    <Clock className="w-3 h-3" />~{formatDuration(s.totalMinutesOnline)}
                                                </span>
                                            )}
                                        </div>
                                    ) : s.status === "slipping" ? (
                                        <div className="mt-1 text-[11px] text-amber-600">No practice in {RANGE_LABEL[dateRange]}</div>
                                    ) : null}
                                </div>

                                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 shrink-0 mt-0.5" />
                            </button>
                            );
                        })}
                    </div>
                )}
            </CardContent>
            )}
        </Card>
    );
}
