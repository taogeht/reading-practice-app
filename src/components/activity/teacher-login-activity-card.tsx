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
    ChevronRight,
    Loader2,
    RefreshCw,
    ArrowUpDown,
} from "lucide-react";

interface StudentEnrollmentActivity {
    studentId: string;
    classId: string;
    className: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    lastLoginAt: string | null;
    lastActivityAt: string | null;
    sessionCount: number;
    totalMinutesOnline: number;
    isCurrentlyOnline: boolean;
}

interface ApiResponse {
    activity: StudentEnrollmentActivity[];
    daysIncluded: number;
    totalEnrollments: number;
    studentsLoggedIn: number;
    uniqueStudents: number;
}

type SortOption = "lastLogin" | "timeOnline" | "name" | "class";
type DateRange = "7" | "30" | "all";

export function TeacherLoginActivityCard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ApiResponse | null>(null);
    const [sortBy, setSortBy] = useState<SortOption>("lastLogin");
    const [dateRange, setDateRange] = useState<DateRange>("7");

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
        switch (sortBy) {
            case "name":
                sorted.sort((a, b) =>
                    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
                );
                break;
            case "lastLogin":
                sorted.sort((a, b) => {
                    if (a.isCurrentlyOnline !== b.isCurrentlyOnline) return a.isCurrentlyOnline ? -1 : 1;
                    if (!a.lastLoginAt && !b.lastLoginAt) return 0;
                    if (!a.lastLoginAt) return 1;
                    if (!b.lastLoginAt) return -1;
                    return new Date(b.lastLoginAt).getTime() - new Date(a.lastLoginAt).getTime();
                });
                break;
            case "timeOnline":
                sorted.sort((a, b) => b.totalMinutesOnline - a.totalMinutesOnline);
                break;
            case "class":
                sorted.sort((a, b) => {
                    const classCmp = a.className.localeCompare(b.className);
                    if (classCmp !== 0) return classCmp;
                    return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
                });
                break;
        }
        return sorted;
    }, [data, sortBy]);

    const formatTimeAgo = (dateStr: string | null) => {
        if (!dateStr) return "Never";
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
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
        if (minutes < 1) return "< 1 min";
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    };

    const onlineCount = data?.activity.filter((s) => s.isCurrentlyOnline).length ?? 0;
    const neverLoggedIn = data?.activity.filter((s) => !s.lastLoginAt).length ?? 0;

    return (
        <Card className="mb-8">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 rounded-lg">
                            <Activity className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">Student Login Activity</CardTitle>
                            <p className="text-sm text-gray-500 mt-0.5">
                                {loading ? (
                                    "Loading…"
                                ) : data ? (
                                    <>
                                        {data.studentsLoggedIn} of {data.uniqueStudents} students logged in
                                        {onlineCount > 0 && (
                                            <span className="text-green-600 font-medium ml-2">
                                                • {onlineCount} online now
                                            </span>
                                        )}
                                        {neverLoggedIn > 0 && (
                                            <span className="text-red-600 ml-2">
                                                • {neverLoggedIn} never logged in
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    "Activity unavailable"
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                            <SelectTrigger className="h-9 w-[120px] text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="7">Last 7 days</SelectItem>
                                <SelectItem value="30">Last 30 days</SelectItem>
                                <SelectItem value="all">All time</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                            <SelectTrigger className="h-9 w-[140px] text-sm">
                                <ArrowUpDown className="w-3.5 h-3.5 mr-1 shrink-0" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="lastLogin">Last login</SelectItem>
                                <SelectItem value="timeOnline">Time online</SelectItem>
                                <SelectItem value="name">Name</SelectItem>
                                <SelectItem value="class">Class</SelectItem>
                            </SelectContent>
                        </Select>

                        <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={fetchActivity}
                            disabled={loading}
                            title="Refresh"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-0">
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
                        {sortedActivity.map((s) => (
                            <button
                                key={`${s.studentId}-${s.classId}`}
                                onClick={() => router.push(`/teacher/students/${s.studentId}`)}
                                className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors group ${
                                    s.isCurrentlyOnline
                                        ? "bg-green-50 border-green-200 hover:bg-green-100"
                                        : s.lastLoginAt
                                            ? "bg-white border-gray-200 hover:bg-gray-50"
                                            : "bg-red-50 border-red-200 hover:bg-red-100"
                                }`}
                            >
                                <div className="relative shrink-0">
                                    <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-lg">
                                        {s.avatarUrl || "👤"}
                                    </div>
                                    {s.isCurrentlyOnline && (
                                        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />
                                    )}
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
                                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                        {s.isCurrentlyOnline ? (
                                            <span className="text-green-600 font-medium">Online now</span>
                                        ) : s.lastLoginAt ? (
                                            <span>{formatTimeAgo(s.lastLoginAt)}</span>
                                        ) : (
                                            <span className="text-red-600 font-medium">Never logged in</span>
                                        )}
                                        {s.lastLoginAt && (
                                            <span className="text-gray-400">
                                                · {formatDuration(s.totalMinutesOnline)} active
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 shrink-0" />
                            </button>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
