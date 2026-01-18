"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    CalendarDays,
    Check,
    X,
    Clock,
    FileX,
    Loader2,
    ChevronLeft,
    ChevronRight,
    Users,
    Save,
    ChevronDown,
    ChevronUp,
    AlertTriangle,
} from "lucide-react";

interface StudentAttendance {
    studentId: string;
    firstName: string;
    lastName: string;
    attendance: {
        id: string;
        status: "present" | "absent" | "late" | "excused";
        notes: string | null;
    } | null;
}

interface AttendanceSectionProps {
    classId: string;
    className: string;
}

const STATUS_OPTIONS = [
    { value: "present", label: "Present", icon: Check, color: "bg-green-500 hover:bg-green-600" },
    { value: "absent", label: "Absent", icon: X, color: "bg-red-500 hover:bg-red-600" },
    { value: "late", label: "Late", icon: Clock, color: "bg-amber-500 hover:bg-amber-600" },
    { value: "excused", label: "Excused", icon: FileX, color: "bg-blue-500 hover:bg-blue-600" },
] as const;

type AttendanceStatus = typeof STATUS_OPTIONS[number]["value"];

export function AttendanceSection({ classId, className }: AttendanceSectionProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [date, setDate] = useState(() => {
        const today = new Date();
        return today.toISOString().split("T")[0];
    });
    const [students, setStudents] = useState<StudentAttendance[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
    const [hasChanges, setHasChanges] = useState(false);
    const [scheduleDays, setScheduleDays] = useState<number[]>([]);

    useEffect(() => {
        fetchSchedule();
    }, [classId]);

    useEffect(() => {
        fetchAttendance();
    }, [classId, date]);

    const fetchSchedule = async () => {
        try {
            const response = await fetch(`/api/classes/${classId}/schedule`);
            if (response.ok) {
                const data = await response.json();
                setScheduleDays(data.days || []);
            }
        } catch (error) {
            console.error("Error fetching schedule:", error);
        }
    };

    // Check if current date is a scheduled class day
    const isScheduledDay = () => {
        if (scheduleDays.length === 0) return true; // No schedule set = all days valid
        const d = new Date(date);
        return scheduleDays.includes(d.getDay());
    };

    const fetchAttendance = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/classes/${classId}/attendance?date=${date}`);
            if (response.ok) {
                const data = await response.json();
                setStudents(data.students);

                // Initialize local state from fetched data
                const initial = new Map<string, AttendanceStatus>();
                data.students.forEach((s: StudentAttendance) => {
                    if (s.attendance) {
                        initial.set(s.studentId, s.attendance.status);
                    }
                });
                setLocalAttendance(initial);
                setHasChanges(false);
            }
        } catch (error) {
            console.error("Error fetching attendance:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
        setLocalAttendance(prev => {
            const next = new Map(prev);
            next.set(studentId, status);
            return next;
        });
        setHasChanges(true);
    };

    const handleMarkAllPresent = async () => {
        const allPresent = new Map<string, AttendanceStatus>();
        students.forEach(s => allPresent.set(s.studentId, "present"));
        setLocalAttendance(allPresent);

        // Auto-save when marking all present
        setSaving(true);
        try {
            const records = students.map(s => ({
                studentId: s.studentId,
                status: "present" as const,
            }));

            const response = await fetch(`/api/classes/${classId}/attendance`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date, records }),
            });

            if (response.ok) {
                setHasChanges(false);
                await fetchAttendance();
            }
        } catch (error) {
            console.error("Error saving attendance:", error);
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const records = Array.from(localAttendance.entries()).map(([studentId, status]) => ({
                studentId,
                status,
            }));

            const response = await fetch(`/api/classes/${classId}/attendance`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date, records }),
            });

            if (response.ok) {
                setHasChanges(false);
                await fetchAttendance();
            } else {
                alert("Failed to save attendance");
            }
        } catch (error) {
            console.error("Error saving attendance:", error);
            alert("Failed to save attendance");
        } finally {
            setSaving(false);
        }
    };

    const changeDate = (direction: "prev" | "next") => {
        const current = new Date(date);
        current.setDate(current.getDate() + (direction === "next" ? 1 : -1));
        setDate(current.toISOString().split("T")[0]);
    };

    const formatDateShort = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
        });
    };

    const getStatusCounts = () => {
        const counts = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
        students.forEach(s => {
            const status = localAttendance.get(s.studentId);
            if (status) {
                counts[status]++;
            } else {
                counts.unmarked++;
            }
        });
        return counts;
    };

    const counts = getStatusCounts();
    const allMarked = counts.unmarked === 0 && students.length > 0;
    const hasAbsences = counts.absent > 0 || counts.late > 0 || counts.excused > 0;

    return (
        <Card className={`transition-all ${isExpanded ? '' : 'hover:bg-gray-50'}`}>
            {/* Compact Header - Always visible */}
            <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => !saving && setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <CalendarDays className="w-5 h-5 text-gray-600" />
                    <div>
                        <h3 className="font-medium">Attendance</h3>
                        <p className="text-sm text-gray-500">{formatDateShort(date)}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Quick status summary */}
                    {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    ) : (
                        <div className="flex items-center gap-2">
                            {allMarked && !hasAbsences && (
                                <Badge className="bg-green-100 text-green-700 border-green-300">
                                    All Present ✓
                                </Badge>
                            )}
                            {hasAbsences && (
                                <>
                                    {counts.absent > 0 && (
                                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                                            {counts.absent} Absent
                                        </Badge>
                                    )}
                                    {counts.late > 0 && (
                                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                                            {counts.late} Late
                                        </Badge>
                                    )}
                                </>
                            )}
                            {!allMarked && counts.unmarked > 0 && (
                                <Badge variant="outline" className="text-gray-600">
                                    {counts.unmarked} unmarked
                                </Badge>
                            )}
                        </div>
                    )}

                    {/* Quick "All Present" button */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAllPresent();
                        }}
                        disabled={loading || saving || (allMarked && !hasAbsences)}
                    >
                        {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                <Users className="w-4 h-4 mr-1" />
                                All Present
                            </>
                        )}
                    </Button>

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
                    {/* Date Navigation */}
                    <div className="flex items-center justify-center gap-4 py-3">
                        <Button variant="ghost" size="sm" onClick={() => changeDate("prev")}>
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-auto"
                        />
                        <Button variant="ghost" size="sm" onClick={() => changeDate("next")}>
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Non-scheduled day warning */}
                    {!isScheduledDay() && (
                        <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            <span>This is not a scheduled class day</span>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    ) : students.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            No students enrolled in this class
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                {students.map((student) => {
                                    const currentStatus = localAttendance.get(student.studentId);
                                    return (
                                        <div
                                            key={student.studentId}
                                            className="flex items-center justify-between p-3 bg-white border rounded-lg hover:bg-gray-50"
                                        >
                                            <span className="font-medium">
                                                {student.firstName} {student.lastName}
                                            </span>
                                            <div className="flex gap-1">
                                                {STATUS_OPTIONS.map((option) => {
                                                    const Icon = option.icon;
                                                    const isSelected = currentStatus === option.value;
                                                    return (
                                                        <Button
                                                            key={option.value}
                                                            size="sm"
                                                            variant={isSelected ? "default" : "outline"}
                                                            className={isSelected ? option.color : ""}
                                                            onClick={() => handleStatusChange(student.studentId, option.value)}
                                                            title={option.label}
                                                        >
                                                            <Icon className="w-4 h-4" />
                                                            <span className="hidden sm:inline ml-1">{option.label}</span>
                                                        </Button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {hasChanges && (
                                <div className="mt-4 flex justify-end">
                                    <Button onClick={handleSave} disabled={saving}>
                                        {saving ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="w-4 h-4 mr-2" />
                                                Save Attendance
                                            </>
                                        )}
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
