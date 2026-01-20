"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
    BookOpen,
    Plus,
    Check,
    Loader2,
    Search,
    X,
    Archive,
    RotateCcw,
    ChevronDown,
    ChevronUp,
} from "lucide-react";

interface Book {
    id: string;
    title: string;
    publisher: string | null;
    totalPages: number | null;
    subject: string | null;
    gradeLevels: number[] | null;
}

interface AssignedBook {
    id: string;
    bookId: string;
    title: string;
    publisher: string | null;
    totalPages: number | null;
    subject: string | null;
    isCurrent: boolean;
}

interface AssignBooksDialogProps {
    classId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onBooksChanged: () => void;
    assignedBooks: AssignedBook[];
}

export function AssignBooksDialog({
    classId,
    open,
    onOpenChange,
    onBooksChanged,
    assignedBooks
}: AssignBooksDialogProps) {
    const [allBooks, setAllBooks] = useState<Book[]>([]);
    const [loading, setLoading] = useState(true);
    const [assigning, setAssigning] = useState<string | null>(null);
    const [togglingArchive, setTogglingArchive] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [showArchived, setShowArchived] = useState(false);

    useEffect(() => {
        if (open) {
            fetchBooks();
        }
    }, [open]);

    const fetchBooks = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/books?activeOnly=true");
            if (response.ok) {
                const data = await response.json();
                setAllBooks(data.books || []);
            }
        } catch (error) {
            console.error("Error fetching books:", error);
        } finally {
            setLoading(false);
        }
    };

    const assignedBookIds = new Set(assignedBooks.map(b => b.bookId));

    const handleAssign = async (bookId: string) => {
        setAssigning(bookId);
        try {
            const response = await fetch(`/api/classes/${classId}/books`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bookId }),
            });

            if (response.ok) {
                onBooksChanged();
            } else {
                alert("Failed to assign book");
            }
        } catch (error) {
            console.error("Error assigning book:", error);
            alert("Failed to assign book");
        } finally {
            setAssigning(null);
        }
    };

    const handleToggleArchive = async (bookId: string, currentIsCurrent: boolean) => {
        setTogglingArchive(bookId);
        try {
            const response = await fetch(`/api/classes/${classId}/books`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bookId, isCurrent: !currentIsCurrent }),
            });

            if (response.ok) {
                onBooksChanged();
            } else {
                alert("Failed to update book status");
            }
        } catch (error) {
            console.error("Error updating book status:", error);
            alert("Failed to update book status");
        } finally {
            setTogglingArchive(null);
        }
    };

    const filteredBooks = allBooks.filter(book =>
        book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.subject?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const availableBooks = filteredBooks.filter(b => !assignedBookIds.has(b.id));

    // Split assigned books into current and archived
    const currentBooks = assignedBooks.filter(b => b.isCurrent);
    const archivedBooks = assignedBooks.filter(b => !b.isCurrent);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5" />
                        Manage Class Books
                    </DialogTitle>
                    <DialogDescription>
                        Assign, archive, and restore books for this class
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                            placeholder="Search books..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    ) : allBooks.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p>No books available yet.</p>
                            <p className="text-sm">Ask your admin to add books first.</p>
                        </div>
                    ) : (
                        <>
                            {/* Current Books - Active */}
                            {currentBooks.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                        <Check className="w-4 h-4 text-green-600" />
                                        Current Books ({currentBooks.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {currentBooks.map((book) => (
                                            <div
                                                key={book.bookId}
                                                className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-gray-900 truncate">{book.title}</p>
                                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                                        {book.subject && <span>{book.subject}</span>}
                                                        {book.totalPages && <span>• {book.totalPages} pages</span>}
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200"
                                                    onClick={() => handleToggleArchive(book.bookId, true)}
                                                    disabled={togglingArchive === book.bookId}
                                                >
                                                    {togglingArchive === book.bookId ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <Archive className="w-4 h-4 mr-1" />
                                                            Archive
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Archived Books - Collapsible */}
                            {archivedBooks.length > 0 && (
                                <div className="space-y-2">
                                    <button
                                        className="text-sm font-medium text-gray-500 flex items-center gap-2 hover:text-gray-700"
                                        onClick={() => setShowArchived(!showArchived)}
                                    >
                                        <Archive className="w-4 h-4" />
                                        Archived Books ({archivedBooks.length})
                                        {showArchived ? (
                                            <ChevronUp className="w-4 h-4" />
                                        ) : (
                                            <ChevronDown className="w-4 h-4" />
                                        )}
                                    </button>
                                    {showArchived && (
                                        <div className="space-y-2">
                                            {archivedBooks.map((book) => (
                                                <div
                                                    key={book.bookId}
                                                    className="flex items-center justify-between p-3 bg-gray-100 border border-gray-200 rounded-lg opacity-75"
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium text-gray-600 truncate">{book.title}</p>
                                                        <div className="flex items-center gap-2 text-xs text-gray-400">
                                                            {book.subject && <span>{book.subject}</span>}
                                                            {book.totalPages && <span>• {book.totalPages} pages</span>}
                                                        </div>
                                                    </div>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                                                        onClick={() => handleToggleArchive(book.bookId, false)}
                                                        disabled={togglingArchive === book.bookId}
                                                    >
                                                        {togglingArchive === book.bookId ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <>
                                                                <RotateCcw className="w-4 h-4 mr-1" />
                                                                Restore
                                                            </>
                                                        )}
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Available Books */}
                            {availableBooks.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="text-sm font-medium text-gray-700">
                                        Available books ({availableBooks.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {availableBooks.map((book) => (
                                            <div
                                                key={book.id}
                                                className="flex items-center justify-between p-3 bg-gray-50 border rounded-lg hover:bg-gray-100 transition-colors"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-gray-900 truncate">{book.title}</p>
                                                    <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                                                        {book.publisher && <span>{book.publisher}</span>}
                                                        {book.subject && <span>• {book.subject}</span>}
                                                        {book.totalPages && <span>• {book.totalPages} pages</span>}
                                                        {book.gradeLevels && book.gradeLevels.length > 0 && (
                                                            <span>• Grades {book.gradeLevels.join(", ")}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleAssign(book.id)}
                                                    disabled={assigning === book.id}
                                                >
                                                    {assigning === book.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <Plus className="w-4 h-4 mr-1" />
                                                            Add
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {filteredBooks.length === 0 && searchQuery && (
                                <div className="text-center py-6 text-gray-500">
                                    No books match "{searchQuery}"
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="flex justify-end pt-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        <X className="w-4 h-4 mr-2" />
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
