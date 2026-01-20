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
    ChevronDown,
    ChevronUp,
    Clock,
    Loader2,
    RefreshCw,
    Calendar,
    ArrowUpDown,
    ChevronRight,
} from "lucide-react";

interface StudentActivity {
    studentId: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    lastLoginAt: string | null;
    lastActivityAt: string | null;
    sessionCount: number;
    totalMinutesOnline: number;
    isCurrentlyOnline: boolean;
}

interface LoginActivitySectionProps {
    classId: string;
    defaultExpanded?: boolean;
}

type SortOption = "name" | "lastLogin" | "timeOnline";
type DateRange = "7" | "30" | "all";

export function LoginActivitySection({ classId, defaultExpanded = true }: LoginActivitySectionProps) {
    const router = useRouter();
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [loading, setLoading] = useState(true);
    const [activity, setActivity] = useState<StudentActivity[]>([]);
    const [stats, setStats] = useState({ totalStudents: 0, studentsLoggedIn: 0 });
    const [sortBy, setSortBy] = useState<SortOption>("lastLogin");
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
                setStats({
                    totalStudents: data.totalStudents,
                    studentsLoggedIn: data.studentsLoggedIn,
                });
            }
        } catch (error) {
            console.error("Error fetching login activity:", error);
        } finally {
            setLoading(false);
        }
    };

    const sortedActivity = useMemo(() => {
        const sorted = [...activity];
        switch (sortBy) {
            case "name":
                sorted.sort((a, b) =>
                    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
                );
                break;
            case "lastLogin":
                sorted.sort((a, b) => {
                    if (!a.lastLoginAt && !b.lastLoginAt) return 0;
                    if (!a.lastLoginAt) return 1;
                    if (!b.lastLoginAt) return -1;
                    return new Date(b.lastLoginAt).getTime() - new Date(a.lastLoginAt).getTime();
                });
                break;
            case "timeOnline":
                sorted.sort((a, b) => b.totalMinutesOnline - a.totalMinutesOnline);
                break;
        }
        return sorted;
    }, [activity, sortBy]);

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

    const handleStudentClick = (studentId: string) => {
        router.push(`/teacher/students/${studentId}`);
    };

    const onlineCount = activity.filter(s => s.isCurrentlyOnline).length;
    const neverLoggedIn = activity.filter(s => !s.lastLoginAt).length;

    const getDateRangeLabel = () => {
        switch (dateRange) {
            case "7": return "Last 7 days";
            case "30": return "Last 30 days";
            case "all": return "All time";
        }
    };

    return (
        <Card className={`transition-all ${isExpanded ? '' : 'hover:bg-gray-50'}`}>
            {/* Header */}
            <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-blue-500" />
                    <div>
                        <h3 className="font-medium">Student Login Activity</h3>
                        <p className="text-sm text-gray-500">
                            {loading ? "Loading..." : (
                                <>
                                    {stats.studentsLoggedIn}/{stats.totalStudents} logged in ({getDateRangeLabel()})
                                    {onlineCount > 0 && (
                                        <span className="text-green-600 ml-2">• {onlineCount} online now</span>
                                    )}
                                </>
                            )}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {neverLoggedIn > 0 && (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                            {neverLoggedIn} never logged in
                        </Badge>
                    )}

                    {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                </div>
            </div>

            {/* Content */}
            {isExpanded && (
                <CardContent className="pt-0 border-t">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    ) : activity.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            No students enrolled in this class.
                        </div>
                    ) : (
                        <div className="pt-4">
                            {/* Controls Row */}
                            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                                <div className="flex items-center gap-2">
                                    {/* Date Range Picker */}
                                    <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                                        <SelectTrigger className="w-[130px] h-8 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="7">Last 7 days</SelectItem>
                                            <SelectItem value="30">Last 30 days</SelectItem>
                                            <SelectItem value="all">All time</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    {/* Sort Dropdown */}
                                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                                        <SelectTrigger className="w-[140px] h-8 text-xs">
                                            <ArrowUpDown className="w-3 h-3 mr-1" />
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="lastLogin">Last Login</SelectItem>
                                            <SelectItem value="timeOnline">Time Online</SelectItem>
                                            <SelectItem value="name">Name</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        fetchActivity();
                                    }}
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </Button>
                            </div>

                            {/* Student List */}
                            <div className="space-y-2">
                                {sortedActivity.map((student) => (
                                    <div
                                        key={student.studentId}
                                        onClick={() => handleStudentClick(student.studentId)}
                                        className={`
                                            flex items-center justify-between p-3 rounded-lg border cursor-pointer
                                            transition-colors group
                                            ${student.isCurrentlyOnline
                                                ? "bg-green-50 border-green-200 hover:bg-green-100"
                                                : student.lastLoginAt
                                                    ? "bg-white border-gray-200 hover:bg-gray-50"
                                                    : "bg-red-50 border-red-200 hover:bg-red-100"
                                            }
                                        `}
                                    >
                                        <div className="flex items-center gap-3">
                                            {/* Avatar/Status Indicator */}
                                            <div className="relative">
                                                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg">
                                                    {student.avatarUrl || "👤"}
                                                </div>
                                                {student.isCurrentlyOnline && (
                                                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />
                                                )}
                                            </div>

                                            {/* Name and Status */}
                                            <div>
                                                <div className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                                                    {student.firstName} {student.lastName}
                                                </div>
                                                <div className="text-xs text-gray-500 flex items-center gap-2">
                                                    {student.isCurrentlyOnline ? (
                                                        <span className="text-green-600 font-medium">🟢 Online now</span>
                                                    ) : student.lastLoginAt ? (
                                                        <>
                                                            <Calendar className="w-3 h-3" />
                                                            Last login: {formatTimeAgo(student.lastLoginAt)}
                                                        </>
                                                    ) : (
                                                        <span className="text-red-600">Never logged in</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Stats and Arrow */}
                                        <div className="flex items-center gap-3">
                                            {student.lastLoginAt && (
                                                <div className="text-right text-xs">
                                                    <div className="text-gray-600">
                                                        <Clock className="w-3 h-3 inline mr-1" />
                                                        {formatDuration(student.totalMinutesOnline)}
                                                    </div>
                                                    <div className="text-gray-400">
                                                        {student.sessionCount} session{student.sessionCount !== 1 ? 's' : ''}
                                                    </div>
                                                </div>
                                            )}
                                            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
