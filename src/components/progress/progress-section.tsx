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
    Trash2,
    Check
} from "lucide-react";
import { AssignBooksDialog } from "./assign-books-dialog";
import { SyllabusManager } from "./syllabus-manager";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
    const [isExpanded, setIsExpanded] = useState(true); // Auto-expand on load
    const [books, setBooks] = useState<AssignedBook[]>([]);
    const [progress, setProgress] = useState<ProgressEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [showAssignBooks, setShowAssignBooks] = useState(false);
    const [showHistory, setShowHistory] = useState(false); // Default to minimized

    const [showSyllabusManager, setShowSyllabusManager] = useState(false);
    const [syllabusWeeks, setSyllabusWeeks] = useState<any[]>([]);
    const [syllabusUrl, setSyllabusUrl] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'manual' | 'syllabus'>('syllabus');

    const [formData, setFormData] = useState({
        bookId: "",
        date: new Date().toISOString().split("T")[0],
        pagesCompleted: "",
        lessonNotes: "",
        homeworkAssigned: "",
    });

    useEffect(() => {
        // Load data on mount and when classId changes
        fetchData();
    }, [classId]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [booksRes, progressRes, syllabusRes] = await Promise.all([
                fetch(`/api/classes/${classId}/books`),
                fetch(`/api/classes/${classId}/progress?limit=10`),
                fetch(`/api/classes/${classId}/syllabus`),
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

            if (syllabusRes.ok) {
                const syllabusData = await syllabusRes.json();
                setSyllabusWeeks(syllabusData.weeks || []);
                setSyllabusUrl(syllabusData.syllabusUrl || null);
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

    const updateSyllabusAssignment = async (week: any, bookId: string, newPages: string | null) => {
        try {
            setSaving(true);
            const newAssignments = newPages === null
                ? week.assignments.filter((a: any) => a.bookId !== bookId)
                : week.assignments.map((a: any) => a.bookId === bookId ? { ...a, pages: newPages } : a);

            const payload = {
                weekNumber: week.weekNumber,
                title: week.title,
                startDate: week.startDate,
                endDate: week.endDate,
                assignments: newAssignments
            };

            const res = await fetch(`/api/classes/${classId}/syllabus/weeks/${week.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                await fetchData();
            } else {
                alert("Failed to update assignment");
            }
        } catch (e) {
            console.error(e);
            alert("Error saving assignment");
        } finally {
            setSaving(false);
        }
    };

    const handleLogWeek = async (week: any) => {
        if (!confirm(`Record progress for all assigned books safely to ${week.title}?`)) return;
        setSaving(true);
        try {
            const today = new Date().toISOString().split("T")[0];
            const response = await fetch(`/api/classes/${classId}/progress/bulk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    date: today,
                    lessonNotes: `Completed ${week.title}`,
                    assignments: week.assignments
                }),
            });

            if (response.ok) {
                await fetchData();
            } else {
                alert("Failed to save progress");
            }
        } catch (error) {
            console.error("Error saving bulk progress:", error);
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

    // Keep track of the currently selected week
    const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);

    // Filter to only show current (non-archived) books
    const currentBooks = books.filter(b => b.isCurrent);

    const latestProgress = progress.length > 0 ? progress[0] : null;

    // Determine which weeks to show
    const displayedWeeks = selectedWeekId
        ? syllabusWeeks.filter(w => w.id === selectedWeekId)
        : syllabusWeeks.slice(0, 1); // Default to showing the first week if none selected but weeks exist

    // Auto-select the first week when syllabus weeks load
    useEffect(() => {
        if (syllabusWeeks.length > 0 && !selectedWeekId) {
            setSelectedWeekId(syllabusWeeks[0].id);
        }
    }, [syllabusWeeks, selectedWeekId]);

    return (
        <Card className={`transition-all ${isExpanded ? '' : 'hover:bg-gray-50'}`}>
            {/* ... Compact Header (unchanged) ... */}
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
                    {currentBooks.length > 0 && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                            {currentBooks.length} {currentBooks.length === 1 ? 'book' : 'books'}
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
                    ) : currentBooks.length === 0 ? (
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
                            <div className="flex border-b mb-4">
                                <button
                                    className={`px-4 py-2 text-sm font-medium transition-colors ${viewMode === 'syllabus' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                    onClick={() => setViewMode('syllabus')}
                                >
                                    Syllabus Plan View
                                </button>
                                <button
                                    className={`px-4 py-2 text-sm font-medium transition-colors ${viewMode === 'manual' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                    onClick={() => setViewMode('manual')}
                                >
                                    Manual Book Entry
                                </button>
                            </div>

                            {viewMode === 'syllabus' && (
                                <div className="space-y-4 mb-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Label className="text-gray-600 font-medium">Select Week:</Label>
                                            {!showSyllabusManager && syllabusWeeks.length > 0 && (
                                                <select
                                                    className="w-56 h-12 rounded-md border border-input bg-transparent px-4 py-2 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                                                    value={selectedWeekId || ""}
                                                    onChange={e => setSelectedWeekId(e.target.value)}
                                                >
                                                    {syllabusWeeks.map(w => (
                                                        <option key={w.id} value={w.id}>{w.title || `Week ${w.weekNumber}`}</option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                        <Button
                                            onClick={() => setShowSyllabusManager(!showSyllabusManager)}
                                            variant={showSyllabusManager ? "secondary" : "ghost"}
                                            size="sm"
                                            className={showSyllabusManager ? "" : "text-gray-500"}
                                        >
                                            <FileText className="w-4 h-4 mr-2" />
                                            {showSyllabusManager ? "Close Manager" : "Manage Syllabus"}
                                        </Button>
                                    </div>

                                    {showSyllabusManager && (
                                        <div className="bg-gray-50 p-4 rounded-xl border-2 border-dashed mt-2 mb-6">
                                            <SyllabusManager classId={classId} assignedBooks={currentBooks} onSyllabusUpdated={fetchData} />
                                        </div>
                                    )}

                                    {!showSyllabusManager && syllabusWeeks.length === 0 ? (
                                        <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed">
                                            <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                            <p className="text-gray-500 text-sm">No syllabus weeks have been set up yet.</p>
                                            <Button variant="link" onClick={() => setShowSyllabusManager(true)} className="mt-1">
                                                Set up Syllabus Weekly Plan
                                            </Button>
                                        </div>
                                    ) : !showSyllabusManager && (
                                        <div className="space-y-3">
                                            {displayedWeeks.map(week => (
                                                <div key={week.id} className="border border-gray-200 bg-white rounded-lg p-3 hover:border-blue-300 transition-colors shadow-sm">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <h4 className="font-semibold text-blue-900 text-lg">{week.title || `Week ${week.weekNumber}`}</h4>
                                                        <Button
                                                            size="lg"
                                                            onClick={() => handleLogWeek(week)}
                                                            disabled={saving || week.assignments.length === 0}
                                                            className="bg-blue-600 hover:bg-blue-700 text-white min-h-[44px]"
                                                        >
                                                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <span className="text-base">Record Quick Day/Week</span>}
                                                        </Button>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {week.assignments.length > 0 ? week.assignments.map((a: any) => {
                                                            const book = currentBooks.find(b => b.bookId === a.bookId);
                                                            if (!book) return null;
                                                            return (
                                                                <EditableAssignmentBadge
                                                                    key={a.bookId}
                                                                    assignment={a}
                                                                    book={book}
                                                                    week={week}
                                                                    onUpdate={updateSyllabusAssignment}
                                                                    isSaving={saving}
                                                                />
                                                            );
                                                        }) : (
                                                            <span className="text-xs text-gray-400 italic">No assignments for this week.</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {viewMode === 'manual' && (
                                <div className="space-y-4 mb-6 animate-in fade-in duration-300">
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
                                        {currentBooks.map((book) => {
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
                                                        w-full p-4 md:p-3 rounded-xl border-2 text-left transition-all min-h-[56px]
                                                        ${isSelected
                                                                ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                                                                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 flex items-center"
                                                            }
                                                    `}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <BookOpen className={`w-6 h-6 md:w-5 md:h-5 ${isSelected ? "text-blue-600" : "text-gray-400"}`} />
                                                                <span className={`font-medium text-lg md:text-base ${isSelected ? "text-blue-900" : "text-gray-800"}`}>
                                                                    {book.title}
                                                                </span>
                                                            </div>
                                                            {book.totalPages && (
                                                                <span className="text-sm md:text-xs text-gray-500">
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

                                                            <Textarea
                                                                placeholder="Class notes for today (optional)"
                                                                value={formData.lessonNotes}
                                                                onChange={(e) => setFormData(prev => ({ ...prev, lessonNotes: e.target.value }))}
                                                                className="bg-white"
                                                                rows={2}
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
                            )}

                            {/* Progress History */}
                            {progress.length > 0 && (
                                <div className="space-y-2">
                                    <button
                                        className="w-full font-medium text-gray-700 flex items-center justify-between hover:text-gray-900 transition-colors"
                                        onClick={() => setShowHistory(!showHistory)}
                                    >
                                        <span className="flex items-center gap-2">
                                            <History className="w-4 h-4" />
                                            Recent Progress ({progress.length})
                                        </span>
                                        {showHistory ? (
                                            <ChevronUp className="w-4 h-4 text-gray-400" />
                                        ) : (
                                            <ChevronDown className="w-4 h-4 text-gray-400" />
                                        )}
                                    </button>
                                    {showHistory && (
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
                                                        <p className="text-gray-600 mt-1 text-xs">
                                                            📋 Notes: {entry.lessonNotes}
                                                        </p>
                                                    )}
                                                    {entry.homeworkAssigned && (
                                                        <p className="text-blue-600 mt-1 text-xs">
                                                            📝 HW: {entry.homeworkAssigned}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
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

function EditableAssignmentBadge({
    assignment,
    book,
    week,
    onUpdate,
    isSaving
}: {
    assignment: any,
    book: any,
    week: any,
    onUpdate: (week: any, bookId: string, pages: string | null) => Promise<void>,
    isSaving: boolean
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [pages, setPages] = useState(assignment.pages);

    const handleSave = async () => {
        await onUpdate(week, book.bookId, pages);
        setIsOpen(false);
    };

    const handleRemove = async () => {
        if (!confirm(`Remove ${book.title} from this week?`)) return;
        await onUpdate(week, book.bookId, null);
        setIsOpen(false);
    };

    return (
        <Popover open={isOpen} onOpenChange={(open) => {
            setIsOpen(open);
            if (open) setPages(assignment.pages);
        }}>
            <PopoverTrigger asChild>
                <Badge variant="secondary" className="cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200 font-normal transition-colors select-none px-4 py-2 text-sm sm:text-base min-h-[44px]">
                    <BookOpen className="w-4 h-4 mr-2" />
                    {book.title} <span className="font-semibold ml-2">Pg: {assignment.pages}</span>
                </Badge>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 shadow-lg border-blue-100" sideOffset={8}>
                <div className="space-y-3">
                    <div className="font-medium text-sm text-blue-900 border-b pb-1 truncate" title={book.title}>
                        {book.title}
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs text-gray-500">Edit Pages</Label>
                        <Input
                            value={pages}
                            onChange={e => setPages(e.target.value)}
                            className="h-8 text-sm"
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleSave();
                            }}
                            autoFocus
                        />
                    </div>
                    <div className="flex items-center justify-between pt-1">
                        <Button variant="ghost" size="sm" onClick={handleRemove} className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 px-2" disabled={isSaving}>
                            <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                        </Button>
                        <Button size="sm" onClick={handleSave} className="h-8 px-3" disabled={isSaving || !pages.trim() || pages === assignment.pages}>
                            <Check className="w-3.5 h-3.5 mr-1" /> Save
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
