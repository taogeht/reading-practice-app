"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Calendar, CheckCircle2, UserCheck, UserX, UserMinus, Loader2, Save } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface StudentAttendance {
    id: string;
    firstName: string;
    lastName: string;
    status: AttendanceStatus;
}

export interface ProgressAssignment {
    bookId: string;
    title: string;
    pages: string;
}

interface LogProgressModalProps {
    classId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    defaultAssignments: ProgressAssignment[];
    defaultTitle?: string;
    defaultDate?: string; // YYYY-MM-DD
}

export function LogProgressModal({
    classId,
    open,
    onOpenChange,
    onSuccess,
    defaultAssignments,
    defaultTitle,
    defaultDate
}: LogProgressModalProps) {
    const [date, setDate] = useState<string>(defaultDate || new Date().toISOString().split('T')[0]);
    const [assignments, setAssignments] = useState<ProgressAssignment[]>([]);
    const [lessonNotes, setLessonNotes] = useState("");
    const [students, setStudents] = useState<StudentAttendance[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setDate(defaultDate || new Date().toISOString().split('T')[0]);
            setAssignments([...defaultAssignments]);
            setLessonNotes("");
            fetchStudents(defaultDate || new Date().toISOString().split('T')[0]);
        }
    }, [open, defaultAssignments, defaultDate]);

    // Refetch students when the date changes to see if they already have attendance
    useEffect(() => {
        if (open) {
            fetchStudents(date);
        }
    }, [date, open]);

    const fetchStudents = async (selectedDate: string) => {
        try {
            setLoading(true);
            const res = await fetch(`/api/classes/${classId}/attendance?date=${selectedDate}`);
            if (res.ok) {
                const data = await res.json();
                const formatted = data.students.map((s: any) => ({
                    id: s.studentId,
                    firstName: s.firstName,
                    lastName: s.lastName,
                    status: s.attendance ? s.attendance.status : 'present' // default to present if no record
                }));
                // Sort by first name
                formatted.sort((a: any, b: any) => a.firstName.localeCompare(b.firstName));
                setStudents(formatted);
            }
        } catch (e) {
            console.error("Failed to fetch students", e);
        } finally {
            setLoading(false);
        }
    };

    const handleAssignmentChange = (bookId: string, newPages: string) => {
        setAssignments(prev => prev.map(a =>
            a.bookId === bookId ? { ...a, pages: newPages } : a
        ));
    };

    const handleRemoveAssignment = (bookId: string) => {
        setAssignments(prev => prev.filter(a => a.bookId !== bookId));
    };

    const handleAttendanceChange = (studentId: string, status: AttendanceStatus) => {
        setStudents(prev => prev.map(s =>
            s.id === studentId ? { ...s, status } : s
        ));
    };

    const handleSave = async () => {
        try {
            setSaving(true);

            // 1. Save Progress (ignoring empty page assignments if they just wanted attendance)
            const validAssignments = assignments.filter(a => a.pages && a.pages.trim() !== "");

            if (validAssignments.length > 0) {
                const progressPayload = {
                    date,
                    lessonNotes,
                    assignments: validAssignments.map(a => ({ bookId: a.bookId, pages: a.pages }))
                };

                await fetch(`/api/classes/${classId}/progress/bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(progressPayload)
                });
            }

            // 2. Save Attendance
            if (students.length > 0) {
                const attendancePayload = {
                    date,
                    records: students.map(s => ({
                        studentId: s.id,
                        status: s.status,
                        notes: "" // Could add a notes field per student later if needed
                    }))
                };

                await fetch(`/api/classes/${classId}/attendance`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(attendancePayload)
                });
            }

            onSuccess();
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to save progress and attendance", error);
            alert("An error occurred while saving. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const getStatusIcon = (status: AttendanceStatus) => {
        switch (status) {
            case 'present': return <UserCheck className="w-5 h-5 text-green-500" />;
            case 'absent': return <UserX className="w-5 h-5 text-red-500" />;
            case 'late': return <UserMinus className="w-5 h-5 text-yellow-500" />;
            case 'excused': return <UserCheck className="w-5 h-5 text-blue-500" />;
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
                <DialogHeader>
                    <div className="px-6 py-4 border-b">
                        <DialogTitle className="text-xl text-blue-900">
                            {defaultTitle ? `Record Progress: ${defaultTitle}` : "Log Daily Progress & Attendance"}
                        </DialogTitle>
                        <DialogDescription>
                            Select the date, verify the completed pages, and mark student attendance.
                        </DialogDescription>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {/* Date Selection */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                        <Label className="text-blue-900 font-semibold flex items-center gap-2">
                            <Calendar className="w-4 h-4" /> Date of Class:
                        </Label>
                        <Input
                            type="date"
                            className="w-full sm:w-auto bg-white border-blue-200 focus-visible:ring-blue-500 h-11"
                            value={date}
                            max={new Date().toISOString().split('T')[0]} // Don't allow future dates initially to prevent mistakes
                            onChange={e => setDate(e.target.value)}
                        />
                    </div>

                    {/* Progress Section */}
                    <div className="space-y-4">
                        <h3 className="font-semibold text-lg text-gray-900 flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-blue-600" /> Books Completed
                        </h3>

                        {assignments.length === 0 ? (
                            <div className="text-center p-6 border-2 border-dashed rounded-lg text-gray-400">
                                No books assigned for this entry.
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {assignments.map(assignment => (
                                    <div key={assignment.bookId} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center p-3 sm:p-2 border rounded-lg bg-gray-50 focus-within:ring-2 focus-within:ring-blue-500">
                                        <div className="flex-1 font-medium text-gray-700 min-w-0 truncate">
                                            {assignment.title}
                                        </div>
                                        <div className="flex w-full sm:w-auto items-center gap-2">
                                            <Label className="text-xs text-gray-500 uppercase tracking-wide">Pages</Label>
                                            <Input
                                                value={assignment.pages}
                                                onChange={e => handleAssignmentChange(assignment.bookId, e.target.value)}
                                                className="w-full sm:w-32 bg-white"
                                                placeholder="e.g. 5-10"
                                            />
                                            <Button variant="ghost" size="icon" className="text-gray-400 hover:text-red-500 hover:bg-red-50 w-10 h-10 shrink-0" onClick={() => handleRemoveAssignment(assignment.bookId)}>
                                                <UserX className="w-4 h-4" /> {/* Consider replacing with an X or Trash icon if preferred */}
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label className="text-gray-700">Class Notes (Optional)</Label>
                            <Textarea
                                placeholder="What went well? Any issues?"
                                value={lessonNotes}
                                onChange={e => setLessonNotes(e.target.value)}
                                className="resize-none"
                                rows={2}
                            />
                        </div>
                    </div>

                    {/* Attendance Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-lg text-gray-900 flex items-center gap-2">
                                <UserCheck className="w-5 h-5 text-green-600" /> Overall Attendance
                            </h3>
                            <div className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                                {students.filter(s => s.status === 'present').length} / {students.length} Present
                            </div>
                        </div>

                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                            </div>
                        ) : students.length === 0 ? (
                            <div className="text-center p-6 border rounded-lg text-gray-500 bg-gray-50">
                                No students enrolled in this class.
                            </div>
                        ) : (
                            <div className="grid sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-2">
                                {students.map((student) => {
                                    const isAbsent = student.status === 'absent';
                                    return (
                                        <div
                                            key={student.id}
                                            className={`flex items-center justify-between p-3 border rounded-xl transition-colors cursor-pointer select-none ${isAbsent ? 'bg-red-50 border-red-200' : 'bg-white hover:bg-gray-50'}`}
                                            onClick={() => handleAttendanceChange(student.id, isAbsent ? 'present' : 'absent')}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="shrink-0">
                                                    {getStatusIcon(student.status)}
                                                </div>
                                                <span className={`font-medium ${isAbsent ? 'text-red-900' : 'text-gray-900'}`}>
                                                    {student.firstName} {student.lastName}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-semibold uppercase ${isAbsent ? 'text-red-500' : 'text-green-600'}`}>
                                                    {isAbsent ? 'Absent' : 'Present'}
                                                </span>
                                                <Switch
                                                    checked={!isAbsent}
                                                    onCheckedChange={(checked) => handleAttendanceChange(student.id, checked ? 'present' : 'absent')}
                                                    className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500"
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                </div>

                <DialogFooter>
                    <div className="flex px-6 py-4 border-t bg-gray-50 w-full justify-end gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="w-full sm:w-auto h-11">
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 h-11">
                            {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                            Save Progress & Attendance
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
