"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BookOpen, Calendar, CheckCircle2, Loader2, Save, X, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";



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
    assignedBooks: { bookId: string; title: string; }[];
}

export function LogProgressModal({
    classId,
    open,
    onOpenChange,
    onSuccess,
    defaultAssignments,
    defaultTitle,
    defaultDate,
    assignedBooks
}: LogProgressModalProps) {
    const [date, setDate] = useState<string>(defaultDate || new Date().toISOString().split('T')[0]);
    const [assignments, setAssignments] = useState<ProgressAssignment[]>([]);
    const [lessonNotes, setLessonNotes] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setDate(defaultDate || new Date().toISOString().split('T')[0]);
            // other resets are handled by the date-change effect below
        }
    }, [open, defaultDate]);

    useEffect(() => {
        if (!open) return;

        let isMounted = true;

        const loadProgress = async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/classes/${classId}/progress?startDate=${date}&endDate=${date}`);
                if (res.ok && isMounted) {
                    const data = await res.json();

                    if (data.progress && data.progress.length > 0) {
                        const existingData = data.progress;
                        setLessonNotes(existingData.find((p: any) => p.lessonNotes)?.lessonNotes || "");

                        // Start with defaults, then merge existing
                        const mergedAssignments = [...defaultAssignments];

                        existingData.forEach((p: any) => {
                            const idx = mergedAssignments.findIndex(a => a.bookId === p.bookId);
                            if (idx >= 0) {
                                mergedAssignments[idx].pages = p.pagesCompleted || "";
                            } else {
                                mergedAssignments.push({
                                    bookId: p.bookId,
                                    title: p.bookTitle,
                                    pages: p.pagesCompleted || ""
                                });
                            }
                        });
                        setAssignments(mergedAssignments);
                    } else {
                        // Reset to defaults if no DB data
                        setAssignments([...defaultAssignments]);
                        setLessonNotes("");
                    }
                }
            } catch (error) {
                console.error("Failed to load existing progress", error);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadProgress();

        return () => { isMounted = false; };
    }, [date, classId, open, defaultAssignments]);

    const handleAssignmentChange = (bookId: string, newPages: string) => {
        setAssignments(prev => prev.map(a =>
            a.bookId === bookId ? { ...a, pages: newPages } : a
        ));
    };

    const handleRemoveAssignment = (bookId: string) => {
        setAssignments(prev => prev.filter(a => a.bookId !== bookId));
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

            onSuccess();
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to save progress and attendance", error);
            alert("An error occurred while saving. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
                <DialogHeader>
                    <div className="px-6 py-4 border-b">
                        <div className="text-xl text-blue-900 font-semibold mb-1">
                            <DialogTitle>
                                {defaultTitle ? `Record Progress: ${defaultTitle}` : "Log Daily Progress & Attendance"}
                            </DialogTitle>
                        </div>
                        <DialogDescription>
                            Select the date and verify the completed pages for the assignment.
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
                                                <X className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Add Another Book Dropdown */}
                        <div className="pt-2 flex flex-col sm:flex-row gap-2">
                            <Select
                                onValueChange={(selectedBookId) => {
                                    if (selectedBookId) {
                                        const book = assignedBooks.find(b => b.bookId === selectedBookId);
                                        if (book && !assignments.some(a => a.bookId === selectedBookId)) {
                                            setAssignments(prev => [...prev, { bookId: book.bookId, title: book.title, pages: "" }]);
                                        }
                                    }
                                }}
                                value=""
                            >
                                <SelectTrigger className="w-full sm:w-[280px] bg-white border-dashed border-2 text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors">
                                    <SelectValue placeholder="+ Add an extra assigned book..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {assignedBooks.filter(b => !assignments.some(a => a.bookId === b.bookId)).map(b => (
                                        <SelectItem key={b.bookId} value={b.bookId}>
                                            {b.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

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

                </div>

                <DialogFooter>
                    <div className="flex px-6 py-4 border-t bg-gray-50 w-full justify-end gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="w-full sm:w-auto h-11">
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 h-11">
                            {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                            Save Progress
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
