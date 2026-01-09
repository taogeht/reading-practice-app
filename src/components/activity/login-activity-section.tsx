"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Activity,
    ChevronDown,
    ChevronUp,
    Clock,
    UserCheck,
    UserX,
    Loader2,
    RefreshCw,
    Calendar,
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
}

export function LoginActivitySection({ classId }: LoginActivitySectionProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [loading, setLoading] = useState(true);
    const [activity, setActivity] = useState<StudentActivity[]>([]);
    const [stats, setStats] = useState({ totalStudents: 0, studentsLoggedIn: 0 });

    useEffect(() => {
        fetchActivity();
    }, [classId]);

    const fetchActivity = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/classes/${classId}/login-activity?days=7`);
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

    const onlineCount = activity.filter(s => s.isCurrentlyOnline).length;
    const neverLoggedIn = activity.filter(s => !s.lastLoginAt).length;

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
                                    {stats.studentsLoggedIn}/{stats.totalStudents} logged in this week
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
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-sm text-gray-600">Last 7 days activity:</p>
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

                            <div className="space-y-2">
                                {activity.map((student) => (
                                    <div
                                        key={student.studentId}
                                        className={`
                                            flex items-center justify-between p-3 rounded-lg border
                                            ${student.isCurrentlyOnline
                                                ? "bg-green-50 border-green-200"
                                                : student.lastLoginAt
                                                    ? "bg-white border-gray-200"
                                                    : "bg-red-50 border-red-200"
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
                                                <div className="font-medium text-gray-900">
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

                                        {/* Stats */}
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
