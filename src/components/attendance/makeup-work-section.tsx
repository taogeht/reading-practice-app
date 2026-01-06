"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    AlertCircle,
    ChevronDown,
    ChevronUp,
    Calendar,
    BookOpen,
    Users,
    Loader2,
    RefreshCw,
} from "lucide-react";

interface AbsentDay {
    date: string;
    absentStudents: {
        id: string;
        firstName: string;
        lastName: string;
    }[];
    progressEntries: {
        bookTitle: string;
        pagesCompleted: string | null;
        homeworkAssigned: string | null;
    }[];
}

interface MakeupWorkSectionProps {
    classId: string;
}

export function MakeupWorkSection({ classId }: MakeupWorkSectionProps) {
    const [isExpanded, setIsExpanded] = useState(true); // Auto-expand on load
    const [loading, setLoading] = useState(true); // Start loading immediately
    const [absentDays, setAbsentDays] = useState<AbsentDay[]>([]);

    useEffect(() => {
        // Load data on mount
        fetchMakeupData();
    }, [classId]);

    const fetchMakeupData = async () => {
        try {
            setLoading(true);

            // Fetch recent attendance (last 14 days) and progress
            const [attendanceRes, progressRes] = await Promise.all([
                fetch(`/api/classes/${classId}/attendance?days=14`),
                fetch(`/api/classes/${classId}/progress?limit=30`),
            ]);

            if (!attendanceRes.ok || !progressRes.ok) {
                console.error("Failed to fetch makeup data");
                return;
            }

            const attendanceData = await attendanceRes.json();
            const progressData = await progressRes.json();

            // Group absences by date and match with progress
            const absencesByDate = new Map<string, AbsentDay>();

            // Process attendance records to find absences
            for (const record of attendanceData.attendance || []) {
                if (record.status === "absent") {
                    const dateKey = new Date(record.date).toISOString().split("T")[0];

                    if (!absencesByDate.has(dateKey)) {
                        absencesByDate.set(dateKey, {
                            date: dateKey,
                            absentStudents: [],
                            progressEntries: [],
                        });
                    }

                    const day = absencesByDate.get(dateKey)!;
                    // Avoid duplicates
                    if (!day.absentStudents.find(s => s.id === record.studentId)) {
                        day.absentStudents.push({
                            id: record.studentId,
                            firstName: record.studentFirstName || "Unknown",
                            lastName: record.studentLastName || "",
                        });
                    }
                }
            }

            // Match progress entries to dates with absences
            for (const progress of progressData.progress || []) {
                const dateKey = new Date(progress.date).toISOString().split("T")[0];

                if (absencesByDate.has(dateKey)) {
                    const day = absencesByDate.get(dateKey)!;
                    day.progressEntries.push({
                        bookTitle: progress.bookTitle,
                        pagesCompleted: progress.pagesCompleted,
                        homeworkAssigned: progress.homeworkAssigned,
                    });
                }
            }

            // Convert to array and sort by date (most recent first)
            const sortedDays = Array.from(absencesByDate.values())
                .filter(day => day.absentStudents.length > 0)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            setAbsentDays(sortedDays);
        } catch (error) {
            console.error("Error fetching makeup data:", error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
        });
    };

    const totalAbsences = absentDays.reduce((sum, day) => sum + day.absentStudents.length, 0);

    return (
        <Card className={`transition-all ${isExpanded ? '' : 'hover:bg-gray-50'}`}>
            {/* Compact Header */}
            <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-orange-500" />
                    <div>
                        <h3 className="font-medium">Makeup Work Needed</h3>
                        <p className="text-sm text-gray-500">
                            {totalAbsences > 0
                                ? `${totalAbsences} absence${totalAbsences > 1 ? 's' : ''} in last 2 weeks`
                                : "No recent absences"
                            }
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {totalAbsences > 0 && (
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
                            {absentDays.length} {absentDays.length === 1 ? 'day' : 'days'}
                        </Badge>
                    )}

                    {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <CardContent className="pt-0 border-t">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    ) : absentDays.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p>No absences recorded in the last 2 weeks.</p>
                            <p className="text-sm mt-1">All students are caught up! 🎉</p>
                        </div>
                    ) : (
                        <div className="space-y-4 pt-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-gray-600">
                                    Students who missed class and the material covered:
                                </p>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        fetchMakeupData();
                                    }}
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </Button>
                            </div>

                            {absentDays.map((day) => (
                                <div
                                    key={day.date}
                                    className="border rounded-lg p-4 bg-orange-50/50"
                                >
                                    {/* Date Header */}
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-4 h-4 text-orange-600" />
                                            <span className="font-medium text-gray-900">
                                                {formatDate(day.date)}
                                            </span>
                                        </div>
                                        <Badge variant="outline" className="bg-white">
                                            {day.absentStudents.length} absent
                                        </Badge>
                                    </div>

                                    {/* Absent Students */}
                                    <div className="mb-3">
                                        <p className="text-xs text-gray-500 mb-1">Absent:</p>
                                        <div className="flex flex-wrap gap-1">
                                            {day.absentStudents.map((student) => (
                                                <Badge
                                                    key={student.id}
                                                    variant="secondary"
                                                    className="bg-orange-100 text-orange-800"
                                                >
                                                    {student.firstName} {student.lastName}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Material Covered */}
                                    {day.progressEntries.length > 0 ? (
                                        <div className="bg-white rounded-md p-3 border">
                                            <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                                                <BookOpen className="w-3 h-3" />
                                                Material covered:
                                            </p>
                                            <div className="space-y-2">
                                                {day.progressEntries.map((entry, idx) => (
                                                    <div key={idx} className="text-sm">
                                                        <span className="font-medium">{entry.bookTitle}</span>
                                                        {entry.pagesCompleted && (
                                                            <span className="text-gray-600">
                                                                {" "}— Pages {entry.pagesCompleted}
                                                            </span>
                                                        )}
                                                        {entry.homeworkAssigned && (
                                                            <p className="text-blue-600 text-xs mt-1">
                                                                📝 HW: {entry.homeworkAssigned}
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-white rounded-md p-3 border text-sm text-gray-500 italic">
                                            No progress recorded for this day
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
