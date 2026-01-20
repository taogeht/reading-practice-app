"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
    Check,
    Undo2,
} from "lucide-react";

interface AbsentStudent {
    id: string;
    firstName: string;
    lastName: string;
    recordId?: string;
    makeupCompleted?: boolean;
}

interface AbsentDay {
    date: string;
    absentStudents: AbsentStudent[];
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
    const [isExpanded, setIsExpanded] = useState(true);
    const [loading, setLoading] = useState(true);
    const [absentDays, setAbsentDays] = useState<AbsentDay[]>([]);
    const [showCompleted, setShowCompleted] = useState(false);
    const [updatingStudent, setUpdatingStudent] = useState<string | null>(null);

    useEffect(() => {
        fetchMakeupData();
    }, [classId]);

    const fetchMakeupData = async () => {
        try {
            setLoading(true);

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

            const absencesByDate = new Map<string, AbsentDay>();

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
                    if (!day.absentStudents.find(s => s.id === record.studentId)) {
                        day.absentStudents.push({
                            id: record.studentId,
                            firstName: record.studentFirstName || "Unknown",
                            lastName: record.studentLastName || "",
                            recordId: record.id,
                            makeupCompleted: record.makeupCompleted || false,
                        });
                    }
                }
            }

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

    const toggleMakeupCompleted = async (
        studentId: string,
        date: string,
        currentStatus: boolean
    ) => {
        setUpdatingStudent(`${studentId}-${date}`);
        try {
            const response = await fetch(`/api/classes/${classId}/attendance`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    studentId,
                    date,
                    makeupCompleted: !currentStatus,
                }),
            });

            if (response.ok) {
                // Update local state
                setAbsentDays(prev =>
                    prev.map(day => {
                        if (day.date === date) {
                            return {
                                ...day,
                                absentStudents: day.absentStudents.map(s =>
                                    s.id === studentId
                                        ? { ...s, makeupCompleted: !currentStatus }
                                        : s
                                ),
                            };
                        }
                        return day;
                    })
                );
            }
        } catch (error) {
            console.error("Error updating makeup status:", error);
        } finally {
            setUpdatingStudent(null);
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

    // Filter based on showCompleted toggle
    const filteredDays = absentDays
        .map(day => ({
            ...day,
            absentStudents: showCompleted
                ? day.absentStudents
                : day.absentStudents.filter(s => !s.makeupCompleted),
        }))
        .filter(day => day.absentStudents.length > 0);

    const totalPending = absentDays.reduce(
        (sum, day) => sum + day.absentStudents.filter(s => !s.makeupCompleted).length,
        0
    );

    const totalCompleted = absentDays.reduce(
        (sum, day) => sum + day.absentStudents.filter(s => s.makeupCompleted).length,
        0
    );

    return (
        <Card className={`transition-all ${isExpanded ? '' : 'hover:bg-gray-50'}`}>
            <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <AlertCircle className={`w-5 h-5 ${totalPending > 0 ? 'text-orange-500' : 'text-green-500'}`} />
                    <div>
                        <h3 className="font-medium">Makeup Work</h3>
                        <p className="text-sm text-gray-500">
                            {totalPending > 0
                                ? `${totalPending} student${totalPending > 1 ? 's' : ''} need${totalPending === 1 ? 's' : ''} to catch up`
                                : "All students caught up! 🎉"
                            }
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {totalPending > 0 && (
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
                            {totalPending} pending
                        </Badge>
                    )}
                    {totalCompleted > 0 && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                            {totalCompleted} done
                        </Badge>
                    )}

                    {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                </div>
            </div>

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
                        </div>
                    ) : (
                        <div className="space-y-4 pt-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm text-gray-600">
                                        Mark students caught up when they complete makeup work
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant={showCompleted ? "default" : "outline"}
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowCompleted(!showCompleted);
                                        }}
                                    >
                                        {showCompleted ? "Hide Completed" : "Show Completed"}
                                    </Button>
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
                            </div>

                            {filteredDays.length === 0 ? (
                                <div className="text-center py-6 text-gray-500 bg-green-50 rounded-lg">
                                    <Check className="w-8 h-8 text-green-500 mx-auto mb-2" />
                                    <p>All pending makeup work is complete!</p>
                                    <p className="text-sm mt-1">
                                        Click "Show Completed" to view resolved items.
                                    </p>
                                </div>
                            ) : (
                                filteredDays.map((day) => (
                                    <div
                                        key={day.date}
                                        className="border rounded-lg p-4 bg-orange-50/50"
                                    >
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

                                        <div className="mb-3">
                                            <p className="text-xs text-gray-500 mb-2">Students:</p>
                                            <div className="flex flex-wrap gap-2">
                                                {day.absentStudents.map((student) => {
                                                    const isUpdating = updatingStudent === `${student.id}-${day.date}`;
                                                    const isCompleted = student.makeupCompleted;

                                                    return (
                                                        <div
                                                            key={student.id}
                                                            className={`
                                                                flex items-center gap-1 px-2 py-1 rounded-md text-sm
                                                                transition-all
                                                                ${isCompleted
                                                                    ? 'bg-green-100 text-green-800 border border-green-300'
                                                                    : 'bg-orange-100 text-orange-800 border border-orange-300'
                                                                }
                                                            `}
                                                        >
                                                            <span className={isCompleted ? 'line-through opacity-60' : ''}>
                                                                {student.firstName} {student.lastName}
                                                            </span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleMakeupCompleted(
                                                                        student.id,
                                                                        day.date,
                                                                        isCompleted || false
                                                                    );
                                                                }}
                                                                disabled={isUpdating}
                                                                className={`
                                                                    ml-1 p-0.5 rounded hover:bg-black/10 transition-colors
                                                                    ${isUpdating ? 'opacity-50' : ''}
                                                                `}
                                                                title={isCompleted ? "Mark as pending" : "Mark as caught up"}
                                                            >
                                                                {isUpdating ? (
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                ) : isCompleted ? (
                                                                    <Undo2 className="w-3.5 h-3.5" />
                                                                ) : (
                                                                    <Check className="w-3.5 h-3.5" />
                                                                )}
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

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
                                ))
                            )}
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
