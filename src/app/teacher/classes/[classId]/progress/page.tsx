"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    ArrowLeft,
    BookOpen,
    CheckCircle2,
    Circle,
    Loader2,
    Plus,
    X,
    Calendar,
    FileText,
    Library,
    ChevronDown,
    BookMarked,
    GraduationCap,
} from "lucide-react";
import { AssignBooksDialog } from "@/components/progress/assign-books-dialog";
import { SyllabusManager } from "@/components/progress/syllabus-manager";
import { SpellingWordsSection } from "@/components/spelling/spelling-words-section";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface WeekBook {
    bookId: string;
    title: string;
    totalPages: number | null;
    publisher: string | null;
    subject: string | null;
    syllabusPages: string | null; // e.g. "4-7" from syllabus
    donePages: string[];            // pages already logged this week
}

interface SyllabusWeek {
    id: string;
    weekNumber: number;
    title: string | null;
    startDate: string | null;
    endDate: string | null;
}

interface AssignedBook {
    bookId: string;
    title: string;
    totalPages: number | null;
    isCurrent: boolean;
}

interface WeekData {
    week: SyllabusWeek | null;
    books: WeekBook[];
    allWeeks: SyllabusWeek[];
    assignedBooks: AssignedBook[];
}

// Parse a page range string into individual page ranges for display
// e.g. "4-7, 10-12, 15" → ["4-7", "10-12", "15"]
function parsePageRanges(pages: string | null): string[] {
    if (!pages || !pages.trim()) return [];
    return pages
        .split(",")
        .map(p => p.trim())
        .filter(Boolean);
}

// Extra pages added by the teacher for a book (not from syllabus)
interface ExtraPage {
    bookId: string;
    pages: string;
    id: string; // local key
}

