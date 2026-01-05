"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    BookOpen,
    ChevronDown,
    ChevronUp,
    Plus,
    Loader2,
    Save,
    FileText,
    History,
    Calendar,
    BookMarked,
    Pencil,
    X,
    Library,
} from "lucide-react";
import { AssignBooksDialog } from "./assign-books-dialog";

interface AssignedBook {
    id: string;
    bookId: string;
    title: string;
    publisher: string | null;
    totalPages: number | null;
    subject: string | null;
    isCurrent: boolean;
}

interface ProgressEntry {
    id: string;
    bookId: string;
    date: string;
    pagesCompleted: string | null;
    lessonNotes: string | null;
    homeworkAssigned: string | null;
    bookTitle: string;
}

interface ProgressSectionProps {
    classId: string;
    className: string;
}

export function ProgressSection({ classId, className }: ProgressSectionProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [books, setBooks] = useState<AssignedBook[]>([]);
    const [progress, setProgress] = useState<ProgressEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [showAssignBooks, setShowAssignBooks] = useState(false);

    const [formData, setFormData] = useState({
        bookId: "",
        date: new Date().toISOString().split("T")[0],
        pagesCompleted: "",
        lessonNotes: "",
        homeworkAssigned: "",
    });

    useEffect(() => {
        if (isExpanded) {
            fetchData();
        }
    }, [isExpanded, classId]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [booksRes, progressRes] = await Promise.all([
                fetch(`/api/classes/${classId}/books`),
                fetch(`/api/classes/${classId}/progress?limit=10`),
            ]);

            if (booksRes.ok) {
                const booksData = await booksRes.json();
                setBooks(booksData.books || []);
                // Set default book if available
                if (booksData.books?.length > 0 && !formData.bookId) {
                    setFormData(prev => ({ ...prev, bookId: booksData.books[0].bookId }));
                }
            }

            if (progressRes.ok) {
                const progressData = await progressRes.json();
                setProgress(progressData.progress || []);
            }
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!formData.bookId) {
            alert("Please select a book");
            return;
        }

        setSaving(true);
        try {
            const response = await fetch(`/api/classes/${classId}/progress`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            if (response.ok) {
                await fetchData();
                setShowAddForm(false);
                // Reset form but keep the book selected
                setFormData(prev => ({
                    ...prev,
                    date: new Date().toISOString().split("T")[0],
                    pagesCompleted: "",
                    lessonNotes: "",
                    homeworkAssigned: "",
                }));
            } else {
                alert("Failed to save progress");
            }
        } catch (error) {
            console.error("Error saving progress:", error);
            alert("Failed to save progress");
        } finally {
            setSaving(false);
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

    const latestProgress = progress.length > 0 ? progress[0] : null;

    return (
        <Card className={`transition-all ${isExpanded ? '' : 'hover:bg-gray-50'}`}>
            {/* Compact Header */}
            <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <BookMarked className="w-5 h-5 text-gray-600" />
                    <div>
                        <h3 className="font-medium">Class Progress</h3>
                        {latestProgress ? (
                            <p className="text-sm text-gray-500">
                                Last: {latestProgress.bookTitle} - pg {latestProgress.pagesCompleted || "?"} ({formatDate(latestProgress.date)})
                            </p>
                        ) : (
                            <p className="text-sm text-gray-500">No progress recorded yet</p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {books.length > 0 && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                            {books.length} {books.length === 1 ? 'book' : 'books'}
                        </Badge>
                    )}

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsExpanded(true);
                            setShowAddForm(true);
                        }}
                    >
                        <Pencil className="w-4 h-4 mr-1" />
                        Record
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
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    ) : books.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p>No books assigned to this class yet.</p>
                            <p className="text-sm mt-1 mb-4">Add books to start tracking progress.</p>
                            <Button onClick={() => setShowAssignBooks(true)}>
                                <Library className="w-4 h-4 mr-2" />
                                Add Books
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4 pt-4">
                            {/* Book Buttons - Quick Entry */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-gray-600">Tap a book to log progress:</Label>
                                    <Button
                                        onClick={() => setShowAssignBooks(true)}
                                        variant="ghost"
                                        size="sm"
                                        className="text-gray-500"
                                    >
                                        <Library className="w-4 h-4 mr-1" />
                                        Manage
                                    </Button>
                                </div>

                                <div className="grid gap-2">
                                    {books.map((book) => {
                                        const isSelected = formData.bookId === book.bookId;
                                        return (
                                            <div key={book.bookId} className="space-y-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (isSelected) {
                                                            setFormData(prev => ({ ...prev, bookId: "" }));
                                                        } else {
                                                            setFormData(prev => ({ ...prev, bookId: book.bookId }));
                                                        }
                                                    }}
                                                    className={`
                                                        w-full p-3 rounded-lg border-2 text-left transition-all
                                                        ${isSelected
                                                            ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                                                            : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                                                        }
                                                    `}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <BookOpen className={`w-5 h-5 ${isSelected ? "text-blue-600" : "text-gray-400"}`} />
                                                            <span className={`font-medium ${isSelected ? "text-blue-900" : "text-gray-800"}`}>
                                                                {book.title}
                                                            </span>
                                                        </div>
                                                        {book.totalPages && (
                                                            <span className="text-xs text-gray-400">
                                                                {book.totalPages} pg
                                                            </span>
                                                        )}
                                                    </div>
                                                </button>

                                                {/* Expanded input area when selected */}
                                                {isSelected && (
                                                    <div className="pl-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                                                        <div className="flex gap-2">
                                                            <div className="flex-1">
                                                                <Input
                                                                    placeholder="Pages (e.g., 15-18)"
                                                                    value={formData.pagesCompleted}
                                                                    onChange={(e) => setFormData(prev => ({ ...prev, pagesCompleted: e.target.value }))}
                                                                    className="bg-white"
                                                                    autoFocus
                                                                />
                                                            </div>
                                                            <Input
                                                                type="date"
                                                                value={formData.date}
                                                                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                                                                className="w-36 bg-white"
                                                            />
                                                        </div>

                                                        <Input
                                                            placeholder="Homework assigned (optional)"
                                                            value={formData.homeworkAssigned}
                                                            onChange={(e) => setFormData(prev => ({ ...prev, homeworkAssigned: e.target.value }))}
                                                            className="bg-white"
                                                        />

                                                        <div className="flex gap-2">
                                                            <Button
                                                                onClick={handleSave}
                                                                disabled={saving || !formData.pagesCompleted.trim()}
                                                                className="flex-1"
                                                            >
                                                                {saving ? (
                                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                                ) : (
                                                                    <Save className="w-4 h-4 mr-2" />
                                                                )}
                                                                Save
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                onClick={() => setFormData(prev => ({ ...prev, bookId: "" }))}
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Progress History */}
                            {progress.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="font-medium text-gray-700 flex items-center gap-2">
                                        <History className="w-4 h-4" />
                                        Recent Progress
                                    </h4>
                                    <div className="space-y-2">
                                        {progress.map((entry) => (
                                            <div
                                                key={entry.id}
                                                className="p-3 bg-gray-50 rounded-lg border text-sm"
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <Calendar className="w-3 h-3 text-gray-400" />
                                                        <span className="font-medium">{formatDate(entry.date)}</span>
                                                    </div>
                                                    <Badge variant="outline" className="text-xs">
                                                        {entry.bookTitle}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-4 text-gray-600">
                                                    {entry.pagesCompleted && (
                                                        <span className="flex items-center gap-1">
                                                            <FileText className="w-3 h-3" />
                                                            Pages {entry.pagesCompleted}
                                                        </span>
                                                    )}
                                                </div>
                                                {entry.lessonNotes && (
                                                    <p className="text-gray-500 mt-1 text-xs">{entry.lessonNotes}</p>
                                                )}
                                                {entry.homeworkAssigned && (
                                                    <p className="text-blue-600 mt-1 text-xs">
                                                        📝 HW: {entry.homeworkAssigned}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            )}

            {/* Assign Books Dialog */}
            <AssignBooksDialog
                classId={classId}
                open={showAssignBooks}
                onOpenChange={setShowAssignBooks}
                onBooksChanged={fetchData}
                assignedBooks={books}
            />
        </Card>
    );
}
