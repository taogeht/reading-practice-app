"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    const [date, setDate] = useState(() => {
        const today = new Date();
        return today.toISOString().split("T")[0];
    });
    const [students, setStudents] = useState<StudentAttendance[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [localAttendance, setLocalAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        fetchAttendance();
    }, [classId, date]);

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

    const handleMarkAllPresent = () => {
        const allPresent = new Map<string, AttendanceStatus>();
        students.forEach(s => allPresent.set(s.studentId, "present"));
        setLocalAttendance(allPresent);
        setHasChanges(true);
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
                await fetchAttendance(); // Refresh to get updated records
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

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
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

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <CalendarDays className="w-5 h-5" />
                            Attendance
                        </CardTitle>
                        <CardDescription>
                            Take attendance for {className}
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleMarkAllPresent}
                            disabled={loading}
                        >
                            <Users className="w-4 h-4 mr-2" />
                            All Present
                        </Button>
                    </div>
                </div>

                {/* Date Navigation */}
                <div className="flex items-center justify-center gap-4 mt-4 p-3 bg-gray-50 rounded-lg">
                    <Button variant="ghost" size="sm" onClick={() => changeDate("prev")}>
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <div className="flex items-center gap-2">
                        <Input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-auto"
                        />
                        <span className="text-sm text-gray-600 hidden sm:inline">
                            {formatDate(date)}
                        </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => changeDate("next")}>
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>

                {/* Status Counts */}
                <div className="flex flex-wrap gap-2 mt-3 justify-center">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                        Present: {counts.present}
                    </Badge>
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                        Absent: {counts.absent}
                    </Badge>
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                        Late: {counts.late}
                    </Badge>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                        Excused: {counts.excused}
                    </Badge>
                    {counts.unmarked > 0 && (
                        <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-300">
                            Unmarked: {counts.unmarked}
                        </Badge>
                    )}
                </div>
            </CardHeader>

            <CardContent>
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
        </Card>
    );
}