export default function ClassProgressPage() {
    const router = useRouter();
    const params = useParams();
    const classId = params.classId as string;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null); // bookId+pages being saved
    const [weekData, setWeekData] = useState<WeekData>({
        week: null,
        books: [],
        allWeeks: [],
        assignedBooks: [],
    });
    const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
    const [className, setClassName] = useState<string>("");

    // Local "done" state for instant UI feedback before API confirms
    const [locallyDone, setLocallyDone] = useState<Record<string, boolean>>({}); // key: bookId+"|"+pages

    // Extra pages teacher has added for this session (not from syllabus)
    const [extraPages, setExtraPages] = useState<ExtraPage[]>([]);
    const [addingPagesForBook, setAddingPagesForBook] = useState<string | null>(null);
    const [newPagesInput, setNewPagesInput] = useState("");

    // Show syllabus manager
    const [showSyllabusManager, setShowSyllabusManager] = useState(false);
    const [showAssignBooks, setShowAssignBooks] = useState(false);

    // Fetch class name
    useEffect(() => {
        if (!classId) return;
        fetch(`/api/teacher/classes/${classId}`)
            .then(r => r.json())
            .then(d => setClassName(d.class?.name || ""))
            .catch(() => { });
    }, [classId]);

    const fetchWeekData = useCallback(async (weekId?: string) => {
        try {
            setLoading(true);
            const url = `/api/classes/${classId}/progress/week${weekId ? `?weekId=${weekId}` : ""}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setWeekData(data);
                // Set selected week from API response
                if (data.week) {
                    setSelectedWeekId(data.week.id);
                }
                // Reset local done state when week changes
                setLocallyDone({});
                setExtraPages([]);
            }
        } catch (e) {
            console.error("Failed to fetch week data", e);
        } finally {
            setLoading(false);
        }
    }, [classId]);

    useEffect(() => {
        fetchWeekData();
    }, [fetchWeekData]);

    const handleWeekChange = (weekId: string) => {
        setSelectedWeekId(weekId);
        fetchWeekData(weekId);
    };

    const doneKey = (bookId: string, pages: string) => `${bookId}|${pages}`;

    const isPageDone = (book: WeekBook, pages: string): boolean => {
        const key = doneKey(book.bookId, pages);
        if (locallyDone[key]) return true;
        // Check if pages string is in the book's donePages from API
        return book.donePages.some(dp => dp === pages);
    };

    const handleMarkDone = async (bookId: string, pages: string, bookTitle: string) => {
        const key = doneKey(bookId, pages);
        // Optimistic update
        setLocallyDone(prev => ({ ...prev, [key]: true }));
        setSaving(key);

        try {
            const today = new Date().toISOString().split("T")[0];

            // Use single-record POST so we don't accidentally delete other books'
            // progress for the same day (the bulk endpoint deletes records for
            // books absent from the payload).
            const res = await fetch(`/api/classes/${classId}/progress`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    bookId,
                    date: today,
                    pagesCompleted: pages,
                }),
            });

            if (!res.ok) {
                setLocallyDone(prev => {
                    const next = { ...prev };
                    delete next[key];
                    return next;
                });
                alert("Failed to save progress. Please try again.");
            }
        } catch (e) {
            setLocallyDone(prev => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
            console.error("Error saving progress", e);
        } finally {
            setSaving(null);
        }
    };

    const handleAddExtraPages = (bookId: string) => {
        const trimmed = newPagesInput.trim();
        if (!trimmed) return;
        setExtraPages(prev => [
            ...prev,
            { bookId, pages: trimmed, id: `${bookId}-${Date.now()}` },
        ]);
        setNewPagesInput("");
        setAddingPagesForBook(null);
    };

    const handleRemoveExtraPages = (id: string) => {
        setExtraPages(prev => prev.filter(ep => ep.id !== id));
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    };

    const weekLabel = weekData.week
        ? (weekData.week.title || `Week ${weekData.week.weekNumber}`)
        : "No Week";

    const weekDateRange = weekData.week?.startDate && weekData.week?.endDate
        ? `${formatDate(weekData.week.startDate)} – ${formatDate(weekData.week.endDate)}`
        : "";

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white shadow-sm border-b sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => router.push(`/teacher/classes/${classId}`)}
                            >
                                <ArrowLeft className="w-4 h-4 mr-1" />
                                Back to Class
                            </Button>
                            <div>
                                <div className="flex items-center gap-2">
                                    <BookMarked className="w-5 h-5 text-blue-600" />
                                    <h1 className="text-xl font-bold text-gray-900">
                                        {className ? `${className} — ` : ""}Class Progress
                                    </h1>
                                </div>
                                {weekDateRange && (
                                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {weekDateRange}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Week selector */}
                            {weekData.allWeeks.length > 0 && (
                                <Select value={selectedWeekId || ""} onValueChange={handleWeekChange}>
                                    <SelectTrigger className="w-48 h-9 text-sm">
                                        <SelectValue placeholder="Select week" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {weekData.allWeeks.map(w => (
                                            <SelectItem key={w.id} value={w.id}>
                                                {w.title || `Week ${w.weekNumber}`}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowAssignBooks(true)}
                            >
                                <Library className="w-4 h-4 mr-1" />
                                Manage Books
                            </Button>
                            <Button
                                variant={showSyllabusManager ? "secondary" : "outline"}
                                size="sm"
                                onClick={() => setShowSyllabusManager(v => !v)}
                            >
                                <FileText className="w-4 h-4 mr-1" />
                                {showSyllabusManager ? "Close Syllabus" : "Manage Syllabus"}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
                {/* Syllabus Manager (inline) */}
                {showSyllabusManager && (
                    <div className="bg-gray-50 p-4 rounded-xl border-2 border-dashed">
                        <SyllabusManager
                            classId={classId}
                            assignedBooks={(weekData.assignedBooks || []).map(b => ({
                                id: `cb-${b.bookId}`,
                                bookId: b.bookId,
                                title: b.title,
                                publisher: null,
                                totalPages: b.totalPages,
                                subject: null,
                                isCurrent: b.isCurrent,
                            }))}
                            onSyllabusUpdated={() => fetchWeekData(selectedWeekId || undefined)}
                        />
                    </div>
                )}

                {/* Large Week Title */}
                {weekData.week ? (
                    <div className="text-center py-2">
                        <div className="inline-flex flex-col items-center gap-1">
                            <span className="text-6xl font-black text-blue-700 tracking-tight leading-none">
                                {weekData.week.title || `Week ${weekData.week.weekNumber}`}
                            </span>
                            {weekDateRange && (
                                <span className="text-lg text-gray-500">{weekDateRange}</span>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-12 bg-white rounded-2xl border-2 border-dashed border-gray-200">
                        <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <h2 className="text-xl font-semibold text-gray-700 mb-1">No Syllabus Set Up</h2>
                        <p className="text-gray-500 mb-4">Set up your weekly syllabus to track class progress.</p>
                        <Button onClick={() => setShowSyllabusManager(true)}>
                            <FileText className="w-4 h-4 mr-2" />
                            Set Up Syllabus
                        </Button>
                    </div>
                )}

                {/* Books Section */}
                {weekData.week && (
                    <>
                        {weekData.books.length === 0 && extraPages.length === 0 ? (
                            <div className="text-center py-10 bg-white rounded-2xl border-2 border-dashed border-gray-200">
                                <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                <h2 className="text-lg font-semibold text-gray-700 mb-1">No books assigned this week</h2>
                                <p className="text-gray-500 mb-4 text-sm">Add books to the syllabus for this week, or assign books to the class.</p>
                                <div className="flex gap-2 justify-center">
                                    <Button variant="outline" onClick={() => setShowSyllabusManager(true)}>
                                        <FileText className="w-4 h-4 mr-1" />
                                        Edit Syllabus
                                    </Button>
                                    <Button variant="outline" onClick={() => setShowAssignBooks(true)}>
                                        <Library className="w-4 h-4 mr-1" />
                                        Assign Books
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                                {weekData.books.map(book => {
                                    const syllabusPageRanges = parsePageRanges(book.syllabusPages);
                                    const bookExtraPages = extraPages.filter(ep => ep.bookId === book.bookId);
                                    const allPageRanges = [
                                        ...syllabusPageRanges.map(p => ({ pages: p, isExtra: false, id: p })),
                                        ...bookExtraPages.map(ep => ({ pages: ep.pages, isExtra: true, id: ep.id })),
                                    ];

                                    return (
                                        <div
                                            key={book.bookId}
                                            className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
                                        >
                                            {/* Book header */}
                                            <div className="bg-blue-600 px-6 py-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <BookOpen className="w-6 h-6 text-white/80" />
                                                        <div>
                                                            <h2 className="text-xl font-bold text-white">{book.title}</h2>
                                                            <div className="flex items-center gap-3 mt-0.5">
                                                                {book.subject && (
                                                                    <span className="text-blue-200 text-sm">{book.subject}</span>
                                                                )}
                                                                {book.totalPages && (
                                                                    <span className="text-blue-200 text-sm">{book.totalPages} pages total</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {book.syllabusPages && (
                                                        <Badge className="bg-white/20 text-white border-white/30 text-sm">
                                                            Syllabus: pg {book.syllabusPages}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Page buttons */}
                                            <div className="px-6 py-5">
                                                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                                                    Pages to complete this week
                                                </p>

                                                {allPageRanges.length === 0 ? (
                                                    <p className="text-gray-400 text-sm italic">No pages assigned — add some below.</p>
                                                ) : (
                                                    <div className="flex flex-wrap gap-3">
                                                        {allPageRanges.map(({ pages, isExtra, id }) => {
                                                            const done = isPageDone(book, pages);
                                                            const isSavingThis = saving === doneKey(book.bookId, pages);

                                                            return (
                                                                <div key={id} className="relative group">
                                                                    <button
                                                                        disabled={done || isSavingThis}
                                                                        onClick={() => handleMarkDone(book.bookId, pages, book.title)}
                                                                        className={`
                                                                            flex items-center gap-2 px-6 py-4 rounded-xl border-2 text-lg font-bold
                                                                            transition-all duration-200 min-w-[100px] justify-center
                                                                            ${done
                                                                                ? "bg-green-50 border-green-300 text-green-700 cursor-default"
                                                                                : "bg-white border-blue-300 text-blue-800 hover:bg-blue-600 hover:text-white hover:border-blue-600 hover:shadow-lg active:scale-95 cursor-pointer"
                                                                            }
                                                                        `}
                                                                    >
                                                                        {isSavingThis ? (
                                                                            <Loader2 className="w-5 h-5 animate-spin" />
                                                                        ) : done ? (
                                                                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                                                                        ) : (
                                                                            <Circle className="w-5 h-5 opacity-40" />
                                                                        )}
                                                                        <span>pg {pages}</span>
                                                                    </button>
                                                                    {isExtra && (
                                                                        <button
                                                                            className="absolute -top-2 -right-2 w-5 h-5 bg-red-100 hover:bg-red-200 text-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                                            onClick={() => handleRemoveExtraPages(id)}
                                                                            title="Remove extra pages"
                                                                        >
                                                                            <X className="w-3 h-3" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* Add pages for this book */}
                                                <div className="mt-4">
                                                    {addingPagesForBook === book.bookId ? (
                                                        <div className="flex items-center gap-2">
                                                            <Input
                                                                value={newPagesInput}
                                                                onChange={e => setNewPagesInput(e.target.value)}
                                                                placeholder="e.g. 18-22 or 25"
                                                                className="w-48 h-9 text-sm"
                                                                autoFocus
                                                                onKeyDown={e => {
                                                                    if (e.key === "Enter") handleAddExtraPages(book.bookId);
                                                                    if (e.key === "Escape") {
                                                                        setAddingPagesForBook(null);
                                                                        setNewPagesInput("");
                                                                    }
                                                                }}
                                                            />
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleAddExtraPages(book.bookId)}
                                                                disabled={!newPagesInput.trim()}
                                                            >
                                                                Add
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => {
                                                                    setAddingPagesForBook(null);
                                                                    setNewPagesInput("");
                                                                }}
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                            onClick={() => {
                                                                setAddingPagesForBook(book.bookId);
                                                                setNewPagesInput("");
                                                            }}
                                                        >
                                                            <Plus className="w-4 h-4 mr-1" />
                                                            Add pages
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Add a book from class books that isn't in this week's syllabus */}
                        {(weekData.assignedBooks || []).length > weekData.books.length && (
                            <div className="pt-2">
                                <p className="text-sm text-gray-500 mb-2 font-medium">Add a book not yet in this week:</p>
                                <div className="flex flex-wrap gap-2">
                                    {(weekData.assignedBooks || [])
                                        .filter(ab => !weekData.books.some(wb => wb.bookId === ab.bookId))
                                        .map(ab => (
                                            <button
                                                key={ab.bookId}
                                                className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-600 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50 transition-all"
                                                onClick={() => {
                                                    // Add this book to extraPages with no pages to show the "add pages" input
                                                    setWeekData(prev => ({
                                                        ...prev,
                                                        books: [
                                                            ...prev.books,
                                                            {
                                                                bookId: ab.bookId,
                                                                title: ab.title,
                                                                totalPages: ab.totalPages,
                                                                publisher: null,
                                                                subject: null,
                                                                syllabusPages: null,
                                                                donePages: [],
                                                            }
                                                        ]
                                                    }));
                                                    setAddingPagesForBook(ab.bookId);
                                                }}
                                            >
                                                <Plus className="w-4 h-4" />
                                                {ab.title}
                                            </button>
                                        ))}
                                </div>
                            </div>
                        )}

                        {/* Spelling Words Section */}
                        {weekData.week && (
                            <div className="mt-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <GraduationCap className="w-5 h-5 text-purple-600" />
                                    <h2 className="text-lg font-bold text-gray-800">
                                        Spelling Words — {weekLabel}
                                    </h2>
                                    <Badge variant="outline" className="text-purple-700 border-purple-300 bg-purple-50">Weekly</Badge>
                                </div>
                                <SpellingWordsSection classId={classId} defaultExpanded={true} />
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Assign Books Dialog */}
            <AssignBooksDialog
                classId={classId}
                open={showAssignBooks}
                onOpenChange={setShowAssignBooks}
                onBooksChanged={() => fetchWeekData(selectedWeekId || undefined)}
                assignedBooks={(weekData.assignedBooks || []).map(b => ({
                    id: `cb-${b.bookId}`,
                    bookId: b.bookId,
                    title: b.title,
                    publisher: null,
                    totalPages: b.totalPages,
                    subject: null,
                    isCurrent: b.isCurrent,
                }))}
            />
        </div>
    );
}
